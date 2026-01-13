import { Type } from '@sinclair/typebox'
import { eq } from 'drizzle-orm'
import { admins } from '@/common/schema.js'
import { verifyPassword } from '@/common/crypto.js'
import { FastifyTypebox } from '@/types/common.js'

const VIEW = {
  LOGIN: 'auth/views/login.ejs',
}

export default async function authModule(fastify: FastifyTypebox) {
  // -- GET /auth/login --
  fastify.get('/login', async (_req, reply) => {
    return reply.view(VIEW.LOGIN)
  })

  // -- POST /auth/login --
  const LoginSchema = Type.Object({
    username: Type.String(),
    password: Type.String(),
  })

  fastify.post(
    '/login',
    {
      schema: {
        body: LoginSchema,
        response: {
          200: Type.Null(),
        },
      },
    },
    async (req, reply) => {
      const { username, password } = req.body

      // 1. Find user
      const [admin] = await fastify.db
        .select()
        .from(admins)
        .where(eq(admins.username, username))
        .limit(1)

      if (!admin) {
        return reply.view(VIEW.LOGIN, { error: 'Invalid username or password' })
      }

      // 2. Verify password
      const isValid = await verifyPassword(admin.password, password)
      if (!isValid) {
        return reply.view(VIEW.LOGIN, { error: 'Invalid username or password' })
      }

      // 3. Set Session
      req.session.set('user', {
        id: admin.id,
        username: admin.username,
      })

      // 4. Redirect to Dashboard (Assuming /dashboard exists later)
      return reply.redirect('/')
    },
  )

  // -- POST /auth/logout --
  fastify.post('/logout', async (req, reply) => {
    console.log('🔄 Logout Request Received')

    req.session.delete()

    console.log('LOGOUT:', req.session.get('user'))

    reply.header('Cache-Control', 'no-store, max-age=0, must-revalidate')

    return reply.redirect('/test')
  })
}
