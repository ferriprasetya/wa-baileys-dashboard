import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: number
      username: string
    } | null
  }

  interface FastifyInstance {
    config: {
      NODE_ENV: string
      PORT: number
      DATABASE_URL: string
      REDIS_HOST: string
      REDIS_PORT: number

      // WhatsApp Queue Configuration
      WA_QUEUE_NAME: string
      WA_QUEUE_ATTEMPTS: number
      WA_QUEUE_BACKOFF_DELAY: number
      WA_QUEUE_REMOVE_ON_COMPLETE: number
      WA_QUEUE_REMOVE_ON_FAIL: number

      // Baileys Configuration
      WA_PRINT_QR_TERMINAL: boolean
      WA_SYNC_FULL_HISTORY: boolean
      WA_BROWSER_TYPE: string
      WA_BROWSER_NAME: string
      WA_QR_TIMEOUT: number
      WA_DELAY_MIN_MS: number
      WA_DELAY_MAX_MS: number
      WA_TYPING_MIN_MS: number
      WA_TYPING_MAX_MS: number
    }
  }
}
