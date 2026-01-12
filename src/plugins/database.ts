import fp from 'fastify-plugin'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../common/schema.js'

export default fp(async (fastify) => {
  const queryClient = postgres(fastify.config.DATABASE_URL)
  const db = drizzle(queryClient, { schema })

  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    await queryClient.end()
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle<typeof schema>>
  }
}
