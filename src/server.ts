import { buildApp } from './app.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({
      port: app.config.PORT,
      host: '0.0.0.0',
    })
    console.log(`===== Server running at http://localhost:${app.config.PORT} =====`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
