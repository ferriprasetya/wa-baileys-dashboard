import { FastifyInstance, FastifyBaseLogger, RawServerDefault } from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { IncomingMessage, ServerResponse } from 'http'

export type FastifyTypebox = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>
