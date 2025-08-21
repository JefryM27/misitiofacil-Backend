// app.js - VERSIÓN CORREGIDA (robusta contra DB caída)
import dotenv from 'dotenv';
dotenv.config(); // ✅ Asegura variables de entorno disponibles
// ── Mantenemos tu estilo y estructura ─────────────────────────────────────────

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { 
  config,
  constants, 
  logger,
  systemLogger,
  security,
} from './config/index.js';

import { 
  errorHandler, 
  notFoundHandler,
} from './middleware/index.js';


const { PORT = 3001, NODE_ENV = 'development' } = constants;

// Crear aplicación Express
const app = express();

// Configuración de email desde config
const email = config.email;
console.log('📧 Configuración de email:', email);

// =================== SEGURIDAD BÁSICA ===================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

app.use(compression());

// =================== CORS ===================
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, apps móviles, etc.
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'https://misitiofacil.com',
      'https://www.misitiofacil.com',
      'https://app.misitiofacil.com'
    ];
    if (NODE_ENV === 'development') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
};
app.use(cors(corsOptions));

// =================== RATE LIMITING ===================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: { 
    error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo en 15 minutos.', 
    retryAfter: '15 minutes' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { 
    error: 'Demasiados intentos de login, intenta de nuevo en 15 minutos.', 
    retryAfter: '15 minutes' 
  },
  skipSuccessfulRequests: true,
  skip: (req) => NODE_ENV === 'development' && (req.ip === '127.0.0.1' || req.ip === '::1')
});

// Rate limiting para auth
app.use('/api/auth', authLimiter);

// =================== BODY PARSERS + LOGS ===================
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try { JSON.parse(buf); } 
    catch (e) { 
      res.status(400).json({ error: 'Invalid JSON' }); 
      throw new Error('Invalid JSON'); 
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { skip: (req, res) => res.statusCode < 400 }));
}

// =================== ENDPOINTS BÁSICOS ===================
app.get('/health', (req, res) => {
  // 🔁 Responde SIEMPRE, aunque la DB esté caída (status=ERROR, 503)
  const health = {
    status: mongoose.connection.readyState === 1 ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: config.app.version || '1.0.0',
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  };
  res.status(health.status === 'OK' ? 200 : 503).json(health);
});

