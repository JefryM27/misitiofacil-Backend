// src/config/security/cors.js
import cors from 'cors';

const isProd = process.env.NODE_ENV === 'production';

/* ────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────── */
const normalizeOrigin = (o = '') =>
  o.trim().toLowerCase().replace(/\/+$/, '');

const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
const splitCsv = (s = '') => uniq(s.split(',').map((x) => normalizeOrigin(x)));

const log = (...args) => {
  if (process.env.DEBUG_ROUTES === 'true') console.log(...args);
};

/* ────────────────────────────────────────────────────────────
 * Build allowlists
 * - DEV: FRONTEND_URL, CORS_ORIGINS y defaults locales
 * - PROD: dominios oficiales + FRONTEND_URL/CORS_ORIGINS
 * - Opcional: previews de Vercel (ALLOW_VERCEL_PREVIEWS=true)
 * ──────────────────────────────────────────────────────────── */
const DEFAULT_PROD_ORIGINS = [
  'https://misitiofacil.com',
  'https://www.misitiofacil.com',
  'https://app.misitiofacil.com',
  'https://misitofacil.com',
  'https://www.misitofacil.com'
].map(normalizeOrigin);

function buildDevOrigins() {
  const fromEnv = splitCsv(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '');
  const port = process.env.PORT || 3001;
  const defaults = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`
  ].map(normalizeOrigin);
  const frontend = normalizeOrigin(process.env.FRONTEND_URL || '');
  return uniq([frontend, ...fromEnv, ...defaults]);
}

function buildProdOrigins() {
  const fromEnv = splitCsv(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '');
  const frontend = normalizeOrigin(process.env.FRONTEND_URL || '');
  const admin = normalizeOrigin(process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_CORS_ORIGIN || '');
  // APP_URL es la URL de la API; no debería ser usada como origin del browser, pero no hace daño tenerla
  const appUrl = normalizeOrigin(process.env.APP_URL || '');

  return uniq([
    ...DEFAULT_PROD_ORIGINS,
    frontend,
    admin,
    appUrl,
    ...fromEnv
  ]);
}

// Patrones (regex) opcionales — útiles para previews
const PATTERNS = [];
if (process.env.ALLOW_VERCEL_PREVIEWS === 'true') {
  PATTERNS.push(/^https:\/\/[a-z0-9-]+\.vercel\.app$/);
}
if (process.env.ALLOW_ALL_HTTP_LOCALHOST === 'true') {
  PATTERNS.push(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
}

const DEV_ORIGINS = buildDevOrigins();
const PROD_ORIGINS = buildProdOrigins();

function matchesPatterns(origin) {
  if (!origin) return false;
  return PATTERNS.some((re) => re.test(origin));
}

function isAllowed(origin) {
  if (!origin) return true; // same-origin, curl, Postman
  const o = normalizeOrigin(origin);
  if (isProd) {
    return PROD_ORIGINS.includes(o) || matchesPatterns(o);
  }
  // dev
  if (DEV_ORIGINS.includes(o)) return true;
  return process.env.ALLOW_DEV_TOOLS === 'true' || matchesPatterns(o);
}

/* ────────────────────────────────────────────────────────────
 * CORS options (amigable con Swagger)
 * ──────────────────────────────────────────────────────────── */
const DEFAULT_ALLOWED = [
  'authorization',
  'content-type',
  'accept',
  'x-requested-with',
  'x-file-name',
  'x-api-key',
  'accept-language',
  'x-forwarded-for',
  'origin',
  'referer'
];

const corsOptions = {
  origin(origin, callback) {
    if (isAllowed(origin)) {
      if (!origin) log('🌐 CORS: allow same-origin/no-origin');
      else log(`🌐 CORS allow: ${origin}`);
      return callback(null, true);
    }
    console.warn(`🚫 CORS blocked: ${origin} (${isProd ? 'prod' : 'dev'})`);
    return callback(new Error('Not allowed by CORS'));
  },

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: (req, cb) => {
    const raw = req.header('Access-Control-Request-Headers') || '';
    const requested = uniq(
      raw
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    );
    const headers = uniq([...requested, ...DEFAULT_ALLOWED]);
    log('🔎 CORS allowedHeaders →', headers.join(','));
    cb(null, headers);
  },

  exposedHeaders: [
    'x-total-count',
    'x-page-count',
    'content-range',
    'x-rate-limit-remaining',
    'x-rate-limit-reset'
  ],

  credentials: process.env.CORS_CREDENTIALS === 'true', // activa solo si usas cookies
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/* ────────────────────────────────────────────────────────────
 * Middlewares exportados (API estable)
 * ──────────────────────────────────────────────────────────── */
export const corsMiddleware = cors(corsOptions);

// Público (sin credenciales)
export const publicCors = cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['content-type', 'accept'],
  credentials: false
});

// Admin CORS — usa ADMIN_* y también respeta whitelists
export const adminCors = cors({
  origin(origin, callback) {
    const adminOrigins = uniq([
      normalizeOrigin(process.env.ADMIN_CORS_ORIGIN || ''),
      normalizeOrigin(process.env.ADMIN_FRONTEND_URL || ''),
      ...(isProd ? PROD_ORIGINS : DEV_ORIGINS)
    ]).filter(Boolean);

    if (!origin) return callback(null, true);
    const o = normalizeOrigin(origin);
    if (adminOrigins.includes(o) || matchesPatterns(o)) return callback(null, true);

    console.warn(`🚫 Admin CORS blocked: ${origin}`);
    return callback(new Error('Admin access not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});

export const corsWithLogging = (req, res, next) => {
  if (process.env.DEBUG_ROUTES === 'true') {
    const origin = req.get('Origin') || req.get('Referer') || 'no-origin';
    console.log('🌐 CORS Request:', {
      origin,
      method: req.method,
      path: req.path,
      ua: (req.get('User-Agent') || '').slice(0, 60),
      acrh: req.header('Access-Control-Request-Headers') || ''
    });
  }
  corsMiddleware(req, res, next);
};

// Check programático (útil en tests)
export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  const o = normalizeOrigin(origin);
  return isProd ? PROD_ORIGINS.includes(o) || matchesPatterns(o) : DEV_ORIGINS.includes(o) || matchesPatterns(o);
};

/* ────────────────────────────────────────────────────────────
 * Aplicación global de CORS (incluye preflight amable)
 * ──────────────────────────────────────────────────────────── */
export function applyCors(app) {
  console.log('🌐 Configurando CORS...');
  if (!isProd) {
    console.log('📋 Dev origins:', DEV_ORIGINS);
    console.log(`🔧 Dev tools: ${process.env.ALLOW_DEV_TOOLS === 'true' ? 'ENABLED' : 'DISABLED'}`);
  } else {
    console.log('🏭 Prod origins:', PROD_ORIGINS);
    if (PATTERNS.length) console.log('🧩 CORS patterns activos:', PATTERNS.map(String));
  }

  // Preflight permisivo (útil para Swagger/SDKs)
  app.options('*', (req, res) => {
    corsMiddleware(req, res, (err) => {
      if (err) {
        console.error('❌ CORS Preflight error:', err.message);
        return res.status(403).json({ error: 'CORS blocked', message: err.message });
      }
      return res.sendStatus(204);
    });
  });

  // CORS para todas las rutas
  app.use((req, res, next) => {
    corsMiddleware(req, res, (err) => {
      if (err) {
        console.error('❌ CORS error:', err.message, 'for', req.get('Origin'));
        return res.status(403).json({ error: 'CORS blocked', message: err.message });
      }
      next();
    });
  });

  console.log('✅ CORS configurado (Swagger-friendly)');
}

export const debugCors = (req, _res, next) => {
  if (process.env.DEBUG_ROUTES === 'true') {
    console.log('\n🔍 CORS Debug', {
      method: req.method,
      path: req.path,
      origin: req.get('Origin') || 'same-origin',
      referer: req.get('Referer') || 'no-referer',
      headers: Object.keys(req.headers)
    });
  }
  next();
};

export default corsMiddleware;
