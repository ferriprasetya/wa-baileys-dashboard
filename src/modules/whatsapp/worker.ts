import { Worker, Job } from 'bullmq'
import { FastifyInstance } from 'fastify'

interface SendMessageData {
  tenantId: string
  to: string
  message: string
}

// Helper to generate random delay between min and max milliseconds
const randomDelay = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

// Helper to sleep for given milliseconds
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const initWorker = (fastify: FastifyInstance) => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  }

  // Worker Initialization
  const worker = new Worker<SendMessageData>(
    'wa-sending-queue',
    async (job: Job<SendMessageData>) => {
      const { tenantId, to, message } = job.data

      fastify.log.info(`[Worker] Processing Job ${job.id} for Tenant ${tenantId}`)

      // Get Socket from Connection Manager
      const socket = fastify.wa.getSocket(tenantId)

      // 2. Check Connection
      // We check the existence of the socket AND whether the connection is open
      if (!socket || !socket.user) {
        // Throw Error will trigger BullMQ's Retry/Backoff mechanism
        throw new Error(`Socket not connected for tenant ${tenantId}`)
      }

      // --- HUMAN-LIKE DELAY LOGIC ---
      // Set delay
      const delay = randomDelay(fastify.config.WA_DELAY_MIN_MS, fastify.config.WA_DELAY_MAX_MS)

      fastify.log.debug(`[Worker] Job ${job.id}: Adding human-like delay of ${delay}ms...`)
      await sleep(delay)

      // Send presence update
      await socket.sendPresenceUpdate(
        'composing',
        to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`,
      )
      await sleep(randomDelay(fastify.config.WA_TYPING_MIN_MS, fastify.config.WA_TYPING_MAX_MS)) // Typing for the delay
      await socket.sendPresenceUpdate(
        'paused',
        to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`,
      )
      // -----------------------------------

      // 3. Format JID (Nomor HP)
      // Baileys requires format: 62812xxx@s.whatsapp.net
      // We assume input 'to' is already in number format (628xxx)
      const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`

      // 4. Send Message
      // The sendMessage function returns a promise, we await it so the worker waits until it's sent
      await socket.sendMessage(jid, { text: message })

      fastify.log.info(`[Worker] Job ${job.id} COMPLETED. Message sent to ${to}`)

      return { success: true, sentTo: jid }
    },
    {
      connection,
      concurrency: 5, // Can process 5 messages simultaneously in parallel
      limiter: {
        max: 10, // Maximum 10 messages
        duration: 1000, // Per second (Simple Rate Limiting to avoid bans)
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
