import { sessions, authCredits } from '@/common/schema.js'
import { eq } from 'drizzle-orm'
import { FastifyBaseLogger } from 'fastify'
import EventEmitter from 'events'
import { FastifyDatabase } from '@/types/common.js'
import { EvolutionClient } from './evolution-client.js'

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

  private clearPollTimer(sessionId: string) {
    const timer = this.pollTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      this.pollTimers.delete(sessionId)
    }
  }

  async start(sessionId: string) {
    this.clearPollTimer(sessionId)

    this.logger.info(`[ConnectionManager] Starting/checking session ${sessionId}`)

    // 1. Check existing connection state in Evolution API
    try {
      const stateRes = await this.client.getConnectionState(sessionId)
      const currentState = stateRes.instance?.state

      if (currentState === 'open') {
        const userJid = `${sessionId}@s.whatsapp.net`
        this.setState(sessionId, 'CONNECTED', userJid)
        this.lastQr.delete(sessionId)

        await this.db
          .update(sessions)
          .set({
            status: 'CONNECTED',
            jid: userJid,
            updatedAt: new Date(),
          })
          .where(eq(sessions.sessionId, sessionId))

        this.logger.info(`[ConnectionManager] Session ${sessionId} is connected (open)`)
        this.emit('ready', sessionId, userJid)
        return
      }
    } catch (err) {
      this.logger.warn(`[ConnectionManager] Error checking initial state for ${sessionId}: ${err}`)
    }

    // 2. Request connection / QR from Evolution API
    let connectRes = await this.client.connectInstance(sessionId)

    // If instance does not exist in Evolution API, create it and retry connect
    if (connectRes.error && connectRes.message?.toString().includes('does not exist')) {
      this.logger.info(`[ConnectionManager] Instance ${sessionId} does not exist, creating...`)
      await this.client.createInstance(sessionId)
      connectRes = await this.client.connectInstance(sessionId)
    }

    // Check if connected immediately
    if (connectRes.instance?.state === 'open') {
      const userJid = `${sessionId}@s.whatsapp.net`
      this.setState(sessionId, 'CONNECTED', userJid)
      this.lastQr.delete(sessionId)

      await this.db
        .update(sessions)
        .set({
          status: 'CONNECTED',
          jid: userJid,
          updatedAt: new Date(),
        })
        .where(eq(sessions.sessionId, sessionId))

      this.emit('ready', sessionId, userJid)
      return
    }

    // Handle QR code
    const qrString = connectRes.code || connectRes.base64
    if (qrString) {
      this.logger.info(`[ConnectionManager] QR Code received for session ${sessionId}`)
      this.lastQr.set(sessionId, qrString)
      this.setState(sessionId, 'SCANNING')
      await this.updateStatus(sessionId, 'SCANNING')
      this.emit('qr', sessionId, qrString)
    }

    // 3. Start polling for status changes (until open or timeout)
    const pollInterval = setInterval(async () => {
      try {
        const stateRes = await this.client.getConnectionState(sessionId)
        const state = stateRes.instance?.state

        if (state === 'open') {
          this.clearPollTimer(sessionId)
          const userJid = `${sessionId}@s.whatsapp.net`
          this.setState(sessionId, 'CONNECTED', userJid)
          this.lastQr.delete(sessionId)

          await this.db
            .update(sessions)
            .set({
              status: 'CONNECTED',
              jid: userJid,
              updatedAt: new Date(),
            })
            .where(eq(sessions.sessionId, sessionId))

          this.logger.info(
            `[ConnectionManager] Session ${sessionId} status changed to open via poll`,
          )
          this.emit('ready', sessionId, userJid)
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

  private async updateStatus(sessionId: string, status: string) {
    await this.db
      .update(sessions)
      .set({ status, updatedAt: new Date() })
      .where(eq(sessions.sessionId, sessionId))
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
