// src/app.js — Clean, production-ready setup for MiSitioFácil API
// ─────────────────────────────────────────────────────────────
// Loads env, configures security (Helmet/CORS), rate limits,
// parsers, logging, routes (/api), Swagger (/api-docs),
// static files (/uploads in dev), health endpoints and DB connection.
// Exports startServer(), closeDatabase() and the Express app.
// ─────────────────────────────────────────────────────────────

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { applyCors } from './config/security/cors.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/docs/swagger.js';

import { config, constants, logger, systemLogger } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/index.js';

// Pull environment constants (fallbacks included)
const { PORT = 3001, NODE_ENV = 'development' } = constants || {};
const isProd = NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1); // behind Vercel/Proxies, get real client IP

// Lightweight ping for LB diagnostics
app.get('/_ping', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─────────────────────────────────────────────────────────────
// Security: Helmet (CSP strict in prod, disabled in dev)
// ─────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            "default-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "script-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "https:"],
            "connect-src": ["'self'"],
            "upgrade-insecure-requests": null
          }
        }
      : false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
  })
);

// ─────────────────────────────────────────────────────────────
// Compression & CORS (global, before routes)
// ─────────────────────────────────────────────────────────────
app.use(compression());
applyCors(app);

// ─────────────────────────────────────────────────────────────
// DB connection (serverless-friendly)
// - On Vercel we don't run startServer(); connect on first request.
// - Reuse connection while the runtime stays warm.
// ─────────────────────────────────────────────────────────────
const connectDatabase = async () => {
  const mongoUri = config?.database?.mongodb?.uri;
  if (!mongoUri) throw new Error('MONGODB_URI is not defined in config');
  if (mongoUri.includes('<db_password>')) throw new Error('MONGODB_URI contains placeholder <db_password>');

  try {
    if (mongoose.connection.readyState === 1) return; // already connected
    const start = Date.now();
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: config?.database?.mongodb?.timeoutMs || 15000,
      maxPoolSize: config?.database?.mongodb?.maxPoolSize || 10,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    });
    logger.info('✅ MongoDB connected', {
      host: conn.connection.host,
      db: conn.connection.name,
      tookMs: Date.now() - start
    });

    mongoose.connection.on('error', (err) => logger.error('❌ Mongo error:', err?.message || err));
    mongoose.connection.on('disconnected', () => logger.warn('⚠️ MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('🔄 MongoDB reconnected'));
  } catch (error) {
    logger.error('❌ MONGODB ERROR:', error?.message || error);
    if (isProd) throw error;
    logger.warn('ℹ️ Continuing without DB (development). /health will show ERROR.');
  }
};

// Connect once per runtime before handling routes
let mongoReadyPromise;
app.use(async (_req, _res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      mongoReadyPromise ??= connectDatabase();
      await mongoReadyPromise;
    }
    next();
  } catch (e) {
    next(e);
  }
});

// ─────────────────────────────────────────────────────────────
// Rate limiting (global + tighter for /api/auth) with real IP
// ─────────────────────────────────────────────────────────────
const getRealIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.socket?.remoteAddress ||
  req.ip;

const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || (isProd ? 100 : 1000)),
  message: { error: 'Too many requests from this IP, try again in 15 minutes.', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRealIp,
  skip: (req) => process.env.SKIP_RATE_LIMIT === 'true' || ['127.0.0.1', '::1'].includes(getRealIp(req))
});
app.use(generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts, try again in 15 minutes.', retryAfter: '15 minutes' },
  skipSuccessfulRequests: true,
  keyGenerator: getRealIp,
  skip: (req) => NODE_ENV === 'development' && ['127.0.0.1', '::1'].includes(getRealIp(req))
});
app.use('/api/auth', authLimiter);

// ─────────────────────────────────────────────────────────────
// Parsers & Logging (must be before routes)
// ─────────────────────────────────────────────────────────────
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      if (!buf?.length) return;
      try {
        JSON.parse(buf.toString());
      } catch {
        res.status(400).json({ error: 'Invalid JSON' });
        throw new Error('Invalid JSON');
      }
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { skip: (_req, res) => res.statusCode < 400 }));
}

// Optional debug (dev only)
if (!isProd && process.env.DEBUG_ROUTES === 'true') {
  app.use((req, _res, next) => {
    console.log(`🔍 ${req.method} ${req.originalUrl}`);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body parsed:', !!req.body, typeof req.body);
    next();
  });
}

// ─────────────────────────────────────────────────────────────
// Basic info endpoints
// ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const health = {
    status: mongoose.connection.readyState === 1 ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: config?.app?.version || '1.0.0',
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  };
  res.status(health.status === 'OK' ? 200 : 503).json(health);
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'MiSitioFácil API',
    version: config?.app?.version || '1.0.0',
    description: 'API REST for MiSitioFácil',
    endpoints: {
      auth: `/api/auth`,
      businesses: `/api/business`,
      services: `/api/services`,
      templates: `/api/templates`,
      users: `/api/users`,
      reservations: `/api/reservations`,
      uploads: `/api/uploads`
    },
    documentation: '/api-docs',
    status: 'Active',
    timestamp: new Date().toISOString()
  });
});

app.get('/', (_req, res) => {
  res.json({
    message: '🎉 MiSitioFácil API is running!',
    version: config?.app?.version || '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    docs: `/api-docs`
  });
});

// ─────────────────────────────────────────────────────────────
// API routes (single mount via routes/index.js)
// ─────────────────────────────────────────────────────────────
import apiRoutes from './routes/index.js';
app.use('/api', apiRoutes);

// ─────────────────────────────────────────────────────────────
// Static files (dev only; prod must use Cloudinary/S3)
// ─────────────────────────────────────────────────────────────
if (!isProd) {
  app.use('/uploads', express.static(config?.storage?.uploadPath || 'uploads'));
}

// ─────────────────────────────────────────────────────────────
// Swagger (same origin as API) — before error handlers
// ─────────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'MiSitioFácil API Docs'
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
app.get('/docs', (_req, res) => res.redirect(302, '/api-docs'));

// ─────────────────────────────────────────────────────────────
// Error handlers (keep LAST)
// ─────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────
// DB helpers (for local/testing)
// ─────────────────────────────────────────────────────────────
export const closeDatabase = async () => {
  try {
    await mongoose.connection.close().catch(() => {});
    logger.info('✅ MongoDB connection closed');
  } catch (e) {
    logger.warn('⚠️ Error while closing MongoDB:', e?.message || e);
  }
};

// ─────────────────────────────────────────────────────────────
// Local bootstrap (Vercel does NOT use this)
// ─────────────────────────────────────────────────────────────
export const startServer = async () => {
  try {
    await connectDatabase();
  } catch (e) {
    throw e;
  }

  const effPort = Number(PORT || 3001);
  const server = app.listen(effPort, '0.0.0.0', () => {
    logger.info(`🚀 Server listening on port ${effPort}`);
    logger.info(`📖 Docs:       http://localhost:${effPort}/api-docs`);
    logger.info(`🏥 Health:     http://localhost:${effPort}/health`);
    logger.info(`🌍 Env:        ${NODE_ENV}`);
    logger.info(`🔗 API base:   http://localhost:${effPort}/api`);
    systemLogger.startup?.(effPort);
  });

  server.timeout = 30000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  return server;
};

export default app;
