import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const main = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('[DB] ❌ DATABASE_URL is not set')
    process.exit(1)
  }

  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
  })

  const db = drizzle(sql)

  console.log('[DB] 🔄 Running migrations...')

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '../drizzle'),
    })
    console.log('[DB] ✅ Migrations completed successfully')
  } catch (err) {
    console.error('[DB] ❌ Migration failed:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
