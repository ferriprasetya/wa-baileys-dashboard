import fp from 'fastify-plugin'
import fastifySecureSession from '@fastify/secure-session'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default fp(async (fastify) => {
  const keyPath = path.join(__dirname, '../../secret-key')

  // ensure the secret key file exists
  if (!fs.existsSync(keyPath)) {
    throw new Error('Missing session key file. Run "npx @fastify/secure-session > secret-key"')
  }

  await fastify.register(fastifySecureSession, {
    key: fs.readFileSync(keyPath),
    cookie: {
      path: '/',
      httpOnly: true, // anti-XSS
      sameSite: 'lax', // CSRF protection
      secure: fastify.config.NODE_ENV === 'production', // HTTPS only in production
      maxAge: 60 * 60 * 24 * 7, // Session valid for 7 days (in seconds)
    },
  })
})
