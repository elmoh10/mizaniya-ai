import { Response, NextFunction } from 'express';
import { getRedisClient } from '../config/redis';
import { AuthenticatedRequest } from './authMiddleware';

const inMemoryStore: Record<string, { count: number; resetTime: number }> = {};

export function rateLimiter(limit: number = 60, windowMs: number = 60000, routeClass: string = 'api') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userIdentifier = req.user?.uid ? `uid:${req.user.uid}` : `ip:${req.ip || 'global'}`;
    const rateKey = `rate_limit:${routeClass}:${userIdentifier}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    const redis = getRedisClient();

    if (process.env.NODE_ENV === 'production') {
      if (!redis) {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Rate limiting service unavailable (Redis required in production)',
        });
      }

      try {
        const count = await redis.incr(rateKey);
        if (count === 1) {
          await redis.expire(rateKey, windowSeconds);
        }

        if (count > limit) {
          const ttl = await redis.ttl(rateKey);
          return res.status(429).json({
            error: 'Too many requests. Please slow down and try again later.',
            retryAfterMs: (ttl > 0 ? ttl : windowSeconds) * 1000,
          });
        }
        return next();
      } catch (err) {
        console.error('Production Redis rate limiter error:', err);
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Rate limiting service error in production',
        });
      }
    }

    if (redis) {
      try {
        const count = await redis.incr(rateKey);
        if (count === 1) {
          await redis.expire(rateKey, windowSeconds);
        }

        if (count > limit) {
          const ttl = await redis.ttl(rateKey);
          return res.status(429).json({
            error: 'Too many requests. Please slow down and try again later.',
            retryAfterMs: (ttl > 0 ? ttl : windowSeconds) * 1000,
          });
        }
        return next();
      } catch (err) {
        console.warn('Redis rate limiter error, falling back to memory:', err);
      }
    }

    const now = Date.now();
    const entry = inMemoryStore[rateKey];

    if (!entry || now > entry.resetTime) {
      inMemoryStore[rateKey] = {
        count: 1,
        resetTime: now + windowMs,
      };
      return next();
    }

    entry.count++;
    if (entry.count > limit) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down and try again later.',
        retryAfterMs: entry.resetTime - now,
      });
    }

    next();
  };
}
