import { generateApiKey } from '@/common/crypto.js'
import { tenants, sessions } from '@/common/schema.js'
import { FastifyTypebox } from '@/types/common.js'
import { Type } from '@sinclair/typebox'
import { eq, desc, ilike, sql } from 'drizzle-orm'

export default async function dashboardModule(fastify: FastifyTypebox) {
  // -- SCHEMA QUERY PARAMS --
  const QuerySchema = Type.Object({
    page: Type.Optional(Type.Number({ default: 1, minimum: 1 })),
    search: Type.Optional(Type.String({ default: '' })),
  })

  // -- GET / (List Tenants) --
  fastify.get(
    '/',
    {
      schema: { querystring: QuerySchema },
    },
    async (req, reply) => {
      const { page = 1, search = '' } = req.query
      const pageSize = 10
      const offset = (page - 1) * pageSize

      const searchCondition = search ? ilike(tenants.name, `%${search}%`) : undefined

      // Fetch tenants with pagination and search
      const [data, totalCountResult] = await Promise.all([
        fastify.db
          .select({
            id: tenants.id,
            name: tenants.name,
            apiKey: tenants.apiKey,
            status: sessions.status,
            jid: sessions.jid,
            createdAt: tenants.createdAt,
          })
          .from(tenants)
          .leftJoin(sessions, eq(tenants.id, sessions.tenantId))
          .where(searchCondition)
          .orderBy(desc(tenants.createdAt))
          .limit(pageSize)
          .offset(offset),

        fastify.db
          .select({ count: sql<number>`count(*)` })
          .from(tenants)
          .where(searchCondition),
      ])

      const totalItems = Number(totalCountResult[0].count)
      const totalPages = Math.ceil(totalItems / pageSize)

      return reply.view('dashboard/views/index.ejs', {
        tenants: data,
        user: req.user,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          search,
        },
      })
    },
  )

  // -- GET /tenants/create (Modal UI) --
  fastify.get('/tenants/create', async (_req, reply) => {
    return reply.view('dashboard/views/modals/create.ejs')
  })

  // -- POST /tenants (Create Action) --
  const CreateTenantSchema = Type.Object({
    name: Type.String({ minLength: 3 }),
  })

  fastify.post(
    '/tenants',
    {
      schema: { body: CreateTenantSchema },
    },
    async (req, reply) => {
      const { name } = req.body
      const newApiKey = generateApiKey()

      // Transaction: Create Tenant + Init Session Row
      await fastify.db.transaction(async (tx) => {
        const [tenant] = await tx.insert(tenants).values({ name, apiKey: newApiKey }).returning()

        await tx.insert(sessions).values({
          sessionId: tenant.id,
          tenantId: tenant.id,
          status: 'DISCONNECTED', // Default status
        })
      })

      // Trigger HTMX full page refresh to show new data
      return reply.header('HX-Refresh', 'true').send()
    },
  )

  // -- DELETE /tenants/:id --
  const ParamIdSchema = Type.Object({ id: Type.String() })

  fastify.delete(
    '/tenants/:id',
    {
      schema: { params: ParamIdSchema },
    },
    async (req, reply) => {
      const { id } = req.params

      // Kill WA Connection (Memory & DB Cleanup)
      await fastify.wa.deleteSession(id)

      await fastify.db.transaction(async (tx) => {
        await tx.delete(tenants).where(eq(tenants.id, id))
      })

      return reply.header('HX-Refresh', 'true').send()
    },
  )

  // -- POST /tenants/:id/refresh-key --
  fastify.post(
    '/tenants/:id/refresh-key',
    {
      schema: { params: ParamIdSchema },
    },
    async (req, reply) => {
      const { id } = req.params
      const newApiKey = generateApiKey()

      await fastify.db.update(tenants).set({ apiKey: newApiKey }).where(eq(tenants.id, id))

      return reply.header('HX-Refresh', 'true').send()
    },
  )

  // -- GET /tenants/scan (Modal UI) --
  fastify.get(
    '/tenants/scan',
    {
      schema: { querystring: Type.Object({ tenantId: Type.String(), apiKey: Type.String() }) },
    },
    async (req, reply) => {
      return reply.view('dashboard/views/modals/scan.ejs', {
        tenantId: req.query.tenantId,
        apiKey: req.query.apiKey,
      })
    },
  )
}

// Override prefix
export const autoPrefix = '/'
