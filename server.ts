import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import apiRoutes from './src/backend/routes/apiRoutes';
import firebaseApp, { db } from './src/backend/config/firebaseAdmin';
import { isRedisConnected, getRedisClient } from './src/backend/config/redis';
import { validateBackendEnv } from './src/backend/config/env';

dotenv.config();
validateBackendEnv();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Environment-based CORS allowlist configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, postman)
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount Core API Router (v1 API Versioning)
app.use('/api/v1', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    system: 'Mizaniya AI',
    version: process.env.APP_VERSION || 'v6.3',
    gitSha: process.env.GIT_SHA || 'development',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

// Readiness probe (Dependency readiness check)
app.get('/ready', async (req, res) => {
  let firestoreConnected = false;
  let firestoreError: string | null = null;

  try {
    await db.collection('system_config').doc('flags').get();
    firestoreConnected = true;
  } catch (err: any) {
    firestoreError = err.message;
  }

  const adminInitialized = Boolean(firebaseApp);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const redisConnected = await isRedisConnected();
  const isProd = process.env.NODE_ENV === 'production';

  let isReady = firestoreConnected && adminInitialized;

  // In production, Redis IS a mandatory dependency for locks/rate limiting
  if (isProd && !redisConnected) {
    isReady = false;
  }

  const responseBody = {
    status: isReady ? 'ready' : 'degraded',
    services: {
      server: 'ok',
      firebaseAdmin: adminInitialized ? 'initialized' : 'failed',
      firestore: firestoreConnected ? 'connected' : `failed: ${firestoreError}`,
      geminiConfigured,
      redis: redisConnected ? 'connected' : (isProd ? 'failed_mandatory' : 'disabled_or_unavailable'),
    },
    timestamp: new Date().toISOString(),
  };

  if (!isReady) {
    return res.status(503).json(responseBody);
  }

  res.status(200).json(responseBody);
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Mizaniya AI Server running on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down HTTP server cleanly...`);
    server.close(() => {
      console.log('HTTP server closed.');
      const redis = getRedisClient();
      if (redis) {
        redis.quit().catch(() => {});
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forcing shutdown after 10s timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer();
