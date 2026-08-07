import { Response, NextFunction } from 'express';
import { getRedisClient } from '../config/redis';
import { AuthenticatedRequest } from './authMiddleware';

const PROCESSING_TTL_SECONDS = Number(process.env.IDEMPOTENCY_PROCESSING_TTL_SECONDS || 120);
const RETENTION_TTL_SECONDS = Number(process.env.IDEMPOTENCY_RETENTION_TTL_SECONDS || 86400);

const inMemoryIdempotency: Record<
  string,
  { state: 'PROCESSING' | 'COMPLETED'; status?: number; body?: any; timestamp: number }
> = {};

export async function idempotencyMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) {
    return next();
  }

  const userId = req.user?.uid || 'anonymous';
  const lockKey = `idempotency:${userId}:${req.path}:${idempotencyKey}`;
  const redis = getRedisClient();

  if (process.env.NODE_ENV === 'production') {
    if (!redis) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Idempotency service unavailable (Redis required in production)',
      });
    }

    try {
      const processingPayload = JSON.stringify({ state: 'PROCESSING' });
      const acquired = await redis.set(lockKey, processingPayload, 'EX', PROCESSING_TTL_SECONDS, 'NX');

      if (!acquired) {
        const existing = await redis.get(lockKey);
        if (existing) {
          const parsed = JSON.parse(existing);
          if (parsed.state === 'PROCESSING') {
            return res.status(409).json({
              error: 'TRANSACTION_IN_PROGRESS',
              message: 'Transaction processing in progress. Please wait.',
            });
          }
          if (parsed.state === 'COMPLETED') {
            return res.status(parsed.status || 200).json(parsed.body);
          }
        }
      }
    } catch (e) {
      console.error('Production Redis idempotency error:', e);
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Idempotency storage error in production',
      });
    }
  } else {
    // Development or local fallback
    if (redis) {
      try {
        const acquired = await redis.set(
          lockKey,
          JSON.stringify({ state: 'PROCESSING' }),
          'EX',
          PROCESSING_TTL_SECONDS,
          'NX'
        );
        if (!acquired) {
          const existing = await redis.get(lockKey);
          if (existing) {
            const parsed = JSON.parse(existing);
            if (parsed.state === 'PROCESSING') {
              return res.status(409).json({
                error: 'TRANSACTION_IN_PROGRESS',
                message: 'Transaction processing in progress. Please wait.',
              });
            }
            if (parsed.state === 'COMPLETED') {
              return res.status(parsed.status || 200).json(parsed.body);
            }
          }
        }
      } catch (e) {
        console.warn('Redis idempotency lookup failed:', e);
      }
    } else {
      const existing = inMemoryIdempotency[lockKey];
      if (existing) {
        const now = Date.now();
        if (existing.state === 'PROCESSING' && now - existing.timestamp < PROCESSING_TTL_SECONDS * 1000) {
          return res.status(409).json({
            error: 'TRANSACTION_IN_PROGRESS',
            message: 'Transaction processing in progress. Please wait.',
          });
        }
        if (existing.state === 'COMPLETED') {
          return res.status(existing.status || 200).json(existing.body);
        }
      }
      inMemoryIdempotency[lockKey] = { state: 'PROCESSING', timestamp: Date.now() };
    }
  }

  let completedSuccessfully = false;

  // Wrap res.json to handle successful responses
  const originalJson = res.json.bind(res);
  res.json = (body: any): Response => {
    completedSuccessfully = true;
    const completedPayload = { state: 'COMPLETED' as const, status: res.statusCode, body };
    if (redis) {
      redis.set(lockKey, JSON.stringify(completedPayload), 'EX', RETENTION_TTL_SECONDS).catch((err) => {
        console.warn('Failed to store completed idempotency state in Redis:', err);
      });
    } else if (process.env.NODE_ENV !== 'production') {
      inMemoryIdempotency[lockKey] = { ...completedPayload, timestamp: Date.now() };
    }
    return originalJson(body);
  };

  // Clean up lock if response fails or closes prematurely without completing
  res.on('close', () => {
    if (!completedSuccessfully) {
      if (redis) {
        redis.del(lockKey).catch(() => {});
      } else {
        delete inMemoryIdempotency[lockKey];
      }
    }
  });

  next();
}