app.get('/api', (req, res) => {
  res.json({
    name: 'MiSitioFácil API',
    version: config.app.version || '1.0.0',
    description: 'API REST para MiSitioFácil',
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

app.get('/', (req, res) => {
  res.json({
    message: '🎉 MiSitioFácil API está funcionando!',
    version: config.app.version || '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    docs: `/api-docs`,
    endpoints: {
      auth: `/api/auth`,
      business: `/api/business`,
      services: `/api/services`,
      reservations: `/api/reservations`,
      users: `/api/users`,
      templates: `/api/templates`
    }
  });
});

// =================== RUTAS DE LA API ===================
const loadRoutes = async () => {
  try {
    const { default: authRoutes } = await import('./routes/auth.routes.js').catch(() => ({ default: null }));
    if (authRoutes) { app.use('/api/auth', authRoutes); logger.info('✅ Rutas de autenticación cargadas'); }

    const { default: userRoutes } = await import('./routes/user.routes.js').catch(() => ({ default: null }));
    if (userRoutes) { app.use('/api/users', userRoutes); logger.info('✅ Rutas de usuarios cargadas'); }

    const { default: businessRoutes } = await import('./routes/business.routes.js').catch(() => ({ default: null }));
    if (businessRoutes) { app.use('/api/business', businessRoutes); logger.info('✅ Rutas de negocios cargadas'); }

    const { default: serviceRoutes } = await import('./routes/service.routes.js').catch(() => ({ default: null }));
    if (serviceRoutes) { app.use('/api/services', serviceRoutes); logger.info('✅ Rutas de servicios cargadas'); }

    const { default: reservationRoutes } = await import('./routes/reservation.routes.js').catch(() => ({ default: null }));
    if (reservationRoutes) { app.use('/api/reservations', reservationRoutes); logger.info('✅ Rutas de reservas cargadas'); }

    const { default: templateRoutes } = await import('./routes/template.routes.js').catch(() => ({ default: null }));
    if (templateRoutes) { app.use('/api/templates', templateRoutes); logger.info('✅ Rutas de plantillas cargadas'); }

    const { default: swaggerSetup } = await import('./utils/swagger.js').catch(() => ({ default: null }));
    if (swaggerSetup) { swaggerSetup(app); logger.info('✅ Documentación Swagger configurada'); }

  } catch (error) {
    logger.warn('⚠️  Error cargando algunas rutas:', error.message);
  }
};

// Cargar rutas
await loadRoutes();

// Servir archivos estáticos
app.use('/uploads', express.static(config.storage.uploadPath || 'uploads'));

// =================== SWAGGER ===================
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/docs/swagger.js';

// UI en /api-docs y JSON en /api-docs.json
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'MiSitioFácil API Docs',
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));


// =================== MANEJO DE ERRORES ===================
app.use(notFoundHandler);
app.use(errorHandler);


// =================== CONEXIÓN A BASE DE DATOS ===================
// 🔥 CAMBIO CLAVE: el servidor arranca SIEMPRE; la DB se conecta en paralelo.
//    Si la DB falla, LOGUEAMOS pero NO tumbamos el server en desarrollo.
const connectDatabase = async () => {
  try {
    console.log('\n=== CONEXIÓN MONGODB ===');
    const mongoUri = config.database.mongodb.uri;

    if (!mongoUri) throw new Error('MONGODB_URI no definida en config');

    if (mongoUri.includes('<db_password>')) {
      throw new Error('URI contiene placeholder <db_password>');
    }

    const startTime = Date.now();
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: config.database.mongodb.timeoutMs || 15000,
      maxPoolSize: config.database.mongodb.maxPoolSize || 10,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority'
    });
    const endTime = Date.now();

    console.log('✅ ¡CONEXIÓN EXITOSA!');
    console.log(`⏱️ Tiempo de conexión: ${endTime - startTime}ms`);
    console.log(`🌐 Host: ${conn.connection.host}`);
    console.log(`📊 DB: ${conn.connection.name}`);
    console.log('=== FIN CONEXIÓN MONGODB ===\n');

    mongoose.connection.on('error', (err) => console.error('❌ Mongo error:', err.message));
    mongoose.connection.on('disconnected', () => console.log('⚠️ MongoDB desconectado'));
    mongoose.connection.on('reconnected', () => console.log('🔄 MongoDB reconectado'));
  } catch (error) {
    console.error('\n❌ ERROR MONGODB:', error.message);

    // 👉 No tumbamos el server en desarrollo; sí en producción
    if (NODE_ENV === 'production') {
      process.exit(1);
    } else {
      console.error('ℹ️ Continuando sin DB (development). /health mostrará ERROR.');
    }
  }
};

// =================== FUNCIÓN PARA INICIAR SERVIDOR ===================
const startServer = async () => {
  try {
    // ⬅️ Arrancamos servidor primero para evitar ECONNREFUSED
    const server = app.listen(Number(PORT || 3001), '0.0.0.0', () => {
      const eff = Number(PORT || 3001);
      logger.info(`🚀 Servidor ejecutándose en puerto ${eff}`);
      logger.info(`📖 Documentación: http://localhost:${eff}/api-docs`);
      logger.info(`🏥 Health check: http://localhost:${eff}/health`);
      logger.info(`🌍 Entorno: ${NODE_ENV}`);
      logger.info(`🔗 API Base: http://localhost:${eff}/api`);

      if (NODE_ENV === 'development') {
        logger.info('🔧 CORS habilitado para desarrollo');
        logger.info('🐌 Rate limiting relajado para desarrollo');
      }

      systemLogger.startup(eff);
    });

    // Conectar a la base de datos en paralelo (no bloquea el arranque)
    connectDatabase(); // deliberate fire-and-forget en dev

    // Timeouts
    server.timeout = 30000;
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`📡 Señal ${signal} recibida, cerrando servidor...`);
      systemLogger.shutdown(signal);
      
      server.close(async (err) => {
        if (err) { 
          logger.error('❌ Error al cerrar servidor:', err); 
          process.exit(1); 
        }
        try { 
          await mongoose.connection.close().catch(() => {});
          logger.info('✅ Servidor cerrado correctamente'); 
          process.exit(0); 
        } catch (error) { 
          logger.error('❌ Error durante el cierre:', error); 
          process.exit(1); 
        }
      });

      setTimeout(() => { 
        logger.error('🚨 Forzando cierre del servidor...'); 
        process.exit(1); 
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });
    process.on('uncaughtException', (error) => {
      logger.error('🚨 Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    return server;

  } catch (error) {
    logger.error('❌ Error al inicializar servidor:', error);
    process.exit(1);
  }
};

// =================== EXPORTS ===================
export default app;
export { startServer };

// ❗ No auto-iniciar aquí. Deja que `server.js` controle el arranque.
// Si quieres permitir ejecución directa, descomenta este bloque:
// if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
//   startServer();
// }
