import { messageLogs } from '@/common/schema.js'
import { Worker, Job } from 'bullmq'
import { eq } from 'drizzle-orm'
import { FastifyInstance } from 'fastify'

export interface SendMessageData {
  logId: string
  tenantId: string
  to: string
  message?: string
  mediaUrl?: string
  fileName?: string
  mimetype?: string
  mediaType?: 'document' | 'image' | 'video' | 'audio' | 'auto'
}

// Common file extension to MIME type map
const MIME_EXT_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',
}

// Helper function to extract filename from URL if not explicitly provided
const extractFileName = (urlStr: string, defaultName = 'file'): string => {
  try {
    const parsed = new URL(urlStr)
    const pathname = parsed.pathname
    const basename = pathname.split('/').filter(Boolean).pop()
    return basename ? decodeURIComponent(basename) : defaultName
  } catch {
    return defaultName
  }
}

// Helper function to resolve MIME type
const resolveMimeType = (fileName: string, explicitMime?: string, headerMime?: string | null): string => {
  if (explicitMime && explicitMime.trim() !== '') {
    return explicitMime.split(';')[0].trim()
  }
  if (headerMime && headerMime !== 'application/octet-stream' && headerMime !== 'binary/octet-stream') {
    return headerMime.split(';')[0].trim()
  }
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return MIME_EXT_MAP[ext] || 'application/octet-stream'
}

// Helper function to process message formatting
const processMessageFormatting = (message: string): string => {
  return message
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_')
    .replace(/\\~/g, '~')
    .replace(/\\`/g, '`')
}

export const initWorker = (fastify: FastifyInstance) => {
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  }

  // Worker Initialization
  const worker = new Worker<SendMessageData>(
    'wa-sending-queue',
    async (job: Job<SendMessageData>) => {
      const { tenantId, to, message, logId, mediaUrl, fileName, mimetype, mediaType = 'auto' } = job.data

      fastify.log.info(`[Worker] Processing Job ${job.id} for Tenant ${tenantId}`)

      // 1. Get Socket from Connection Manager
      const socket = fastify.wa.getSocket(tenantId)

      // 2. Check Connection
      if (!socket || !socket.user) {
        // Throw Error will trigger BullMQ's Retry/Backoff mechanism
        throw new Error(`Socket not connected for tenant ${tenantId}`)
      }

      // 3. Check Anti-Ban Health Risk Level
      const antiBanInfo = fastify.wa.getAntiBanStats(tenantId)
      if (antiBanInfo.enabled && antiBanInfo.riskLevel === 'high') {
        fastify.log.warn(`[Worker] Tenant ${tenantId} is in HIGH ban risk state! Delaying job ${job.id}...`)
        // Throwing error triggers BullMQ backoff retry until health recovers
        throw new Error(`AntiBan Protection: Tenant ${tenantId} is currently paused due to High Ban Risk`)
      }

      // 4. Format JID (Phone Number)
      const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`

      // 5. Format Caption / Text Message if present
      const formattedMessage = message ? processMessageFormatting(message) : ''

      // 6. Send Message (Media or Text)
      if (mediaUrl) {
        fastify.log.info(`[Worker] Downloading media from ${mediaUrl} for tenant ${tenantId}...`)

        // Download media buffer
        const response = await fetch(mediaUrl, {
          signal: AbortSignal.timeout(60000), // 60s download timeout
        })

        if (!response.ok) {
          throw new Error(`Failed to download media from ${mediaUrl}: HTTP ${response.status} ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const headerContentType = response.headers.get('content-type')

        const resolvedFileName = fileName || extractFileName(mediaUrl, 'document')
        const resolvedMime = resolveMimeType(resolvedFileName, mimetype, headerContentType)

        fastify.log.info(
          `[Worker] Sending media message (${resolvedMime}, file: ${resolvedFileName}) to ${jid}...`,
        )

        // Determine message type based on mediaType and MIME type
        if (mediaType === 'image' || (mediaType === 'auto' && resolvedMime.startsWith('image/') && !resolvedMime.includes('svg'))) {
          await socket.sendMessage(
            jid,
            {
              image: buffer,
              mimetype: resolvedMime,
              caption: formattedMessage || undefined,
            },
            {},
          )
        } else if (mediaType === 'video' || (mediaType === 'auto' && resolvedMime.startsWith('video/'))) {
          await socket.sendMessage(
            jid,
            {
              video: buffer,
              mimetype: resolvedMime,
              caption: formattedMessage || undefined,
            },
            {},
          )
        } else if (mediaType === 'audio' || (mediaType === 'auto' && resolvedMime.startsWith('audio/'))) {
          await socket.sendMessage(
            jid,
            {
              audio: buffer,
              mimetype: resolvedMime,
              ptt: false,
            },
            {},
          )
        } else {
          // Default to Document (PDF, Word, Excel, generic files, or mediaType === 'document')
          await socket.sendMessage(
            jid,
            {
              document: buffer,
              mimetype: resolvedMime,
              fileName: resolvedFileName,
              caption: formattedMessage || undefined,
            },
            {},
          )
        }
      } else {
        // Send Text Message
        await socket.sendMessage(jid, { text: formattedMessage }, {})
      }

      // 7. Update Log Status to SENT
      await fastify.db
        .update(messageLogs)
        .set({ status: 'SENT', updatedAt: new Date(), error: null })
        .where(eq(messageLogs.id, logId))

      fastify.log.info(`[Worker] Job ${job.id} COMPLETED. Message sent to ${to}`)

      return { success: true, sentTo: jid }
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    },
  )

  // Event Listeners for Failures
  worker.on('failed', async (job, err) => {
    fastify.log.error(`[Worker] Job ${job?.id} failed: ${err.message}`)
    if (job?.data?.logId) {
      try {
        await fastify.db
          .update(messageLogs)
          .set({ status: 'FAILED', error: err.message, updatedAt: new Date() })
          .where(eq(messageLogs.id, job.data.logId))
      } catch (dbErr) {
        fastify.log.error(dbErr as Error, '[Worker] Failed to update messageLog on failure')
      }
    }
  })

  // Graceful Shutdown Worker on Fastify close
  fastify.addHook('onClose', async () => {
    await worker.close()
  })

  return worker
}

