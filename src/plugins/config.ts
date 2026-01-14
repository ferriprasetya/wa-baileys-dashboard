import fp from 'fastify-plugin'
import fastifyEnv from '@fastify/env'
import { Type } from '@sinclair/typebox'

export default fp(async (fastify) => {
  const schema = Type.Object({
    // Server Configuration
    NODE_ENV: Type.String({ default: 'development' }),
    PORT: Type.Number({ default: 3000 }),
    DATABASE_URL: Type.String(),
    REDIS_HOST: Type.String({ default: 'localhost' }),
    REDIS_PORT: Type.Number({ default: 6379 }),

    // WhatsApp Queue Configuration
    WA_QUEUE_NAME: Type.String({ default: 'wa-sending-queue' }),
    WA_QUEUE_ATTEMPTS: Type.Number({ default: 3 }),
    WA_QUEUE_BACKOFF_DELAY: Type.Number({ default: 1000 }),
    WA_QUEUE_REMOVE_ON_COMPLETE: Type.Number({ default: 100 }),
    WA_QUEUE_REMOVE_ON_FAIL: Type.Number({ default: 500 }),

    // Baileys Configuration
    WA_PRINT_QR_TERMINAL: Type.Boolean({ default: false }),
    WA_SYNC_FULL_HISTORY: Type.Boolean({ default: false }),
    WA_BROWSER_TYPE: Type.String({ default: 'ubuntu' }),
    WA_BROWSER_NAME: Type.String({ default: 'Chrome' }),
    WA_QR_TIMEOUT: Type.Number({ default: 20000 }),
    WA_DELAY_MIN_MS: Type.Number({ default: 2000 }),
    WA_DELAY_MAX_MS: Type.Number({ default: 10000 }),
    WA_TYPING_MIN_MS: Type.Number({ default: 1000 }),
    WA_TYPING_MAX_MS: Type.Number({ default: 3000 }),
  })

  await fastify.register(fastifyEnv, {
    confKey: 'config', // Access from fastify.config
    schema,
    dotenv: true, // Load .env file
  })
})
