import fp from 'fastify-plugin'

export default fp(async (fastify) => {
  fastify.decorateRequest('user', null)

  fastify.addHook('preHandler', async (req, reply) => {
    const url = req.url

    // Whitelist routes that don't require authentication
    if (url.startsWith('/public') || url.startsWith('/health')) {
      return
    }

    const user = req.session?.get('user')

    if (url.startsWith('/auth')) {
      if (user && url.startsWith('/auth/login')) return reply.redirect('/')
      return
    }

    if (!user) {
      return reply.redirect('/auth/login')
    }

    req.user = user
  })
})
