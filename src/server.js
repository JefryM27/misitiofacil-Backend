#!/usr/bin/env node
/**
 * server.js — Bootstrap for MiSitioFácil Backend
 * - Loads .env BEFORE any process.env access
 * - Performs basic pre-flight checks (Node, env vars, JWT)
 * - Dynamically imports startServer() from app.js
 * - Prints useful URLs using the same effective PORT default
 */

import dotenv from 'dotenv';
dotenv.config(); // ✅ MUST be first so all process.env reads below are valid

import { logger } from './config/index.js';

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
  // NODE_ENV no lo hacemos bloqueante; le damos default 'development'
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

  const required = ['MONGODB_URI', 'JWT_SECRET'];
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

/* ----------------------------- Nice logs ----------------------------- */
const EFFECTIVE_PORT = Number(process.env.PORT || 3001); // Usa el mismo default que app.js
const EFFECTIVE_HOST = process.env.HOST || 'localhost';

const safeMask = (uri) => {
  if (!uri) return '(no definido)';
  try {
    return uri.replace(/\/\/.*@/, '//***:***@');
  } catch {
    return '(valor inválido)';
  }
};

const showEnvironmentInfo = () => {
  logger.info('📋 Información del entorno:');
  logger.info(`   Entorno: ${process.env.NODE_ENV}`);
  logger.info(`   Puerto: ${EFFECTIVE_PORT}`);
  logger.info(`   Base de datos: ${safeMask(process.env.MONGODB_URI)}`);

  if (process.env.NODE_ENV === 'development') {
    logger.info('🛠️ Modo desarrollo: CORS permisivo, logs detallados, hot reload');
  } else if (process.env.NODE_ENV === 'production') {
    logger.info('🏭 Modo producción: Seguridad y optimizaciones habilitadas');
  }
};

const showUsefulUrls = () => {
  if (process.env.NODE_ENV !== 'development') return;
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
const main = async () => {
  try {
    printBanner();
    logger.info('🚀 Iniciando MiSitioFácil Backend...');

    checkNodeVersion();
    checkEnvironmentVariables();
    checkJWTConfiguration();
    showEnvironmentInfo();

    logger.info('📦 Cargando aplicación Express...');
    // app.js debe exportar: export const startServer = async () => { ... return server }
    const { startServer } = await import('./app.js');

    logger.info('🔌 Iniciando servidor HTTP...');
    const server = await startServer(); // app.listen(PORT, '0.0.0.0', ...) dentro de app.js

    logger.info('✅ Servidor iniciado exitosamente');
    showUsefulUrls();
    showUsefulCommands();
    logger.info('🎉 ¡MiSitioFácil Backend está listo para recibir requests!');

    return server;
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

/* ----------------------------- Dev signals ----------------------------- */
if (process.env.NODE_ENV === 'development') {
  process.on('SIGUSR2', () => {
    logger.info('🔄 Reiniciando servidor (nodemon)...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('📁 Archivos modificados, reiniciando...');
    process.exit(0);
  });
}

/* ----------------------------- Bootstrap ----------------------------- */
main().catch((err) => {
  logger.error('❌ Error no manejado:', err);
  process.exit(1);
});

export default main;
