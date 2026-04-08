import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Extract the first (client) IP from X-Forwarded-For, ignoring proxy chain */
export function extractIp(raw: string | null): string {
  if (!raw) return "unknown";
  return raw.split(",")[0].trim();
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** 10 requests per hour per IP */
export const registerLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:register",
});

/** 5 requests per 15 minutes per IP */
export const forgotPasswordLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:forgot-password",
});

/** 10 requests per hour per IP */
export const resetPasswordLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:reset-password",
});
