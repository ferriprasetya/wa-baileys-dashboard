import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { admins } from '../src/common/schema.js'
import { hashPassword } from '../src/common/crypto.js'

const main = async () => {
  const sql = postgres(process.env.DATABASE_URL!)
  const db = drizzle(sql)

  console.log('[Seed] 🌱 Starting...')

  try {
    const passwordHash = await hashPassword('admin123')
    await db
      .insert(admins)
      .values({ username: 'superadmin', password: passwordHash })
      .onConflictDoNothing()

    console.log('[Seed] ✅ Done')
  } catch (err) {
    console.error('[Seed] ❌ Failed:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
