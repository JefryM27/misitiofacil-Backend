#!/usr/bin/env node
/**
 * server.js — Bootstrap for MiSitioFácil Backend
 * - Carga .env ANTES de leer process.env
 * - Checks previos (Node, ENV, JWT)
 * - Arranca startServer() desde app.js y guarda httpServer
 * - Muestra URLs útiles (en dev)
 * - Apagado limpio centralizado (señales + errores globales)
 */

import dotenv from 'dotenv';
dotenv.config(); // ✅ Primero

// Logger simple (puedes cambiar a tu logger real)
const logger = console;

/* ----------------------------- Banner (ASCII) ----------------------------- */
const printBanner = () => {
  const banner = `
╔══════════════════════════════════════════════════════════════╗
║    ███╗   ███╗██╗███████╗██╗████████╗██╗ ██████╗             ║
║    ████╗ ████║██║██╔════╝██║╚══██╔══╝██║██╔═══██╗            ║
║    ██╔████╔██║██║███████╗██║   ██║   ██║██║   ██║            ║
║    ██║╚██╔╝██║██║╚════██║██║   ██║   ██║██║   ██║            ║
║    ██║ ╚═╝ ██║██║███████║██║   ██║   ██║╚██████╔╝            ║
║    ╚═╝     ╚═╝╚═╝╚══════╝╚═╝   ╚═╝   ╚═╝ ╚═════╝             ║
║            🚀 Backend API - Plataforma Web 🚀                ║
╚══════════════════════════════════════════════════════════════╝
`;
  console.log(banner);
};

/* ----------------------------- Pre-flight checks ----------------------------- */
const checkNodeVersion = () => {
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (Number.isNaN(major) || major < 18) {
    logger.error(`❌ Node.js ${nodeVersion} no es compatible. Requiere 18+.`);
    process.exit(1);
  }
  logger.info(`✅ Node.js ${nodeVersion} - Compatible`);
};

const checkEnvironmentVariables = () => {
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
  // Permite omitir DB en local con SKIP_DB=true
  const requireDb = process.env.SKIP_DB !== 'true';
  const required = ['JWT_SECRET', ...(requireDb ? ['MONGODB_URI'] : [])];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
    logger.error('💡 Copia .env.example a .env y configura las variables necesarias');
    process.exit(1);
  }
  logger.info('✅ Variables de entorno verificadas');
};

const checkJWTConfiguration = () => {
  const jwt = process.env.JWT_SECRET || '';
  if (jwt.length < 32) {
    logger.error('❌ JWT_SECRET debe tener al menos 32 caracteres');
    process.exit(1);
  }
  if (jwt === 'tu_jwt_secret_super_seguro_de_al_menos_32_caracteres_aqui') {
    logger.warn('⚠️ Usando JWT_SECRET por defecto. Cambia esto en producción.');
  }
  logger.info('✅ Configuración JWT válida');
};

/* ----------------------------- Info & utilidades ----------------------------- */
const NODE_ENV = process.env.NODE_ENV || 'development';
const EFFECTIVE_PORT = Number(process.env.PORT || 3001);
const EFFECTIVE_HOST = process.env.HOST || 'localhost';

const safeMask = (uri) => {
  if (!uri) return '(no definido)';
  try { return uri.replace(/\/\/.*@/, '//***:***@'); } catch { return '(valor inválido)'; }
};

const showEnvironmentInfo = () => {
  logger.info('📋 Información del entorno:');
  logger.info(`   Entorno: ${NODE_ENV}`);
  logger.info(`   Puerto: ${EFFECTIVE_PORT}`);
  logger.info(`   Base de datos: ${safeMask(process.env.MONGODB_URI)}`);
  if (NODE_ENV === 'development') {
    logger.info('🛠️ Modo desarrollo: CORS permisivo, logs detallados, hot reload');
  } else if (NODE_ENV === 'production') {
    logger.info('🏭 Modo producción: Seguridad y optimizaciones habilitadas');
  }
};

const showUsefulUrls = () => {
  if (NODE_ENV !== 'development') return;
  const base = `http://${EFFECTIVE_HOST}:${EFFECTIVE_PORT}`;
  logger.info('🔗 URLs útiles:');
  logger.info(`   API Base: ${base}/api`);
  logger.info(`   Auth: ${base}/api/auth`);
  logger.info(`   Business: ${base}/api/business`);
  logger.info(`   Services: ${base}/api/services`);
  logger.info(`   Reservations: ${base}/api/reservations`);
  logger.info(`   Documentación: ${base}/api-docs`);
  logger.info(`   Health Check: ${base}/health`);
};

