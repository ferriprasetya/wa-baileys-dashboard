import fp from 'fastify-plugin'
import fastifyView from '@fastify/view'
import fastifyStatic from '@fastify/static'
import ejs from 'ejs'
import path from 'path'

export default fp(async (fastify) => {
  // Setup Static Files (CSS/JS Client)
  fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/public/',
  })

  // Setup EJS
  fastify.register(fastifyView, {
    engine: { ejs },
    root: path.join(process.cwd(), 'src/modules'),
    includeViewExtension: true,
  })
})
