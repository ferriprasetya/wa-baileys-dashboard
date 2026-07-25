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

    // WhatsApp Queue & Delay Configuration
    WA_QUEUE_NAME: Type.String({ default: 'wa-sending-queue' }),
    WA_QUEUE_ATTEMPTS: Type.Number({ default: 3 }),
    WA_QUEUE_BACKOFF_DELAY: Type.Number({ default: 1000 }),
    WA_QUEUE_REMOVE_ON_COMPLETE: Type.Number({ default: 100 }),
    WA_QUEUE_REMOVE_ON_FAIL: Type.Number({ default: 500 }),
    WA_DELAY_MIN_MS: Type.Number({ default: 5000 }),
    WA_DELAY_MAX_MS: Type.Number({ default: 30000 }),
    WA_TYPING_MIN_MS: Type.Number({ default: 1000 }),
    WA_TYPING_MAX_MS: Type.Number({ default: 3000 }),

    // Evolution API Configuration
    EVOLUTION_API_URL: Type.String({ default: '' }),
    EVOLUTION_API_KEY: Type.String({ default: '' }),
  })

  await fastify.register(fastifyEnv, {
    confKey: 'config', // Access from fastify.config
    schema,
    dotenv: true, // Load .env file
  })
})
