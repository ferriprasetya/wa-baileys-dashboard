import 'dotenv/config' // Load .env
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { admins } from './schema.js'
import { hashPassword } from './crypto.js'

async function main() {
  const sql = postgres(process.env.DATABASE_URL!)
  const db = drizzle(sql)

  console.log('Seeding database...')

  // Insert Admin
  try {
    const passwordHash = await hashPassword('admin123') // Default password
    await db
      .insert(admins)
      .values({
        username: 'superadmin',
        password: passwordHash,
      })
      .onConflictDoNothing()

    console.log('✅ Admin "superadmin" created with password "admin123".')
  } catch (e) {
    console.error('Error seeding:', e)
  }

  await sql.end()
  process.exit(0)
}

main()
