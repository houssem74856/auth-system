import IORedis from "ioredis";
import { script1, script2 } from "../rate-limiting/scripts.js";

// For general app use (rate limiting, caching, etc.)
//@ts-ignore
const redisApp = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});

redisApp.defineCommand("tokenBucketConsume", {
  numberOfKeys: 1,
  lua: script1,
});

redisApp.defineCommand("retryBackoffConsume", {
  numberOfKeys: 1,
  lua: script2,
});

export default redisApp;

// For BullMQ
//@ts-ignore
export const redisWorkersConnection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});

//@ts-ignore
export const redisQueuesConnection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
});
