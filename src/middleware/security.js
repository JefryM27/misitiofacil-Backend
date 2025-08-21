// middleware/security.js
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
  
  // Habilitar filtro XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevenir referrer leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Prevenir DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  
  // Server information hiding
  res.removeHeader('X-Powered-By');
  
  // API specific headers
  res.setHeader('X-API-Version', process.env.API_VERSION || 'v1');
  res.setHeader('X-Request-ID', req.id || Math.random().toString(36).substr(2, 9));
  
  next();
};

// ============== RATE LIMITING ==============

// Rate limit general para toda la API
export const createGeneralRateLimit = () => {
  return rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: NODE_ENV === 'production' 
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 
      : 1000,
    message: {
      error: 'Demasiadas solicitudes desde esta IP',
      message: 'Intenta de nuevo en unos minutos',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting para requests internos en desarrollo
      return NODE_ENV === 'development' && 
             (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
    },
    // ✅ CORREGIDO: Cambiar onLimitReached por handler
    handler: (req, res) => {
      logger.warn('Rate limit alcanzado', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method
      });
      
      res.status(429).json({
        error: 'Demasiadas solicitudes desde esta IP',
        message: 'Intenta de nuevo en unos minutos',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
      });
    }
  });
};

// Rate limit estricto para autenticación
export const createAuthRateLimit = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5,
    message: {
      error: 'Demasiados intentos de autenticación',
      message: 'Intenta de nuevo en 15 minutos',
      retryAfter: 900 // 15 minutos en segundos
    },
    skipSuccessfulRequests: true,
    skip: (req) => {
      return NODE_ENV === 'development' && 
             (req.ip === '127.0.0.1' || req.ip === '::1');
    },
    // ✅ CORREGIDO: Cambiar onLimitReached por handler
    handler: (req, res) => {
      logger.warn('Rate limit de autenticación alcanzado', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        email: req.body?.email || 'no-email',
        endpoint: req.originalUrl
      });
      
      res.status(429).json({
        error: 'Demasiados intentos de autenticación',
        message: 'Intenta de nuevo en 15 minutos',
        retryAfter: 900
      });
    }
  });
};

// Rate limit para uploads
export const createUploadRateLimit = () => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // máximo 10 uploads por minuto
    message: {
      error: 'Demasiados uploads',
      message: 'Máximo 10 archivos por minuto',
      retryAfter: 60
    },
    skip: (req) => {
      return NODE_ENV === 'development' && 
             (req.ip === '127.0.0.1' || req.ip === '::1');
    }
  });
};

// ============== SLOW DOWN ==============
export const createSlowDown = () => {
  return slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutos
    delayAfter: NODE_ENV === 'production' ? 50 : 500, // empezar a ralentizar después de X requests
    delayMs: 500, // añadir 500ms de delay por cada request extra
    maxDelayMs: 20000, // máximo 20 segundos de delay
    skip: (req) => {
      return NODE_ENV === 'development' && 
             (req.ip === '127.0.0.1' || req.ip === '::1');
    }
  });
};

// ============== SANITIZACIÓN ==============

// Sanitización contra NoSQL injection
export const mongoSanitizer = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    logger.warn('Intento de NoSQL injection detectado', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      key,
      url: req.originalUrl
    });
  }
});

// Protección contra HTTP Parameter Pollution
export const parameterPollutionProtection = hpp({
  whitelist: [
    // Parámetros que pueden tener múltiples valores
    'tags',
    'categories',
    'services',
    'features',
    'sort',
    'fields'
  ]
});

// ============== VALIDACIÓN DE ENTRADA ==============

// Sanitizar datos de entrada
export const sanitizeInput = (req, res, next) => {
  // Función helper para limpiar strings
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .trim()
      .replace(/[<>]/g, '') // Remover < y >
      .replace(/javascript:/gi, '') // Remover javascript:
      .replace(/on\w+=/gi, ''); // Remover event handlers
  };

  // Función recursiva para sanitizar objetos
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = sanitizeString(key);
      sanitized[cleanKey] = sanitizeObject(value);
    }
    return sanitized;
  };

  // Sanitizar body, query y params
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// ============== VALIDACIÓN DE CONTENIDO ==============

// Verificar Content-Type para requests POST/PUT
export const validateContentType = (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    if (!contentType) {
      return res.status(400).json({
        error: 'Content-Type header requerido'
      });
    }

    // Permitir application/json y multipart/form-data
    if (!contentType.includes('application/json') && 
        !contentType.includes('multipart/form-data') &&
        !contentType.includes('application/x-www-form-urlencoded')) {
      return res.status(415).json({
        error: 'Content-Type no soportado',
        supported: ['application/json', 'multipart/form-data']
      });
    }
  }
  
  next();
};

// ============== PROTECCIÓN CSRF ==============

