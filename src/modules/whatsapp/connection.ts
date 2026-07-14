import {
  makeWASocket,
  DisconnectReason,
  Browsers,
  WASocket,
  WAVersion,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { sessions, authCredits } from '@/common/schema.js'
import { eq } from 'drizzle-orm'
import { usePostgresAuthState } from './auth-store.js'
import { FastifyBaseLogger } from 'fastify'
import EventEmitter from 'events'
import { FastifyDatabase } from '@/types/common.js'

export class ConnectionManager extends EventEmitter {
  private db: FastifyDatabase
  private logger: FastifyBaseLogger
  private sockets: Map<string, WASocket> = new Map()
  private states: Map<string, { state: string; jid?: string }> = new Map()

  // Cache WA version — fetch once, reuse on every reconnect
  private waVersion: WAVersion | null = null

  // Track reconnect attempts per session for exponential backoff
  private reconnectAttempts: Map<string, number> = new Map()
  // Pending reconnect timers — cleared on successful connect or new disconnect
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  // Last QR string per session — sent immediately to newly connected WS clients
  private lastQr: Map<string, string> = new Map()

  constructor(db: FastifyDatabase, logger: FastifyBaseLogger) {
    super()
    this.db = db
    this.logger = logger
  }

  // Get socket instance
  getSocket(sessionId: string) {
    return this.sockets.get(sessionId)
  }

  // Get current state
  getState(sessionId: string) {
    return this.states.get(sessionId)
  }

  // Get last QR string — used to push QR immediately to newly connected WS clients
  getLastQr(sessionId: string): string | undefined {
    return this.lastQr.get(sessionId)
  }

  // Set state
  private setState(sessionId: string, state: string, jid?: string) {
    this.states.set(sessionId, { state, jid })
  }

  // Fetch and cache WA version. Falls back to bundled Baileys version on error.
  private async getWaVersion(): Promise<WAVersion> {
    if (this.waVersion) return this.waVersion

    try {
      const { version, isLatest } = await fetchLatestWaWebVersion()
      this.waVersion = version
      this.logger.info(`[WA] Using WA Web version ${version.join('.')} (isLatest=${isLatest})`)
    } catch (err) {
      this.logger.warn('[WA] fetchLatestWaWebVersion failed, falling back to bundled version')
      const { version } = await fetchLatestBaileysVersion()
      this.waVersion = version
    }

    return this.waVersion!
  }

  // Start or restart session
  async start(sessionId: string) {
    // --- Cleanup existing socket before creating a new one ---
    const existingSock = this.sockets.get(sessionId)
    if (existingSock) {
      this.logger.debug(`[WA] Closing existing socket for ${sessionId} before restart`)
      existingSock.end(new Error('session_restart'))
      this.sockets.delete(sessionId)
    }

    // Load auth credentials from database
    const { state, saveCreds } = await usePostgresAuthState(this.db, sessionId)

    // Use cached version — avoids a slow HTTP fetch on every reconnect
    const version = await this.getWaVersion()

    // Initialize WhatsApp socket
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: process.env.WA_PRINT_QR_TERMINAL === 'true' || false,
      logger: this.logger,
      browser: Browsers[(process.env.WA_BROWSER_TYPE || 'ubuntu') as keyof typeof Browsers](
        process.env.WA_BROWSER_NAME || 'Chrome',
      ),
      syncFullHistory: process.env.WA_SYNC_FULL_HISTORY === 'true' || false,
      qrTimeout: Number(process.env.WA_QR_TIMEOUT) || 20000,
    })

    // Store socket in memory
    this.sockets.set(sessionId, sock)

    // Handle credentials updates
    sock.ev.on('creds.update', saveCreds)

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        this.logger.debug(`[WA] QR Generated for ${sessionId}`)
        // Cache QR string so new WS clients get it immediately
        this.lastQr.set(sessionId, qr)
        this.setState(sessionId, 'SCANNING')
        await this.updateStatus(sessionId, 'SCANNING')
        this.emit('qr', sessionId, qr)
      }

      if (connection === 'open') {
        const userJid = sock.user?.id

        // Reset reconnect state on successful connection
        this.reconnectAttempts.delete(sessionId)
        this._clearReconnectTimer(sessionId)

        // Clear cached QR — no longer needed once connected
        this.lastQr.delete(sessionId)

        this.setState(sessionId, 'CONNECTED', userJid)
        await this.db
          .update(sessions)
          .set({
            status: 'CONNECTED',
            jid: userJid,
            updatedAt: new Date(),
          })
          .where(eq(sessions.sessionId, sessionId))

        this.logger.info(`[WA] Session ${sessionId} connected as ${userJid}`)
        this.emit('ready', sessionId, userJid)
      } else if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        this.emit('close', sessionId, shouldReconnect)

        if (shouldReconnect) {
          // VALIDATION: Check if session/tenant still exists before reconnecting
          const [session] = await this.db
            .select()
            .from(sessions)
            .where(eq(sessions.sessionId, sessionId))
            .limit(1)

          if (!session) {
            this.logger.warn(`[WA] Session ${sessionId} not found in DB, stopping reconnect`)
            this.sockets.delete(sessionId)
            this.states.delete(sessionId)
            this.lastQr.delete(sessionId)
            return
          }

          // Cancel any pending reconnect timer before scheduling a new one
          this._clearReconnectTimer(sessionId)

          const attempt = (this.reconnectAttempts.get(sessionId) || 0) + 1
          // Exponential backoff: 2s → 4s → 8s → 16s → max 30s
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000)

          this.reconnectAttempts.set(sessionId, attempt)
          this.setState(sessionId, 'RECONNECTING')
          await this.updateStatus(sessionId, 'RECONNECTING')

          this.logger.warn(
            `[WA] Session ${sessionId} disconnected (code=${statusCode}). ` +
              `Reconnecting in ${delay}ms (attempt #${attempt})...`,
          )

          const timer = setTimeout(() => {
            this.reconnectTimers.delete(sessionId)
            this.start(sessionId)
          }, delay)

          this.reconnectTimers.set(sessionId, timer)
        } else {
          this.logger.info(`[WA] Session ${sessionId} logged out. Cleaning up DB...`)
          await this.handleLogout(sessionId)
          this.sockets.delete(sessionId)
          this.states.delete(sessionId)
          this.lastQr.delete(sessionId)
          this.reconnectAttempts.delete(sessionId)
          this._clearReconnectTimer(sessionId)
        }
      }
    })
  }

  // Clear a pending reconnect timer if one exists
  private _clearReconnectTimer(sessionId: string) {
    const timer = this.reconnectTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(sessionId)
    }
  }

  // Clean up session data on logout
  private async handleLogout(sessionId: string) {
    await this.db.transaction(async (tx) => {
      await tx.delete(authCredits).where(eq(authCredits.sessionId, sessionId))
      await tx
        .update(sessions)
        .set({ status: 'DISCONNECTED', jid: null, updatedAt: new Date() })
        .where(eq(sessions.sessionId, sessionId))
    })
  }

  // Update session status
  private async updateStatus(sessionId: string, status: string) {
    await this.db
      .update(sessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(sessions.sessionId, sessionId))
  }

  // Disconnect session manually
  async deleteSession(sessionId: string) {
    // Cancel pending reconnect before deleting
    this._clearReconnectTimer(sessionId)
    this.reconnectAttempts.delete(sessionId)
    this.lastQr.delete(sessionId)

    const sock = this.sockets.get(sessionId)
    if (sock) {
      sock.end(new Error('session_deleted'))
      this.sockets.delete(sessionId)
    }
    await this.handleLogout(sessionId)
  }
}
