// src/middleware/security.js
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { constants, logger } from '../config/index.js';

const { NODE_ENV } = constants;

// ============== SECURITY HEADERS ==============
export const securityHeaders = (req, res, next) => {
  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevenir MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // (legacy) Filtro XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevenir referrer leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Prevenir DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Ocultar información de servidor
  res.removeHeader('X-Powered-By');

  // API specific headers
  res.setHeader('X-API-Version', process.env.API_VERSION || 'v1');
  res.setHeader('X-Request-ID', req.id || Math.random().toString(36).slice(2, 11));

  next();
};

// ============== RATE LIMITING ==============

// Rate limit general para toda la API
export const createGeneralRateLimit = () =>
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: NODE_ENV === 'production'
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
      : 1000,
    message: {
      error: 'Demasiadas solicitudes desde esta IP',
      message: 'Intenta de nuevo en unos minutos',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000) / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      NODE_ENV === 'development' &&
      (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1'),
    handler: (req, res) => {
      logger.warn('Rate limit alcanzado', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method,
      });
      res.status(429).json({
        error: 'Demasiadas solicitudes desde esta IP',
        message: 'Intenta de nuevo en unos minutos',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000) / 1000),
      });
    },
  });

// Rate limit estricto para autenticación
export const createAuthRateLimit = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS, 10) || 5,
    message: {
      error: 'Demasiados intentos de autenticación',
      message: 'Intenta de nuevo en 15 minutos',
      retryAfter: 900,
    },
    skipSuccessfulRequests: true,
    skip: (req) =>
      NODE_ENV === 'development' && (req.ip === '127.0.0.1' || req.ip === '::1'),
    handler: (req, res) => {
      logger.warn('Rate limit de autenticación alcanzado', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        email: req.body?.email || 'no-email',
        endpoint: req.originalUrl,
      });
      res.status(429).json({
        error: 'Demasiados intentos de autenticación',
        message: 'Intenta de nuevo en 15 minutos',
        retryAfter: 900,
      });
    },
  });

// Rate limit para uploads
export const createUploadRateLimit = () =>
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
      error: 'Demasiados uploads',
      message: 'Máximo 10 archivos por minuto',
      retryAfter: 60,
    },
    skip: (req) =>
      NODE_ENV === 'development' && (req.ip === '127.0.0.1' || req.ip === '::1'),
  });

// ============== SLOW DOWN ==============
export const createSlowDown = () =>
  slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: NODE_ENV === 'production' ? 50 : 500,
    delayMs: 500,
    maxDelayMs: 20000,
    skip: (req) =>
      NODE_ENV === 'development' && (req.ip === '127.0.0.1' || req.ip === '::1'),
  });

// ============== SANITIZACIÓN ==============
export const mongoSanitizer = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn('Intento de NoSQL injection detectado', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      key,
      url: req.originalUrl,
    });
  },
});

export const parameterPollutionProtection = hpp({
  whitelist: ['tags', 'categories', 'services', 'features', 'sort', 'fields'],
});

// ============== VALIDACIÓN DE ENTRADA ==============
export const sanitizeInput = (req, _res, next) => {
  const sanitizeString = (str) =>
    typeof str === 'string'
      ? str.trim().replace(/[<>]/g, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '')
      : str;

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = sanitizeString(key);
      sanitized[cleanKey] = sanitizeObject(value);
    }
    return sanitized;
  };

  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);

  next();
};

// ============== VALIDACIÓN DE CONTENIDO ==============
export const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (!contentType) {
      return res.status(400).json({ error: 'Content-Type header requerido' });
    }
    // Permitir application/json (con charset), form-data y urlencoded
    if (
      !contentType.includes('application/json') &&
      !contentType.includes('multipart/form-data') &&
      !contentType.includes('application/x-www-form-urlencoded')
    ) {
      return res.status(415).json({
        error: 'Content-Type no soportado',
        supported: ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'],
      });
    }
  }
  next();
};

