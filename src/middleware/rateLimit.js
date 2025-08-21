import rateLimit from 'express-rate-limit';

// Configuración general de rate limiting
const createRateLimit = (options = {}) => {
  const {
    windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message = 'Too many requests from this IP, please try again later.',
    standardHeaders = true,
    legacyHeaders = false,
    ...customOptions
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Rate limit exceeded',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders,
    legacyHeaders,
    // Función personalizada para generar la key del rate limit
    keyGenerator: (req) => {
      // Usar IP real considerando proxies
      return req.ip || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
             '0.0.0.0';
    },
    // Handler personalizado cuando se excede el límite
    handler: (req, res) => {
      console.warn(`🚨 Rate limit exceeded for IP: ${req.ip} on ${req.method} ${req.path}`);
      
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    },
    // Skip rate limiting en desarrollo si está configurado
    skip: (req) => {
      return process.env.NODE_ENV === 'development' && 
             process.env.SKIP_RATE_LIMIT === 'true';
    },
    ...customOptions
  });
};

// Rate limit general para toda la API
export const generalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP
  message: 'Too many requests from this IP, please try again in 15 minutes.'
});

// Rate limit estricto para autenticación
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Solo 5 intentos de login por IP
  message: 'Too many authentication attempts, please try again in 15 minutes.',
  skipSuccessfulRequests: true // No contar requests exitosos
});

// Rate limit para registro de usuarios
export const registerRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Solo 3 registros por hora por IP
  message: 'Too many account creation attempts, please try again in 1 hour.'
});

// Rate limit para upload de archivos
export const uploadRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 20, // 20 uploads por IP
  message: 'Too many file uploads, please try again in 10 minutes.'
});

// Rate limit para envío de emails/notificaciones
export const emailRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 emails por hora por IP
  message: 'Too many email requests, please try again in 1 hour.'
});

// Rate limit para reservas
export const bookingRateLimit = createRateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5, // 5 reservas por IP
  message: 'Too many booking attempts, please try again in 5 minutes.'
});

// Rate limit muy permisivo para rutas públicas (sitios web de negocios)
export const publicRateLimit = createRateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 requests por minuto
  message: 'Too many requests, please slow down.'
});

// Rate limit estricto para rutas administrativas
export const adminRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 requests por IP
  message: 'Too many admin requests, please try again in 15 minutes.'
});

// Rate limit para reset de contraseña
export const passwordResetRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Solo 3 intentos por hora
  message: 'Too many password reset attempts, please try again in 1 hour.'
});

// Rate limit por usuario autenticado (además del IP)
export const createUserRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 50,
    message = 'Too many requests from this user account.',
    ...customOptions
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'User rate limit exceeded',
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    keyGenerator: (req) => {
      // Usar user ID si está autenticado, sino IP
      if (req.user && req.user.id) {
        return `user:${req.user.id}`;
      }
      return `ip:${req.ip}`;
    },
    handler: (req, res) => {
      const identifier = req.user ? `User ${req.user.id}` : `IP ${req.ip}`;
      console.warn(`🚨 User rate limit exceeded for ${identifier} on ${req.method} ${req.path}`);
      
      res.status(429).json({
        error: 'User rate limit exceeded',
        message,
        retryAfter: Math.ceil(windowMs / 1000),
        timestamp: new Date().toISOString()
      });
    },
    ...customOptions
  });
};

// Rate limit específico para API endpoints críticos
export const criticalApiRateLimit = createUserRateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 10, // 10 requests por minuto por usuario
  message: 'Too many requests to critical API, please slow down.'
});

// Middleware para logging de rate limit hits
export const rateLimitLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Si es un 429 (Too Many Requests), loggear
    if (res.statusCode === 429) {
      console.warn(`📊 Rate limit hit: ${req.method} ${req.path} from ${req.ip}`);
      
      // En desarrollo, mostrar más detalles
      if (process.env.NODE_ENV === 'development') {
        console.warn(`   User-Agent: ${req.get('User-Agent')}`);
        console.warn(`   Headers: ${JSON.stringify(req.headers, null, 2)}`);
      }
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Función para crear rate limit dinámico basado en el endpoint
export const dynamicRateLimit = (req, res, next) => {
  const path = req.path;
  
  // Aplicar rate limit específico según la ruta
  if (path.includes('/auth/login') || path.includes('/auth/signin')) {
    return authRateLimit(req, res, next);
  } else if (path.includes('/auth/register') || path.includes('/auth/signup')) {
    return registerRateLimit(req, res, next);
  } else if (path.includes('/upload')) {
    return uploadRateLimit(req, res, next);
  } else if (path.includes('/admin')) {
    return adminRateLimit(req, res, next);
  } else if (path.includes('/public')) {
    return publicRateLimit(req, res, next);
  } else {
    return generalRateLimit(req, res, next);
  }
};

export default {
  generalRateLimit,
  authRateLimit,
  registerRateLimit,
  uploadRateLimit,
  emailRateLimit,
  bookingRateLimit,
  publicRateLimit,
  adminRateLimit,
  passwordResetRateLimit,
  createUserRateLimit,
  criticalApiRateLimit,
  rateLimitLogger,
  dynamicRateLimit
};