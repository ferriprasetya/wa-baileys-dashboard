import 'dotenv/config' // Load .env
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { admins } from './schema.js'

async function main() {
  const sql = postgres(process.env.DATABASE_URL!)
  const db = drizzle(sql)

  console.log('Seeding database...')

  // Insert Admin
  // Note: Password is pre-hashed for 'supersecretpassword'
  try {
    await db
      .insert(admins)
      .values({
        username: 'superadmin',
        password: '$argon2id$v=19$m=65536,t=3,p=4$UNSECURE_HASH_JUST_PLACEHOLDER$...',
      })
      .onConflictDoNothing()

    console.log('✅ Admin "superadmin" created.')
  } catch (e) {
    console.error('Error seeding:', e)
  }

  await sql.end()
  process.exit(0)
}

main()