// ============== PROTECCIÓN CSRF ==============
export const csrfProtection = (req, res, next) => {
  // Skip CSRF para requests safe y preflight
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Skip si viene con Authorization (APIs con token)
  if (req.get('Authorization')) return next();

  const origin = req.get('Origin') || req.get('Referer');
  const host = req.get('Host');

  if (!origin) {
    return res.status(403).json({ error: 'Origin header requerido para requests que modifican datos' });
  }

  const originHost = new URL(origin).host;
  if (originHost !== host) {
    logger.warn('Posible ataque CSRF detectado', {
      ip: req.ip,
      origin,
      host,
      userAgent: req.get('User-Agent'),
    });
    return res.status(403).json({ error: 'Request bloqueado por protección CSRF' });
  }

  next();
};

// ============== DETECCIÓN DE BOTS ==============
export const botDetection = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const botPatterns = [/bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i, /python/i, /php/i, /java/i, /go-http-client/i];
  const allowedBots = [/googlebot/i, /bingbot/i, /slackbot/i, /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i];

  const isBot = botPatterns.some((p) => p.test(userAgent));
  if (isBot && !allowedBots.some((p) => p.test(userAgent))) {
    logger.warn('Bot no autorizado detectado', { ip: req.ip, userAgent, url: req.originalUrl });
    return res.status(429).json({ error: 'Acceso restringido para bots automatizados' });
  }
  next();
};

// ============== PROTECCIÓN CONTRA ATAQUES ==============
export const attackDetection = (req, res, next) => {
  const { url, body, query } = req;
  const userAgent = req.get('User-Agent') || '';
  const patterns = [
    /(\bselect\b|\bunion\b|\binsert\b|\bdelete\b|\bdrop\b|\bcreate\b|\balter\b).*\bfrom\b/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /\.\.\//g,
    /\/etc\/passwd/i,
    /\/proc\/self\/environ/i,
    /cmd\.exe/i,
    /sh\s+-c/i,
    /exec\(/i,
    /eval\(/i,
  ];

  const check = (data) => {
    if (typeof data === 'string') return patterns.some((p) => p.test(data));
    if (data && typeof data === 'object') return Object.values(data).some(check);
    return false;
  };

  if (check(url) || check(JSON.stringify(body || {})) || check(JSON.stringify(query || {}))) {
    logger.error('Intento de ataque detectado', {
      ip: req.ip,
      userAgent,
      url,
      body: typeof body === 'object' ? JSON.stringify(body) : body,
      query,
    });
    return res.status(400).json({ error: 'Request bloqueado por contenido malicioso' });
  }
  next();
};

// ============== REQUEST SIZE LIMITING ==============
export const requestSizeLimit = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length'), 10) || 0;
  const maxSize = parseInt(process.env.MAX_REQUEST_SIZE, 10) || 10 * 1024 * 1024; // 10MB

  if (contentLength > maxSize) {
    logger.warn('Request demasiado grande', { ip: req.ip, contentLength, maxSize, url: req.originalUrl });
    return res.status(413).json({ error: 'Request demasiado grande', maxSize: `${Math.round(maxSize / 1024 / 1024)}MB` });
  }
  next();
};

// ✅ Instancias de rate limit
export const generalRateLimit = createGeneralRateLimit();
export const authRateLimit = createAuthRateLimit();
export const uploadRateLimit = createUploadRateLimit();

// ✅ apiSecurityMiddleware con bypass de preflight
//    (colócalo en routers como reservations)
export const apiSecurityMiddleware = [
  // Deja pasar preflights para que CORS responda 204
  (req, _res, next) => (req.method === 'OPTIONS' ? next() : next()),
  securityHeaders,
  generalRateLimit,
  mongoSanitizer,
  parameterPollutionProtection,
  sanitizeInput,
];

// ============== SECURITY PIPELINES ==============
export const securityMiddleware = [
  securityHeaders,
  mongoSanitizer,
  parameterPollutionProtection,
  sanitizeInput,
  validateContentType,
  csrfProtection,
  botDetection,
  attackDetection,
  requestSizeLimit,
];

export const strictSecurityMiddleware = [...securityMiddleware, authRateLimit];

export default {
  securityHeaders,
  createGeneralRateLimit,
  createAuthRateLimit,
  createUploadRateLimit,
  createSlowDown,
  mongoSanitizer,
  parameterPollutionProtection,
  sanitizeInput,
  validateContentType,
  csrfProtection,
  botDetection,
  attackDetection,
  requestSizeLimit,
  securityMiddleware,
  strictSecurityMiddleware,
  generalRateLimit,
  authRateLimit,
  uploadRateLimit,
  apiSecurityMiddleware,
};
