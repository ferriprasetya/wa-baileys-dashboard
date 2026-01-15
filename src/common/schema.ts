import {
  pgTable,
  serial,
  text,
  varchar,
  timestamp,
  uuid,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Admins table for dashboard login
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password: text('password').notNull(), // Will store Argon2 hash
  createdAt: timestamp('created_at').defaultNow(),
})

// Tenants table (session owners)
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(), // UUID for safe API exposure
  name: varchar('name', { length: 100 }).notNull(),
  apiKey: text('api_key').notNull().unique(), // API authentication token
  webhookUrl: text('webhook_url'), // Optional: URL for incoming events
  createdAt: timestamp('created_at').defaultNow(),
})

// Sessions table (WhatsApp connection status)
// Status stored as string for flexibility
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionId: varchar('session_id', { length: 50 }).notNull().unique(), // Unique ID referencing Baileys
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  status: varchar('status', { length: 20 }).default('DISCONNECTED').notNull(), // CONNECTING, CONNECTED, DISCONNECTED
  jid: varchar('jid', { length: 50 }), // Phone number (e.g., 628123...@s.whatsapp.net)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Baileys auth credentials (session persistence)
// Acts as key-value store to replace file system
export const authCredits = pgTable(
  'auth_credits',
  {
    sessionId: varchar('session_id', { length: 50 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(), // File/key name (e.g., 'creds', 'sender-key-xyz')
    value: jsonb('value').notNull(), // Session data content
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.key] })],
)

// Message logs table
export const messageLogs = pgTable('message_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id')
    .references(() => tenants.id, { onDelete: 'cascade' })
    .notNull(),
  to: varchar('to', { length: 50 }).notNull(),
  content: text('content'), // Isi pesan
  status: varchar('status', { length: 20 }).notNull(), // QUEUED, SENT, FAILED
  error: text('error'), // Pesan error jika gagal
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Relations for easier joins

export const tenantsRelations = relations(tenants, ({ many }) => ({
  sessions: many(sessions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  tenant: one(tenants, {
    fields: [sessions.tenantId],
    references: [tenants.id],
  }),
}))
