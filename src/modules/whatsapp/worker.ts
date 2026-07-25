import { messageLogs, sessions } from '@/common/schema.js'
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

      try {
        const formattedMessage = processMessageFormatting(message)

        const [session] = await fastify.db
          .select()
          .from(sessions)
          .where(eq(sessions.tenantId, tenantId))
          .limit(1)

        if (!session) {
          throw new Error(`No active session found for tenant ${tenantId}`)
        }

        const instanceName = session.sessionId

        // Send message via Evolution API client
        await fastify.wa.getClient().sendTextMessage(instanceName, to, formattedMessage)

        // Update Log Status to SENT
        await fastify.db
          .update(messageLogs)
          .set({ status: 'SENT', updatedAt: new Date(), error: null })
          .where(eq(messageLogs.id, logId))

        fastify.log.info(`[Worker] Job ${job.id} COMPLETED. Message sent to ${to}`)

        return { success: true, sentTo: to }
      } catch (err) {
        const errorMessage = (err as Error).message || 'Unknown error'

        await fastify.db
          .update(messageLogs)
          .set({ status: 'FAILED', error: errorMessage, updatedAt: new Date() })
          .where(eq(messageLogs.id, logId))

        fastify.log.error(`[Worker] Job ${job.id} FAILED for tenant ${tenantId}: ${errorMessage}`)
        throw err
      }
    },
    {
      connection,
      concurrency: 5, // Can process 5 messages simultaneously in parallel
      limiter: {
        max: 10, // Maximum 10 messages
        duration: 1000, // Per second (Simple Rate Limiting)
      },
    },
  )

  // Event Listeners for Debugging
  worker.on('failed', (job, err) => {
    fastify.log.error(`[Worker] Job ${job?.id} failed: ${err.message}`)
  })

  // Graceful Shutdown Worker on Fastify close
  fastify.addHook('onClose', async () => {
    await worker.close()
  })

  return worker
}
