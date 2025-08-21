import cors from 'cors';

// Configuración de CORS
const corsOptions = {
  // Orígenes permitidos
  origin: function (origin, callback) {
    // Lista de dominios permitidos
    const allowedOrigins = [
      process.env.CORS_ORIGIN || 'http://localhost:3000',
      'http://localhost:3001', // Para testing
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    // En producción, agregar dominios reales
    if (process.env.NODE_ENV === 'production') {
      allowedOrigins.push(
        'https://misitofacil.com',
        'https://www.misitofacil.com',
        'https://app.misitofacil.com'
      );
    }

    // Permitir requests sin origin (apps móviles, Postman, etc.)
    if (!origin) return callback(null, true);

    // Verificar si el origin está en la lista permitida
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },

  // Métodos HTTP permitidos
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Headers permitidos
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-File-Name'
  ],

  // Headers expuestos al cliente
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'Content-Range'
  ],

  // Permitir cookies cross-origin
  credentials: true,

  // Cache de preflight requests (24 horas)
  maxAge: 86400,

  // Manejar preflight automáticamente
  preflightContinue: false,
  optionsSuccessStatus: 200 // Para IE11
};

// Configuración específica para rutas públicas
const publicCorsOptions = {
  origin: '*', // Permitir cualquier origen
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: false
};

// Configuración estricta para rutas administrativas
const adminCorsOptions = {
  origin: function (origin, callback) {
    const adminOrigins = [
      process.env.ADMIN_CORS_ORIGIN || 'http://localhost:3000'
    ];

    if (process.env.NODE_ENV === 'production') {
      adminOrigins.push('https://admin.misitofacil.com');
    }

    if (!origin || adminOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚫 Admin CORS blocked origin: ${origin}`);
      callback(new Error('Admin access not allowed from this origin'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
};

// Middleware principal de CORS
export const corsMiddleware = cors(corsOptions);

// CORS para rutas públicas (sitios web de negocios)
export const publicCors = cors(publicCorsOptions);

// CORS para rutas administrativas
export const adminCors = cors(adminCorsOptions);

// Middleware personalizado con logging
export const corsWithLogging = (req, res, next) => {
  const origin = req.get('Origin') || req.get('Referer') || 'unknown';
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🌐 CORS request from: ${origin} to ${req.method} ${req.path}`);
  }
  
  corsMiddleware(req, res, next);
};

// Función para verificar si un origin está permitido
export const isOriginAllowed = (origin) => {
  const allowedOrigins = [
    process.env.CORS_ORIGIN || 'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000'
  ];

  if (process.env.NODE_ENV === 'production') {
    allowedOrigins.push(
      'https://misitofacil.com',
      'https://www.misitofacil.com'
    );
  }

  return allowedOrigins.includes(origin);
};

export default corsMiddleware;