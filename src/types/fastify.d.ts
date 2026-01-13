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
    }
  }
}