// Simple CSRF protection para requests que modifican datos
export const csrfProtection = (req, res, next) => {
  // Skip CSRF para requests GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip para requests con Authorization header (API tokens)
  if (req.get('Authorization')) {
    return next();
  }

  // Verificar que el request viene del mismo origin
  const origin = req.get('Origin') || req.get('Referer');
  const host = req.get('Host');

  if (!origin) {
    return res.status(403).json({
      error: 'Origin header requerido para requests que modifican datos'
    });
  }

  const originHost = new URL(origin).host;
  if (originHost !== host) {
    logger.warn('Posible ataque CSRF detectado', {
      ip: req.ip,
      origin,
      host,
      userAgent: req.get('User-Agent')
    });

    return res.status(403).json({
      error: 'Request bloqueado por protección CSRF'
    });
  }

  next();
};

// ============== DETECCIÓN DE BOTS ==============

// Simple bot detection
export const botDetection = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  
  // Lista de user agents sospechosos
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /php/i,
    /java/i,
    /go-http-client/i
  ];

  const isBot = botPatterns.some(pattern => pattern.test(userAgent));
  
  if (isBot) {
    // Permitir bots conocidos y legítimos
    const allowedBots = [
      /googlebot/i,
      /bingbot/i,
      /slackbot/i,
      /facebookexternalhit/i,
      /twitterbot/i,
      /linkedinbot/i
    ];

    const isAllowedBot = allowedBots.some(pattern => pattern.test(userAgent));
    
    if (!isAllowedBot) {
      logger.warn('Bot no autorizado detectado', {
        ip: req.ip,
        userAgent,
        url: req.originalUrl
      });

      // Rate limit más agresivo para bots no autorizados
      return res.status(429).json({
        error: 'Acceso restringido para bots automatizados'
      });
    }
  }

  next();
};

// ============== PROTECCIÓN CONTRA ATAQUES ==============

// Detectar patrones de ataque comunes
export const attackDetection = (req, res, next) => {
  const { url, body, query } = req;
  const userAgent = req.get('User-Agent') || '';
  
  // Patrones maliciosos comunes
  const maliciousPatterns = [
    /(\bselect\b|\bunion\b|\binsert\b|\bdelete\b|\bdrop\b|\bcreate\b|\balter\b).*\bfrom\b/i, // SQL injection
    /<script[^>]*>.*?<\/script>/gi, // XSS
    /javascript:/gi, // XSS
    /on\w+\s*=/gi, // Event handlers
    /\.\.\//g, // Path traversal
    /\/etc\/passwd/i, // File inclusion
    /\/proc\/self\/environ/i, // File inclusion
    /cmd\.exe/i, // Command injection
    /sh\s+-c/i, // Command injection
    /exec\(/i, // Code injection
    /eval\(/i, // Code injection
  ];

  const checkForAttack = (data) => {
    if (typeof data === 'string') {
      return maliciousPatterns.some(pattern => pattern.test(data));
    }
    if (typeof data === 'object' && data !== null) {
      return Object.values(data).some(checkForAttack);
    }
    return false;
  };

  if (checkForAttack(url) || 
      checkForAttack(JSON.stringify(body)) || 
      checkForAttack(JSON.stringify(query))) {
    
    logger.error('Intento de ataque detectado', {
      ip: req.ip,
      userAgent,
      url,
      body: typeof body === 'object' ? JSON.stringify(body) : body,
      query
    });

    return res.status(400).json({
      error: 'Request bloqueado por contenido malicioso'
    });
  }

  next();
};

// ============== REQUEST SIZE LIMITING ==============

// Limitar tamaño de requests
export const requestSizeLimit = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length')) || 0;
  const maxSize = parseInt(process.env.MAX_REQUEST_SIZE) || 10 * 1024 * 1024; // 10MB por defecto

  if (contentLength > maxSize) {
    logger.warn('Request demasiado grande', {
      ip: req.ip,
      contentLength,
      maxSize,
      url: req.originalUrl
    });

    return res.status(413).json({
      error: 'Request demasiado grande',
      maxSize: `${Math.round(maxSize / 1024 / 1024)}MB`
    });
  }

  next();
};

// ✅ AGREGADO: Crear instancias de rate limiting
export const generalRateLimit = createGeneralRateLimit();
export const authRateLimit = createAuthRateLimit();
export const uploadRateLimit = createUploadRateLimit();

// ✅ AGREGADO: apiSecurityMiddleware que se necesita en auth.routes.js
export const apiSecurityMiddleware = [
  securityHeaders,
  generalRateLimit,
  mongoSanitizer,
  parameterPollutionProtection,
  sanitizeInput
];

// ============== EXPORTAR MIDDLEWARE DE SEGURIDAD COMBINADO ==============

export const securityMiddleware = [
  securityHeaders,
  mongoSanitizer,
  parameterPollutionProtection,
  sanitizeInput,
  validateContentType,
  csrfProtection,
  botDetection,
  attackDetection,
  requestSizeLimit
];

// Middleware específico para rutas sensibles
export const strictSecurityMiddleware = [
  ...securityMiddleware,
  authRateLimit
];

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
  // ✅ AGREGADO: Exportar instancias creadas
  generalRateLimit,
  authRateLimit,
  uploadRateLimit,
  apiSecurityMiddleware
};