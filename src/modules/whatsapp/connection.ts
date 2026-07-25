import { sessions, authCredits } from '@/common/schema.js'
import { eq } from 'drizzle-orm'
import { FastifyBaseLogger } from 'fastify'
import EventEmitter from 'events'
import { FastifyDatabase } from '@/types/common.js'
import { EvolutionClient, extractQrFromResponse } from './evolution-client.js'

export class ConnectionManager extends EventEmitter {
  private db: FastifyDatabase
  private logger: FastifyBaseLogger
  private client: EvolutionClient
  private states: Map<string, { state: string; jid?: string }> = new Map()
  private lastQr: Map<string, string> = new Map()
  private pollTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(db: FastifyDatabase, logger: FastifyBaseLogger, client: EvolutionClient) {
    super()
    this.db = db
    this.logger = logger
    this.client = client
  }

  getClient(): EvolutionClient {
    return this.client
  }

  getState(sessionId: string) {
    return this.states.get(sessionId)
  }

  getLastQr(sessionId: string): string | undefined {
    return this.lastQr.get(sessionId)
  }

  private setState(sessionId: string, state: string, jid?: string) {
    this.states.set(sessionId, { state, jid })
  }

  clearPollTimer(sessionId: string) {
    const timer = this.pollTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      this.pollTimers.delete(sessionId)
    }
  }

  private async updateStatus(sessionId: string, status: string, jid?: string | null) {
    const updatePayload: { status: string; updatedAt: Date; jid?: string | null } = {
      status,
      updatedAt: new Date(),
    }
    if (jid !== undefined) {
      updatePayload.jid = jid
    }

    await this.db.update(sessions).set(updatePayload).where(eq(sessions.sessionId, sessionId))
  }

  private async getOwnerNumber(sessionId: string): Promise<string> {
    const owner = await this.client.getInstanceOwner(sessionId)
    return owner ? owner.split('@')[0] : sessionId
  }

  // Request QR Code from Evolution API and emit if available
  async requestQrAndConnect(sessionId: string): Promise<boolean> {
    try {
      let connectRes = await this.client.connectInstance(sessionId)

      // If instance does not exist in Evolution API, create it and retry connect
      if (connectRes.error && connectRes.message?.toString().includes('does not exist')) {
        this.logger.info(`[ConnectionManager] Instance ${sessionId} does not exist, creating...`)
        await this.client.createInstance(sessionId)
        connectRes = await this.client.connectInstance(sessionId)
      }

      if (connectRes.instance?.state === 'open') {
        const userJid = await this.getOwnerNumber(sessionId)
        this.setState(sessionId, 'CONNECTED', userJid)
        this.lastQr.delete(sessionId)
        await this.updateStatus(sessionId, 'CONNECTED', userJid)
        this.logger.info(`[ConnectionManager] Session ${sessionId} connected as ${userJid}`)
        this.emit('ready', sessionId, userJid)
        return true
      }

      const qrString = extractQrFromResponse(connectRes)
      if (qrString) {
        this.logger.info(`[ConnectionManager] QR Code received from Evolution API for ${sessionId}`)
        this.lastQr.set(sessionId, qrString)
        this.setState(sessionId, 'SCANNING')
        await this.updateStatus(sessionId, 'SCANNING')
        this.emit('qr', sessionId, qrString)
      }

      return false
    } catch (err) {
      this.logger.warn(`[ConnectionManager] Failed to request QR for ${sessionId}: ${err}`)
      return false
    }
  }

  // Helper alias for requesting fresh QR Code directly from Evolution API
  async requestFreshQr(sessionId: string): Promise<string | null> {
    this.lastQr.delete(sessionId)
    await this.requestQrAndConnect(sessionId)
    return this.getLastQr(sessionId) || null
  }

  // Sync all active sessions DB status with Evolution API in real-time
  async syncAllSessions() {
    try {
      const allSessions = await this.db.select().from(sessions)
      for (const session of allSessions) {
        if (session.status === 'CONNECTED') {
          const stateRes = await this.client.getConnectionState(session.sessionId)
          const currentState = stateRes.instance?.state
          const ownerNumber = await this.client.getInstanceOwner(session.sessionId)

          if (currentState !== 'open' || !ownerNumber) {
            this.logger.warn(
              `[ConnectionManager] Sync: Session ${session.sessionId} is unlinked (state=${currentState}, owner=${ownerNumber})`,
            )
            this.clearPollTimer(session.sessionId)
            this.setState(session.sessionId, 'DISCONNECTED')
            this.lastQr.delete(session.sessionId)
            await this.updateStatus(session.sessionId, 'DISCONNECTED', null)
            this.emit('close', session.sessionId)
          }
        }
      }
    } catch (err) {
      this.logger.warn(`[ConnectionManager] Error syncing all sessions: ${err}`)
    }
  }

  // Start health polling for an OPEN / CONNECTED session to detect logout/unlinking
  startConnectedPolling(sessionId: string) {
    this.clearPollTimer(sessionId)

    this.logger.info(
      `[ConnectionManager] Starting active health monitoring for connected session ${sessionId}`,
    )

    const pollInterval = setInterval(async () => {
      try {
        const stateRes = await this.client.getConnectionState(sessionId)
        const currentState = stateRes.instance?.state
        const ownerNumber = await this.client.getInstanceOwner(sessionId)

        if (currentState !== 'open' || !ownerNumber) {
          this.logger.warn(
            `[ConnectionManager] Session ${sessionId} unlinked / logged out on Evolution API (state=${currentState}, owner=${ownerNumber})`,
          )
          this.clearPollTimer(sessionId)
          this.setState(sessionId, 'DISCONNECTED')
          this.lastQr.delete(sessionId)

          await this.updateStatus(sessionId, 'DISCONNECTED', null)
          this.emit('close', sessionId)
        }
      } catch (err) {
        this.logger.error(
          err as Error,
          `[ConnectionManager] Health poll error for session ${sessionId}`,
        )
      }
    }, 5000)

    this.pollTimers.set(sessionId, pollInterval)
  }

  async start(sessionId: string) {
    this.clearPollTimer(sessionId)

    this.logger.info(`[ConnectionManager] Starting/checking session ${sessionId}`)

    // 1. Check existing connection state in Evolution API
    try {
      const stateRes = await this.client.getConnectionState(sessionId)
      const currentState = stateRes.instance?.state

      if (currentState === 'open') {
        const userJid = await this.getOwnerNumber(sessionId)
        this.setState(sessionId, 'CONNECTED', userJid)
        this.lastQr.delete(sessionId)

        await this.updateStatus(sessionId, 'CONNECTED', userJid)
        this.logger.info(`[ConnectionManager] Session ${sessionId} is connected as ${userJid}`)
        this.emit('ready', sessionId, userJid)

        // Monitor connected status actively to detect logout
        this.startConnectedPolling(sessionId)
        return
      }
    } catch (err) {
      this.logger.warn(`[ConnectionManager] Error checking initial state for ${sessionId}: ${err}`)
    }

    // 2. Request initial QR code from Evolution API
    const isConnectedNow = await this.requestQrAndConnect(sessionId)
    if (isConnectedNow) {
      this.startConnectedPolling(sessionId)
      return
    }

    // 3. Start scanning polling interval (every 3 seconds)
    // - Every tick checks if connection state turned 'open'
    // - Every 5 ticks (15 seconds), re-requests connectInstance to get a fresh, non-expired QR code
    let tickCount = 0
    const pollInterval = setInterval(async () => {
      tickCount++

      try {
        const stateRes = await this.client.getConnectionState(sessionId)
        const state = stateRes.instance?.state

        if (state === 'open') {
          this.clearPollTimer(sessionId)
          const userJid = await this.getOwnerNumber(sessionId)
          this.setState(sessionId, 'CONNECTED', userJid)
          this.lastQr.delete(sessionId)

          await this.updateStatus(sessionId, 'CONNECTED', userJid)
          this.logger.info(
            `[ConnectionManager] Session ${sessionId} status changed to open via poll (JID: ${userJid})`,
          )
          this.emit('ready', sessionId, userJid)

          // Switch to active health monitoring
          this.startConnectedPolling(sessionId)
          return
        }

        // Periodically refresh QR code every 15 seconds (5 ticks of 3s)
        if (tickCount % 5 === 0) {
          this.logger.info(
            `[ConnectionManager] Auto-refreshing QR Code for session ${sessionId} (tick #${tickCount})`,
          )
          const connected = await this.requestQrAndConnect(sessionId)
          if (connected) {
            this.startConnectedPolling(sessionId)
            return
          }
        }
      } catch (err) {
        this.logger.error(
          err as Error,
          `[ConnectionManager] Error polling connection state for ${sessionId}`,
        )
      }
    }, 3000)

    this.pollTimers.set(sessionId, pollInterval)
  }

  async deleteSession(sessionId: string) {
    this.clearPollTimer(sessionId)
    this.lastQr.delete(sessionId)
    this.states.delete(sessionId)

    try {
      await this.client.logoutInstance(sessionId)
    } catch (err) {
      this.logger.debug(`[ConnectionManager] Logout before delete error for ${sessionId}: ${err}`)
    }

    try {
      const res = await this.client.deleteInstance(sessionId)
      this.logger.info(
        `[ConnectionManager] Delete instance response for ${sessionId}: ${JSON.stringify(res)}`,
      )
    } catch (err) {
      this.logger.warn(`[ConnectionManager] Error deleting instance ${sessionId}: ${err}`)
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(authCredits).where(eq(authCredits.sessionId, sessionId))
      await tx
        .update(sessions)
        .set({ status: 'DISCONNECTED', jid: null, updatedAt: new Date() })
        .where(eq(sessions.sessionId, sessionId))
    })
  }
}
