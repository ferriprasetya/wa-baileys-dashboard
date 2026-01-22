import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { admins } from '../src/common/schema.js'
import { hashPassword } from '../src/common/crypto.js'

const main = async () => {
  if (!process.env.DATABASE_URL) {
    console.error('[Seed] ❌ DATABASE_URL is not set')
    process.exit(1)
  }

  const sql = postgres(process.env.DATABASE_URL)
  const db = drizzle(sql)

  console.log('[Seed] 🌱 Starting database seeding...')

  try {
    // Insert Super Admin
    const passwordHash = await hashPassword('admin123')
    await db
      .insert(admins)
      .values({
        username: 'superadmin',
        password: passwordHash,
      })
      .onConflictDoNothing()

    console.log('[Seed] ✅ Admin "superadmin" created')
    console.log('[Seed] ✅ Database seeding completed')
  } catch (err) {
    console.error('[Seed] ❌ Seeding failed:', err)
    process.exit(1)
  } finally {
    await sql.end()
  }
}

main()
