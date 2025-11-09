import { rateLimiterClient } from "../lib/redisClient.js";
import { normalizeIP } from "./auth.js";

export async function consumeTokenBucket(
  req: any,
  max = 10,
  refillIntervalSeconds = 1,
  cost = 4
): Promise<boolean> {
  const clientIP = normalizeIP(req.ip);

  if (clientIP === null) {
    return true;
  }

  const result = await rateLimiterClient.tokenBucketConsume(
    `rate-limit:token-bucket:${clientIP}`,
    max.toString(),
    refillIntervalSeconds.toString(),
    cost.toString(),
    Math.floor(Date.now() / 1000).toString()
  );

  return Boolean(result[0]);
}

export async function consumeRetryBackoff(
  userId: any
): Promise<{ valid: boolean; secondsLeft: number }> {
  const result = await rateLimiterClient.retryBackoffConsume(
    `rate-limit:retry-backoff:${userId}`,
    Math.floor(Date.now() / 1000).toString()
  );

  return { valid: Boolean(result[0]), secondsLeft: Number(result[1]) };
}

export async function resetRetryBackoff(userId: any): Promise<void> {
  await rateLimiterClient.del(`rate-limit:retry-backoff:${userId}`);
}
