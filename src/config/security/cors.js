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
 * Allow lists
 * ──────────────────────────────────────────────────────────── */

// Dominio del front en Vercel (CORREGIDO)
const FRONT_VERCEL = normalizeOrigin('https://misitiofacil-frontend.vercel.app');
// Dominio del back en Vercel (añadido explícito, útil para herramientas/preview)
const BACKEND_VERCEL = normalizeOrigin('https://misitiofacil-backend.vercel.app');

// Dominios de producción (.org)
const DEFAULT_PROD_ORIGINS = [
  'https://misitiofacil.org',
  'https://www.misitiofacil.org',
  'https://app.misitiofacil.org'
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
  const appUrl = normalizeOrigin(process.env.APP_URL || ''); // opcional

  return uniq([
    ...DEFAULT_PROD_ORIGINS,
    FRONT_VERCEL,      // Front en Vercel
    BACKEND_VERCEL,    // Back en Vercel (por si usas herramientas con origen backend)
    frontend,          // ENV
    admin,             // ENV
    appUrl,            // ENV
    ...fromEnv         // ENV (lista separada por comas)
  ]);
}

// Patrones (wildcards/previews)
const PATTERNS = [];

// *.misitiofacil.org (subdominios por slug)
PATTERNS.push(/^https:\/\/(?:[^.]+\.)*misitiofacil\.org$/);

// *.vercel.app (previews/producción en Vercel), activable por ENV o automático en previews
if (process.env.ALLOW_VERCEL_PREVIEWS === 'true') {
  PATTERNS.push(/^https:\/\/[a-z0-9-]+\.vercel\.app$/);
}
if (process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'production') {
  PATTERNS.push(/^https:\/\/[a-z0-9-]+\.vercel\.app$/);
}

// localhost (dev apuntando a backend en Vercel)
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
  if (!origin) return true; // same-origin / curl / Postman
  const o = normalizeOrigin(origin);
  if (isProd) {
    return PROD_ORIGINS.includes(o) || matchesPatterns(origin);
  }
  if (DEV_ORIGINS.includes(o)) return true;
  return process.env.ALLOW_DEV_TOOLS === 'true' || matchesPatterns(origin);
}

/* ────────────────────────────────────────────────────────────
 * CORS options
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
    const requested = uniq(raw.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
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

  // Mantener controlado por ENV (por defecto false, como sugiere la guía)
  credentials: process.env.CORS_CREDENTIALS === 'true',

  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

/* ────────────────────────────────────────────────────────────
 * Middlewares exportados
 * ──────────────────────────────────────────────────────────── */
export const corsMiddleware = cors(corsOptions);

export const publicCors = cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['content-type', 'accept'],
  credentials: false
});

export const adminCors = cors({
  origin(origin, callback) {
    const adminOrigins = uniq([
      normalizeOrigin(process.env.ADMIN_CORS_ORIGIN || ''),
      normalizeOrigin(process.env.ADMIN_FRONTEND_URL || ''),
      ...(isProd ? PROD_ORIGINS : DEV_ORIGINS)
    ]).filter(Boolean);

    if (!origin) return callback(null, true);
    const o = normalizeOrigin(origin);
    if (adminOrigins.includes(o) || matchesPatterns(origin)) return callback(null, true);

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

export const isOriginAllowed = (origin) => {
  if (!origin) return true;
  const o = normalizeOrigin(origin);
  return isProd
    ? PROD_ORIGINS.includes(o) || matchesPatterns(origin)
    : DEV_ORIGINS.includes(o) || matchesPatterns(origin);
};

/* ────────────────────────────────────────────────────────────
 * Aplicación global de CORS
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

  // Preflight
  app.options('*', (req, res) => {
    corsMiddleware(req, res, (err) => {
      if (err) {
        console.error('❌ CORS Preflight error:', err.message);
        return res.status(403).json({ error: 'CORS blocked', message: err.message });
      }
      return res.sendStatus(204);
    });
  });

  // Global
  app.use((req, res, next) => {
    corsMiddleware(req, res, (err) => {
      if (err) {
        console.error('❌ CORS error:', err.message, 'for', req.get('Origin'));
        return res.status(403).json({ error: 'CORS blocked', message: err.message });
      }
      next();
    });
  });

  console.log('✅ CORS configurado');
}

export default corsMiddleware;
