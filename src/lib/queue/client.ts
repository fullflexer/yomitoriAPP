import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const globalForRedis = globalThis as typeof globalThis & {
  redisConnection?: IORedis;
};

export function getRedisConnection() {
  if (!globalForRedis.redisConnection) {
    globalForRedis.redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }

  return globalForRedis.redisConnection;
}

export function createQueue<DataType = unknown>(
  name: string,
  options: Omit<QueueOptions, "connection"> = {},
) {
  return new Queue<DataType>(name, {
    connection: getRedisConnection(),
    ...options,
  });
}
