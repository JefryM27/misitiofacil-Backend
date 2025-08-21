import helmet from 'helmet';

// Configuración de Helmet para seguridad HTTP
const helmetConfig = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", // Para estilos inline necesarios
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      scriptSrc: [
        "'self'",
        // En desarrollo, permitir eval para herramientas de dev
        ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'",
        "data:", // Para imágenes base64
        "blob:", // Para imágenes blob
        "https:", // Para imágenes HTTPS
        "http://localhost:*", // Para desarrollo
        "https://res.cloudinary.com", // Si usas Cloudinary
        "https://images.unsplash.com" // Si usas Unsplash para placeholders
      ],
      mediaSrc: ["'self'", "data:", "blob:"],
      objectSrc: ["'none'"],
      connectSrc: [
        "'self'",
        "http://localhost:*", // Para desarrollo
        "https://api.misitofacil.com", // Tu API en producción
        "wss:", // Para WebSockets si los usas
        "https://cloudinary.com" // Si usas Cloudinary
      ],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    },
    // En desarrollo, ser más permisivo
    reportOnly: process.env.NODE_ENV === 'development'
  },

  // Cross Origin Embedder Policy
  crossOriginEmbedderPolicy: {
    policy: "credentialless" // Menos restrictivo que "require-corp"
  },

  // Cross Origin Opener Policy
  crossOriginOpenerPolicy: {
    policy: "same-origin-allow-popups"
  },

  // Cross Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: "cross-origin" // Permitir resources cross-origin
  },

  // DNS Prefetch Control
  dnsPrefetchControl: {
    allow: true
  },

  // Expect Certificate Transparency
  expectCt: {
    maxAge: 86400, // 24 horas
    enforce: process.env.NODE_ENV === 'production'
  },

  // Frame Options
  frameguard: {
    action: 'deny' // Prevenir clickjacking
  },

  // Hide Powered By
  hidePoweredBy: true,

  // HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },

  // IE No Open
  ieNoOpen: true,

  // No Sniff
  noSniff: true,

  // Origin Agent Cluster
  originAgentCluster: true,

  // Permitted Cross Domain Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: "none"
  },

  // Referrer Policy
  referrerPolicy: {
    policy: ["no-referrer-when-downgrade", "strict-origin-when-cross-origin"]
  },

  // X-Download-Options
  xssFilter: true
};

// Configuración específica para desarrollo
const developmentConfig = {
  ...helmetConfig,
  contentSecurityPolicy: {
    ...helmetConfig.contentSecurityPolicy,
    directives: {
      ...helmetConfig.contentSecurityPolicy.directives,
      scriptSrc: [
        "'self'",
        "'unsafe-eval'", // Para hot reload
        "'unsafe-inline'", // Para desarrollo
        "http://localhost:*"
      ]
    }
  },
  hsts: false // No HSTS en desarrollo local
};

// Configuración específica para producción
const productionConfig = {
  ...helmetConfig,
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    ...helmetConfig.contentSecurityPolicy,
    reportOnly: false // Aplicar CSP estrictamente en producción
  }
};

// Obtener configuración según el entorno
const getHelmetConfig = () => {
  switch (process.env.NODE_ENV) {
    case 'production':
      return productionConfig;
    case 'development':
      return developmentConfig;
    default:
      return helmetConfig;
  }
};

// Middleware principal de Helmet
export const helmetMiddleware = helmet(getHelmetConfig());

// Configuración específica para rutas de archivos estáticos
export const staticFilesHelmet = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false // Desactivar CSP para archivos estáticos
});

// Configuración específica para API endpoints
export const apiHelmet = helmet({
  ...getHelmetConfig(),
  contentSecurityPolicy: false // Las APIs no necesitan CSP
});

// Middleware para rutas públicas (sitios web de negocios)
export const publicHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:"],
      connectSrc: ["'self'", "https:"]
    }
  },
  frameguard: { action: 'sameorigin' }, // Permitir iframe para sitios web
  crossOriginResourcePolicy: { policy: "cross-origin" }
});

// Función para verificar headers de seguridad
export const checkSecurityHeaders = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🛡️ Security headers applied:', {
      'X-Content-Type-Options': res.get('X-Content-Type-Options'),
      'X-Frame-Options': res.get('X-Frame-Options'),
      'X-XSS-Protection': res.get('X-XSS-Protection'),
      'Strict-Transport-Security': res.get('Strict-Transport-Security')
    });
  }
  next();
};

export default helmetMiddleware;