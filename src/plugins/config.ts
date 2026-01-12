import fp from 'fastify-plugin'
import fastifyEnv from '@fastify/env'
import { Type } from '@sinclair/typebox'

export default fp(async (fastify) => {
  const schema = Type.Object({
    NODE_ENV: Type.String({ default: 'development' }),
    PORT: Type.Number({ default: 3000 }),
    DATABASE_URL: Type.String(),
    REDIS_HOST: Type.String({ default: 'localhost' }),
    REDIS_PORT: Type.Number({ default: 6379 }),
  })

  await fastify.register(fastifyEnv, {
    confKey: 'config', // Akses via fastify.config
    schema,
    dotenv: true, // Load file .env
  })
})

// Augment Type Definition agar dikenali TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      NODE_ENV: string
      PORT: number
      DATABASE_URL: string
      REDIS_HOST: string
      REDIS_PORT: number
    }
  }
}
