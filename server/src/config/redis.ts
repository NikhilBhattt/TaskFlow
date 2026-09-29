import config from "./config.js";

// Shared BullMQ/ioredis connection options for the job queue, the DLQ, and the worker.
export const redisConnection = {
  host: config.REDIS_HOST,
  port: Number(config.REDIS_PORT),
};

// For producer-side Queue objects used inside HTTP handlers: fail fast while Redis is
// unreachable instead of buffering commands (which would make API requests hang).
// The Worker keeps the default behaviour so it can reconnect and resume on its own.
export const producerConnection = {
  ...redisConnection,
  enableOfflineQueue: false,
};
