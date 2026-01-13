import '@fastify/secure-session'

declare module '@fastify/secure-session' {
  interface SessionData {
    user: {
      id: number
      username: string
    }
  }
}
