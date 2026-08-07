import Redis from 'ioredis';

let redisClient: Redis | null = null;

const redisHost = process.env.REDIS_HOST;
const redisPort = Number(process.env.REDIS_PORT || 6379);

if (redisHost) {
  try {
    redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    redisClient.on('error', (err) => {
      console.warn('Redis client error (graceful fallback active):', err.message);
    });
  } catch (e: any) {
    console.warn('Failed to initialize Redis client:', e.message);
  }
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

export async function isRedisConnected(): Promise<boolean> {
  if (!redisClient) return false;
  try {
    const ping = await redisClient.ping();
    return ping === 'PONG';
  } catch {
    return false;
  }
}
