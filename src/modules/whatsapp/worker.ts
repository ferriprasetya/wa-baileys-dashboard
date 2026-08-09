import { messageLogs } from '@/common/schema.js'
import { Worker, Job } from 'bullmq'
import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'

interface SendMessageData {
  logId: string
  tenantId: string
  to: string
  message: string
}

// Helper function to process message formatting
const processMessageFormatting = (message: string): string => {
  return message
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_')
    .replace(/\\~/g, '~')
    .replace(/\\`/g, '`')
}

export const initWorker = (fastify: FastifyInstance) => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  }

  // Worker Initialization
  const worker = new Worker<SendMessageData>(
    'wa-sending-queue',
    async (job: Job<SendMessageData>) => {
      const { tenantId, to, message, logId } = job.data

      fastify.log.info(`[Worker] Processing Job ${job.id} for Tenant ${tenantId}`)

      // 1. Get Socket from Connection Manager
      const socket = fastify.wa.getSocket(tenantId)

      // 2. Check Connection
      if (!socket || !socket.user) {
        // Throw Error will trigger BullMQ's Retry/Backoff mechanism
        throw new Error(`Socket not connected for tenant ${tenantId}`)
      }

      // 3. Check Anti-Ban Health Risk Level
      const antiBanInfo = fastify.wa.getAntiBanStats(tenantId)
      if (antiBanInfo.enabled && antiBanInfo.riskLevel === 'high') {
        fastify.log.warn(`[Worker] Tenant ${tenantId} is in HIGH ban risk state! Delaying job ${job.id}...`)
        // Throwing error triggers BullMQ backoff retry until health recovers
        throw new Error(`AntiBan Protection: Tenant ${tenantId} is currently paused due to High Ban Risk`)
      }

      // 4. Format JID (Phone Number)
      const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`

      // 5. Send Message via wrapped Anti-Ban socket
      // (baileys-antiban automatically applies presence, typing, circadian delays, and rate limiting)
      const formattedMessage = processMessageFormatting(message)
      await socket.sendMessage(jid, { text: formattedMessage }, {})

      // 6. Update Log Status to SENT
      await fastify.db
        .update(messageLogs)
        .set({ status: 'SENT', updatedAt: new Date(), error: null })
        .where(eq(messageLogs.id, logId))

      fastify.log.info(`[Worker] Job ${job.id} COMPLETED. Message sent to ${to}`)

      return { success: true, sentTo: jid }
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    },
  )

  // Event Listeners for Failures
  worker.on('failed', async (job, err) => {
    fastify.log.error(`[Worker] Job ${job?.id} failed: ${err.message}`)
    if (job?.data?.logId) {
      try {
        await fastify.db
          .update(messageLogs)
          .set({ status: 'FAILED', error: err.message, updatedAt: new Date() })
          .where(eq(messageLogs.id, job.data.logId))
      } catch (dbErr) {
        fastify.log.error(dbErr as Error, '[Worker] Failed to update messageLog on failure')
      }
    }
  })

  // Graceful Shutdown Worker on Fastify close
  fastify.addHook('onClose', async () => {
    await worker.close()
  })

  return worker
}
