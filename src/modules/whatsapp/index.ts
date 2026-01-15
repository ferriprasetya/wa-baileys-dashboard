import fp from 'fastify-plugin'
import { ConnectionManager } from './connection.js'
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
  const waManager = new ConnectionManager(fastify.db, fastify.log)

  fastify.decorate('wa', waManager)

  initWorker(fastify)

  fastify.log.info('[WA] Message Worker Started')

  // Resume active sessions on server start
  fastify.addHook('onReady', async () => {
    fastify.log.info('[WA] Resuming active sessions...')

    const activeSessions = await fastify.db.select().from(sessions)

    for (const session of activeSessions) {
      try {
        waManager.start(session.sessionId)
      } catch (err) {
        fastify.log.error(err as Error, `[WA] Failed to resume session ${session.sessionId}:`)
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
      const sessionId = req.params.id
      const { apiKey } = req.query

      const socket = ('socket' in connection ? connection.socket : connection) as WebSocket

      if (!socket) {
        fastify.log.error(`[WS] Error: Socket object is undefined for session ${sessionId}`)
        return
      }

      // SECURITY CHECK: Authenticate Connection
      try {
        const [tenant] = await fastify.db
          .select({ id: tenants.id, apiKey: tenants.apiKey })
          .from(tenants)
          .where(eq(tenants.id, sessionId))
          .limit(1)

        if (!tenant) {
          fastify.log.warn(`[WS] Connection rejected: Tenant ${sessionId} not found`)
          socket.close(1008, 'Tenant not found')
          return
        }

        if (tenant.apiKey !== apiKey) {
          fastify.log.warn(`[WS] Connection rejected: Invalid API Key for ${sessionId}`)
          socket.close(1008, 'Invalid API Key')
          return
        }
      } catch (err) {
        fastify.log.error(err, '[WS] Auth Error')
        socket.close(1011, 'Internal Server Error')
        return
      }

      fastify.log.info(`[WS] Client authenticated for session ${sessionId}`)

      // Event listener functions
      const onQr = async (id: string, qrString: string) => {
        if (id !== sessionId) return

        try {
          const qrImage = await QRCode.toDataURL(qrString)
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'qr', data: qrImage }))
          }
        } catch (err) {
          fastify.log.error(err, 'QR Generation Failed')
        }
      }

      const onReady = (id: string, jid: string) => {
        if (id !== sessionId) return
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ready', jid }))
        }
      }

      const onClose = (id: string) => {
        if (id !== sessionId) return
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'close' }))
        }
      }

      // Register event listeners
      fastify.wa.on('qr', onQr)
      fastify.wa.on('ready', onReady)
      fastify.wa.on('close', onClose)

      // Start session
      const existingSocket = fastify.wa.getSocket(sessionId)
      if (!existingSocket) {
        try {
          await fastify.wa.start(sessionId)
        } catch (error) {
          fastify.log.error(error)
        }
      }

      // Cleanup on disconnect
      socket.on('close', () => {
        fastify.log.info(`[WS] Client disconnected for session ${sessionId}`)
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
