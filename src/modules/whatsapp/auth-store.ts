import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys'
import { authCredits } from '@/common/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { FastifyDatabase } from '@/types/common.js'

export const usePostgresAuthState = async (
  db: FastifyDatabase,
  sessionId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  // 1. Fetch 'creds' only (initial load)
  const queryResult = await db
    .select()
    .from(authCredits)
    .where(and(eq(authCredits.sessionId, sessionId), eq(authCredits.key, 'creds')))
    .limit(1)

  // 2. Parse creds or init new one
  const creds: AuthenticationCreds =
    queryResult.length > 0
      ? JSON.parse(JSON.stringify(queryResult[0].value), BufferJSON.reviver)
      : initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: SignalDataTypeMap[typeof type] } = {}

          // Construct keys like "sender-key-123", "app-state-sync-456"
          const dbKeys = ids.map((id) => `${type}-${id}`)

          if (dbKeys.length === 0) return data

          const result = await db
            .select()
            .from(authCredits)
            .where(and(eq(authCredits.sessionId, sessionId), inArray(authCredits.key, dbKeys)))

          for (const row of result) {
            // Restore original ID (remove prefix)
            const id = row.key.replace(`${type}-`, '')
            // Revive Buffer from JSON
            data[id] = JSON.parse(JSON.stringify(row.value), BufferJSON.reviver)
          }

          return data
        },
        set: async (data) => {
          const tasks: Promise<void>[] = []

          // Loop through categories (sender-key, session, etc)
          for (const category in data) {
            const contextCategory = category as keyof SignalDataTypeMap
            const categoryData = data[contextCategory]

            if (!categoryData) continue

            for (const id in categoryData) {
              const value = categoryData[id]
              const dbKey = `${contextCategory}-${id}`

              if (value) {
                // UPSERT (Insert or Update)
                // Use BufferJSON.replacer to handle Buffers correctly
                const jsonValue = JSON.parse(JSON.stringify(value, BufferJSON.replacer))

                tasks.push(
                  db
                    .insert(authCredits)
                    .values({
                      sessionId,
                      key: dbKey,
                      value: jsonValue,
                    })
                    .onConflictDoUpdate({
                      target: [authCredits.sessionId, authCredits.key],
                      set: { value: jsonValue },
                    })
                    .then(() => undefined),
                )
              } else {
                // DELETE if value is null
                tasks.push(
                  db
                    .delete(authCredits)
                    .where(and(eq(authCredits.sessionId, sessionId), eq(authCredits.key, dbKey)))
                    .then(() => undefined),
                )
              }
            }
          }

          await Promise.all(tasks)
        },
      },
    },
    saveCreds: async () => {
      // Save 'creds' specifically
      const jsonValue = JSON.parse(JSON.stringify(creds, BufferJSON.replacer))

      await db
        .insert(authCredits)
        .values({
          sessionId,
          key: 'creds',
          value: jsonValue,
        })
        .onConflictDoUpdate({
          target: [authCredits.sessionId, authCredits.key],
          set: { value: jsonValue },
        })
    },
  }
}
