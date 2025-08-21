import { corsMiddleware, publicCors, adminCors, corsWithLogging } from './cors.js';
import { helmetMiddleware, staticFilesHelmet, apiHelmet, publicHelmet } from './helmet.js';
import rateLimitConfig from '../../middleware/rateLimit.js';

// Exportar todas las configuraciones de CORS
export const cors = {
  default: corsMiddleware,
  public: publicCors,
  admin: adminCors,
  withLogging: corsWithLogging
};

// Exportar todas las configuraciones de Helmet
export const helmet = {
  default: helmetMiddleware,
  staticFiles: staticFilesHelmet,
  api: apiHelmet,
  public: publicHelmet
};

// Exportar todas las configuraciones de Rate Limiting
export const rateLimit = rateLimitConfig;

// Middleware de seguridad combinado para APIs
export const apiSecurityMiddleware = [
  helmet.api,
  cors.default,
  rateLimit.generalRateLimit
];

// Middleware de seguridad para rutas públicas
export const publicSecurityMiddleware = [
  helmet.public,
  cors.public,
  rateLimit.publicRateLimit
];

// Middleware de seguridad para rutas administrativas
export const adminSecurityMiddleware = [
  helmet.default,
  cors.admin,
  rateLimit.adminRateLimit
];

// Middleware de seguridad para archivos estáticos
export const staticSecurityMiddleware = [
  helmet.staticFiles,
  cors.default,
  rateLimit.publicRateLimit
];

// Middleware de seguridad para autenticación
export const authSecurityMiddleware = [
  helmet.api,
  cors.default,
  rateLimit.authRateLimit
];

// Función para aplicar seguridad según el tipo de ruta
export const applySecurity = (type = 'api') => {
  switch (type) {
    case 'public':
      return publicSecurityMiddleware;
    case 'admin':
      return adminSecurityMiddleware;
    case 'static':
      return staticSecurityMiddleware;
    case 'auth':
      return authSecurityMiddleware;
    case 'api':
    default:
      return apiSecurityMiddleware;
  }
};

// Middleware de seguridad dinámico basado en la ruta
export const dynamicSecurity = (req, res, next) => {
  const path = req.path;
  let securityType = 'api';

  // Determinar tipo de seguridad según la ruta
  if (path.startsWith('/public') || path.startsWith('/sites')) {
    securityType = 'public';
  } else if (path.startsWith('/admin')) {
    securityType = 'admin';
  } else if (path.startsWith('/auth')) {
    securityType = 'auth';
  } else if (path.startsWith('/uploads') || path.startsWith('/static')) {
    securityType = 'static';
  }

  // Aplicar middleware de seguridad correspondiente
  const middlewares = applySecurity(securityType);
  
  // Ejecutar middlewares en secuencia
  let index = 0;
  const runNext = (err) => {
    if (err) return next(err);
    
    if (index >= middlewares.length) return next();
    
    const middleware = middlewares[index++];
    middleware(req, res, runNext);
  };

  runNext();
};

// Función para configurar headers de seguridad adicionales
export const additionalSecurityHeaders = (req, res, next) => {
  // Prevenir MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevenir XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevenir clickjacking para rutas específicas
  if (req.path.includes('/admin')) {
    res.setHeader('X-Frame-Options', 'DENY');
  }
  
  // Server header personalizado
  res.setHeader('Server', 'MiSitioFacil/1.0');
  
  // Headers de cache según el tipo de contenido
  if (req.path.includes('/uploads')) {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 horas para imágenes
  } else if (req.path.includes('/api')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  next();
};

// Middleware para logging de seguridad
export const securityLogger = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    const securityInfo = {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      origin: req.get('Origin'),
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    };
    
    console.log('🔒 Security info:', securityInfo);
  }
  
  next();
};

// Middleware para detectar intentos de ataque comunes
export const threatDetection = (req, res, next) => {
  const suspiciousPatterns = [
    /\.\.\//g, // Path traversal
    /<script/gi, // XSS
    /union.*select/gi, // SQL injection
    /javascript:/gi, // JavaScript injection
    /vbscript:/gi, // VBScript injection
    /onload=/gi, // Event handler injection
    /onerror=/gi // Event handler injection
  ];

  const checkString = `${req.url} ${JSON.stringify(req.query)} ${JSON.stringify(req.body)}`;
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      console.warn(`🚨 Suspicious activity detected from ${req.ip}: ${pattern}`);
      console.warn(`   Request: ${req.method} ${req.path}`);
      console.warn(`   User-Agent: ${req.get('User-Agent')}`);
      
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Request contains potentially malicious content'
      });
    }
  }
  
  next();
};

// Exportar configuración completa de seguridad
export default {
  cors,
  helmet,
  middleware: {
    api: apiSecurityMiddleware,
    public: publicSecurityMiddleware,
    admin: adminSecurityMiddleware,
    static: staticSecurityMiddleware,
    auth: authSecurityMiddleware
  },
  applySecurity,
  dynamicSecurity,
  additionalSecurityHeaders,
  securityLogger,
  threatDetection
};