const showUsefulCommands = () => {
  logger.info('🔧 Comandos útiles:');
  logger.info('   npm run dev     - Modo desarrollo con hot reload');
  logger.info('   npm start       - Iniciar en producción');
  logger.info('   npm test        - Ejecutar tests');
  logger.info('   npm run lint    - Linting');
};

/* ----------------------------- Main ----------------------------- */
let httpServer; // se asigna al iniciar
let closeDb;    // función de cierre de DB que seleccionaremos dinámicamente

const main = async () => {
  try {
    printBanner();
    logger.info('🚀 Iniciando MiSitioFácil Backend...');

    checkNodeVersion();
    checkEnvironmentVariables();
    checkJWTConfiguration();
    showEnvironmentInfo();

    logger.info('📦 Cargando aplicación Express...');
    // Carga app.js que exporta startServer() y closeDatabase()
    const { startServer, closeDatabase } = await import('./app.js');
    closeDb = typeof closeDatabase === 'function' ? closeDatabase : null;

    logger.info('🔌 Iniciando servidor HTTP...');
    httpServer = await startServer();

    logger.info('✅ Servidor iniciado exitosamente');
    showUsefulUrls();
    showUsefulCommands();
    logger.info('🎉 ¡MiSitioFácil Backend está listo para recibir requests!');
    return httpServer;
  } catch (error) {
    logger.error('❌ Error fatal al iniciar el servidor:', error);

    const msg = String(error?.message || '');
    if (msg.includes('EADDRINUSE')) {
      logger.error('💡 El puerto ya está en uso. Cambia PORT o cierra procesos en ese puerto.');
    }
    if (msg.includes('ECONNREFUSED') || msg.toLowerCase().includes('mongodb')) {
      logger.error('💡 Revisa conexión a MongoDB (URI, credenciales, red).');
    }
    if (msg.includes('JWT_SECRET')) {
      logger.error('💡 JWT_SECRET inválido o ausente.');
    }
    if (msg.includes('Cannot resolve module') || msg.includes('does not provide an export')) {
      logger.error('💡 Revisa rutas de archivos y exports/imports. Ejecuta `npm install` si aplica.');
    }
    process.exit(1);
  }
};

/* ----------------------------- Graceful shutdown ----------------------------- */
async function shutdown(signal, err) {
  try {
    if (err) {
      logger.error(`💥 Error no manejado (${signal}):`, err);
    } else {
      logger.info(`\n🛑 Recibido ${signal}. Cerrando limpiamente...`);
    }

    // 1) Dejar de aceptar conexiones nuevas
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      logger.info('✅ HTTP server cerrado');
    }

    // 2) Cerrar base de datos (preferimos closeDatabase() de app.js)
    if (typeof closeDb === 'function') {
      await closeDb();
      logger.info('✅ Conexiones a DB cerradas (app.js)');
    } else {
      // Fallback opcional: intenta cerrar desde config/database/index.js si existe
      try {
        const mod = await import('./config/database/index.js');
        if (typeof mod.closeDatabases === 'function') {
          await mod.closeDatabases();
          logger.info('✅ Conexiones a DB cerradas (config/database/index.js)');
        }
      } catch {
        // silencioso
      }
    }

    logger.info('👋 Apagado completo. Bye!');
    process.exit(err ? 1 : 0);
  } catch (e) {
    logger.error('❌ Fallo durante el apagado:', e);
    process.exit(1);
  }
}

// Señales del sistema
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Errores globales
process.on('uncaughtException', (err) => shutdown('uncaughtException', err));
process.on('unhandledRejection', (err) => shutdown('unhandledRejection', err));

// Hot reload (nodemon)
if (NODE_ENV === 'development') {
  process.on('SIGUSR2', () => {
    logger.info('🔄 Reinicio solicitado por nodemon (SIGUSR2). Saliendo limpio...');
    process.exit(0);
  });
}

/* ----------------------------- Bootstrap ----------------------------- */
// ⚠️ En Vercel NO arrancamos el servidor (serverless)
if (!process.env.VERCEL) {
  main().catch((err) => {
    logger.error('❌ Error no manejado en bootstrap:', err);
    process.exit(1);
  });
}

export default main;
