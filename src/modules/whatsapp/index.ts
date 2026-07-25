import fp from 'fastify-plugin'
import { ConnectionManager } from './connection.js'
import { EvolutionClient } from './evolution-client.js'
import { messageLogs, sessions, tenants } from '@/common/schema.js'
import { FastifyRequest } from 'fastify'
import QRCode from 'qrcode'
import { Type } from '@sinclair/typebox'
import { FastifyTypebox } from '@/types/common.js'
import { eq } from 'drizzle-orm'
import { messageQueue } from './queue.js'
import { initWorker } from './worker.js'
import { WebSocket } from 'ws'

// Augment Fastify Instance Type
declare module 'fastify' {
  interface FastifyInstance {
    wa: ConnectionManager
  }
}

export default fp(async (fastify: FastifyTypebox) => {
  const evolutionClient = new EvolutionClient(
    fastify.config.EVOLUTION_API_URL,
    fastify.config.EVOLUTION_API_KEY,
    fastify.log,
  )

  const waManager = new ConnectionManager(fastify.db, fastify.log, evolutionClient)

  fastify.decorate('wa', waManager)

  initWorker(fastify)

  fastify.log.info('[WA] Evolution API Gateway & Message Worker Started')

  // Resume active sessions on server start
  fastify.addHook('onReady', async () => {
    fastify.log.info('[WA] Resuming active sessions with Evolution API...')

    const activeSessions = await fastify.db.select().from(sessions)
    fastify.log.info(`[WA] Found ${activeSessions.length} active sessions in database`)

    if (activeSessions.length === 0) {
      fastify.log.info('[WA] No active sessions to resume')
      return
    }

    for (const session of activeSessions) {
      try {
        // VALIDATION: Check if tenant still exists
        const [tenant] = await fastify.db
          .select()
          .from(tenants)
          .where(eq(tenants.id, session.tenantId))
          .limit(1)

        if (!tenant) {
          fastify.log.warn(
            `[WA] Tenant ${session.tenantId} not found, skipping resume for session ${session.sessionId}`,
          )
          await waManager.deleteSession(session.sessionId)
          continue
        }

        fastify.log.info(`[WA] Syncing session ${session.sessionId}...`)
        await waManager.start(session.sessionId)
      } catch (err) {
        fastify.log.error(err as Error, `[WA] Failed to resume session ${session.sessionId}`)
      }
    }
  })

  // Graceful shutdown
  fastify.addHook('onClose', (instance, done) => {
    done()
  })

  // -- WEBSOCKET /public/tenants/:id/ws?apiKey=YOUR_API_KEY (Session connection) --
  fastify.get(
    '/public/tenants/:id/ws',
    { websocket: true },
    async (
      connection: { socket: WebSocket } | WebSocket,
      req: FastifyRequest<{ Params: { id: string }; Querystring: { apiKey: string } }>,
    ) => {
      const tenantId = req.params.id
      const { apiKey } = req.query

      const socket = ('socket' in connection ? connection.socket : connection) as WebSocket

      if (!socket) {
        fastify.log.error(`[WS] Error: Socket object is undefined for tenant ${tenantId}`)
        return
      }

      // SECURITY CHECK: Authenticate Connection
      try {
        const [tenant] = await fastify.db
          .select({ id: tenants.id, apiKey: tenants.apiKey })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1)

        if (!tenant) {
          fastify.log.warn(`[WS] Connection rejected: Tenant ${tenantId} not found`)
          socket.close(1008, 'Tenant not found')
          return
        }

        if (tenant.apiKey !== apiKey) {
          fastify.log.warn(`[WS] Connection rejected: Invalid API Key for ${tenantId}`)
          socket.close(1008, 'Invalid API Key')
          return
        }
      } catch (err) {
        fastify.log.error(err, '[WS] Auth Error')
        socket.close(1011, 'Internal Server Error')
        return
      }

      // Find session record to resolve instanceName
      const [existingSession] = await fastify.db
        .select()
        .from(sessions)
        .where(eq(sessions.tenantId, tenantId))
        .limit(1)

      if (!existingSession) {
        fastify.log.warn(`[WS] Session for tenant ${tenantId} not found in database`)
        socket.close(1008, 'Invalid Session')
        return
      }

      const instanceName = existingSession.sessionId
      fastify.log.info(
        `[WS] Client authenticated for tenant ${tenantId} (Instance: ${instanceName})`,
      )

      // --- Event listener functions ---
      const onQr = async (id: string, qrString: string) => {
        if (id !== instanceName) return

        try {
          const qrImage = qrString.startsWith('data:') ? qrString : await QRCode.toDataURL(qrString)
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'qr', data: qrImage }))
          }
        } catch (err) {
          fastify.log.error(err, 'QR Generation Failed')
        }
      }

      const onReady = (id: string, jid: string) => {
        if (id !== instanceName) return
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ready', jid }))
        }
      }

      const onClose = (id: string) => {
        if (id !== instanceName) return
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'close' }))
        }
      }

      fastify.wa.on('qr', onQr)
      fastify.wa.on('ready', onReady)
      fastify.wa.on('close', onClose)

      // --- Push current state immediately to the newly connected client ---
      const currentState = fastify.wa.getState(instanceName)

      if (currentState?.state === 'CONNECTED' && currentState?.jid) {
        fastify.log.info(`[WS] Session ${instanceName} already connected, sending JID to client`)
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ready', jid: currentState.jid }))
        }
      } else if (currentState?.state === 'SCANNING') {
        fastify.log.info(`[WS] Session ${instanceName} is SCANNING, pushing cached QR to client`)
        const lastQr = fastify.wa.getLastQr(instanceName)
        if (lastQr && socket.readyState === WebSocket.OPEN) {
          try {
            const qrImage = lastQr.startsWith('data:') ? lastQr : await QRCode.toDataURL(lastQr)
            socket.send(JSON.stringify({ type: 'qr', data: qrImage }))
          } catch (err) {
            fastify.log.error(err, '[WS] Failed to generate QR from cache')
          }
        }
      } else {
        fastify.log.info(`[WS] Session ${instanceName} not started, initialising...`)

        try {
          await fastify.wa.start(instanceName)
        } catch (error) {
          fastify.log.error(error, `[WS] Failed to start session ${instanceName}`)
          fastify.wa.off('qr', onQr)
          fastify.wa.off('ready', onReady)
          fastify.wa.off('close', onClose)
          socket.close(1011, 'Failed to start session')
          return
        }
      }

      // Cleanup on WS client disconnect
      socket.on('close', () => {
        fastify.log.info(`[WS] Client disconnected for session ${instanceName}`)
        fastify.wa.off('qr', onQr)
        fastify.wa.off('ready', onReady)
        fastify.wa.off('close', onClose)
      })
    },
  )

  // -- POST /public/api/send (Send Message API) --
  const SendMessageSchema = Type.Object({
    tenantId: Type.String(),
    apiKey: Type.String(),
    to: Type.String({ minLength: 5 }), // phone number
    message: Type.String({ minLength: 1 }),
  })

  fastify.post(
    '/public/api/send',
    {
      schema: {
        body: SendMessageSchema,
        response: {
          200: Type.Object({
            status: Type.String(),
            jobId: Type.String(),
            queuePosition: Type.Number(),
          }),
          401: Type.Object({ error: Type.String() }),
          404: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (req, reply) => {
      const { tenantId, apiKey, to, message } = req.body

      // SECURITY CHECK: Tenant & API Key check
      const [tenant] = await fastify.db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

      // 404: Tenant not found
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' })
      }

      // 401: Invalid API Key
      if (tenant.apiKey !== apiKey) {
        return reply.status(401).send({ error: 'Invalid API Key' })
      }

      // INSERT LOG (Status: QUEUED)
      const [log] = await fastify.db
        .insert(messageLogs)
        .values({
          tenantId,
          to,
          content: message,
          status: 'QUEUED',
        })
        .returning()

      // QUEUE LOGIC
      const job = await messageQueue.add('send-text', {
        logId: log.id,
        tenantId,
        to,
        message,
      })

      // Instant Feedback
      const jobCounts = await messageQueue.getJobCounts()

      return reply.status(200).send({
        status: 'queued',
        jobId: job.id || 'unknown',
        queuePosition: jobCounts.waiting,
      })
    },
  )
})
