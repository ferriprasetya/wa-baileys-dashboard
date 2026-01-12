import Fastify from 'fastify'
import AutoLoad from '@fastify/autoload'
import path from 'path'
import { fileURLToPath } from 'url'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname', // Remove unnecessary info during dev
              },
            }
          : undefined,
    },
  }).withTypeProvider<TypeBoxTypeProvider>()

  await app.register(AutoLoad, {
    dir: path.join(__dirname, 'plugins'),
    encapsulate: false, // Plugins are global
  })

  await app.register(AutoLoad, {
    dir: path.join(__dirname, 'modules'),
    options: { prefix: '/api' }, // Default prefix, can be overridden in module
    // Modules are encapsulated by default
  })

  return app
}
