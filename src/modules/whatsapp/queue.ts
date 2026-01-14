import { Queue } from 'bullmq'
import { ConnectionOptions } from 'bullmq'

// Redis connection configuration
const redisOptions: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
}

export const messageQueue = new Queue(process.env.WA_QUEUE_NAME || 'wa-sending-queue', {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: Number(process.env.WA_QUEUE_ATTEMPTS) || 3,
    backoff: {
      type: 'exponential',
      delay: Number(process.env.WA_QUEUE_BACKOFF_DELAY) || 1000,
    },
    removeOnComplete: Number(process.env.WA_QUEUE_REMOVE_ON_COMPLETE) || 100,
    removeOnFail: Number(process.env.WA_QUEUE_REMOVE_ON_FAIL) || 500,
  },
})
