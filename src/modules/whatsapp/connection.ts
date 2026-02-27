import { makeWASocket, DisconnectReason, Browsers, WASocket } from '@whiskeysockets/baileys'
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

  // Set state
  private setState(sessionId: string, state: string, jid?: string) {
    this.states.set(sessionId, { state, jid })
  }

  // Start or restart session
  async start(sessionId: string) {
    // Load auth credentials from database
    const { state, saveCreds } = await usePostgresAuthState(this.db, sessionId)

    // Initialize WhatsApp socket
    const sock = makeWASocket({
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
        this.setState(sessionId, 'SCANNING')
        await this.updateStatus(sessionId, 'SCANNING')
        this.emit('qr', sessionId, qr)
      }

      if (connection === 'open') {
        const userJid = sock.user?.id
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
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
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
            return
          }

          this.logger.warn(`[WA] Session ${sessionId} disconnected. Reconnecting...`)
          this.setState(sessionId, 'RECONNECTING')
          await this.updateStatus(sessionId, 'RECONNECTING')
          this.start(sessionId)
        } else {
          this.logger.info(`[WA] Session ${sessionId} logged out. Cleaning up DB...`)
          await this.handleLogout(sessionId)
          this.sockets.delete(sessionId)
          this.states.delete(sessionId)
        }
      }
    })
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
    const sock = this.sockets.get(sessionId)
    if (sock) {
      sock.end(undefined)
      this.sockets.delete(sessionId)
    }
    await this.handleLogout(sessionId)
  }
}
