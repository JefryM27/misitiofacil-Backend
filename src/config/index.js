// Configuración principal que unifica todas las configuraciones
import { validateEnv, getConfig, showConfigSummary, checkProductionReadiness } from './env.js';
import { connectDatabases, closeDatabases, checkDatabaseHealth } from './database/index.js';
import storageConfig from './storage/index.js';
import securityConfig from './security/index.js';
import { CONSTANTS } from './constants.js';
import loggerConfig from './logger.js';

// Validar variables de entorno al importar
validateEnv();

// Obtener configuración procesada
const config = getConfig();

// Exportar configuraciones principales
export { config };

// Exportar configuraciones de base de datos
export const database = {
  connect: connectDatabases,
  close: closeDatabases,
  checkHealth: checkDatabaseHealth
};

// Exportar configuraciones de storage
export const storage = {
  ...storageConfig,
  // Acceso directo a configuraciones más usadas
  upload: storageConfig.upload,
  uploadLogo: storageConfig.uploadLogo,
  uploadCover: storageConfig.uploadCover,
  uploadGallery: storageConfig.uploadGallery,
  handleError: storageConfig.handleMulterError
};

// Exportar configuraciones de seguridad
export const security = {
  ...securityConfig,
  // Acceso directo a middleware más usados
  api: securityConfig.middleware.api,
  public: securityConfig.middleware.public,
  admin: securityConfig.middleware.admin,
  auth: securityConfig.middleware.auth
};

// Exportar constantes
export const constants = CONSTANTS;

// Exportar logger
export const logger = loggerConfig.logger;
export const systemLogger = loggerConfig.systemLogger;
export const authLogger = loggerConfig.authLogger;
export const businessLogger = loggerConfig.businessLogger;

// Exportar middleware de logging
export const requestLogger = loggerConfig.requestLogger;
export const errorLogger = loggerConfig.errorLogger;

// Función principal para inicializar toda la configuración
export const initializeApp = async () => {
  try {
    console.log('🚀 Inicializando MiSitioFácil...\n');
    
    // Mostrar resumen de configuración
    showConfigSummary();
    
    // Verificar si está listo para producción (solo en producción)
    if (config.app.env === 'production') {
      const prodCheck = checkProductionReadiness();
      if (!prodCheck.ready) {
        console.warn('\n⚠️  Advertencias de producción:', prodCheck.issues);
      }
    }
    
    // Conectar bases de datos
    console.log('\n🔗 Conectando bases de datos...');
    const dbStatus = await connectDatabases();
    
    // Log de inicio exitoso
    systemLogger.startup(config.app.port);
    
    return {
      success: true,
      config,
      databases: dbStatus,
      message: 'Aplicación inicializada correctamente'
    };
    
  } catch (error) {
    logger.error('Error durante la inicialización', { error: error.message });
    return {
      success: false,
      error: error.message,
      message: 'Error en la inicialización'
    };
  }
};

// Función para cerrar la aplicación de forma elegante
export const shutdownApp = async (signal = 'SIGTERM') => {
  try {
    console.log(`\n⚠️  Cerrando aplicación (señal: ${signal})...`);
    
    // Cerrar conexiones de base de datos
    await closeDatabases();
    
    // Log de cierre
    systemLogger.shutdown(signal);
    
    console.log('✅ Aplicación cerrada correctamente');
    return true;
    
  } catch (error) {
    logger.error('Error durante el cierre', { error: error.message });
    console.error('❌ Error durante el cierre:', error.message);
    return false;
  }
};

// Función para health check completo
export const healthCheck = async () => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.app.env,
      version: config.app.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      databases: await checkDatabaseHealth(),
      storage: {
        type: config.storage.type,
        available: true // Simplificado por ahora
      }
    };
    
    // Verificar si alguna base de datos está caída
    const dbDown = !health.databases.mongodb || 
                   (config.database.postgresql.host && !health.databases.postgresql);
    
    if (dbDown) {
      health.status = 'degraded';
    }
    
    return health;
    
  } catch (error) {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
};

// Configuración rápida para diferentes tipos de aplicación
export const quickConfig = {
  // Para desarrollo rápido
  development: () => ({
    middleware: [
      security.cors.withLogging,
      security.helmet.api,
      security.rateLimit.generalRateLimit,
      requestLogger
    ]
  }),
  
  // Para APIs de producción
  production: () => ({
    middleware: [
      security.applySecurity('api'),
      requestLogger,
      errorLogger
    ]
  }),
  
  // Para rutas públicas (sitios web de negocios)
  public: () => ({
    middleware: security.middleware.public
  }),
  
  // Para rutas administrativas
  admin: () => ({
    middleware: security.middleware.admin
  })
};

// Función utilitaria para obtener configuración específica
export const getConfigFor = (component) => {
  switch (component) {
    case 'database':
      return config.database;
    case 'auth':
      return config.auth;
    case 'storage':
      return config.storage;
    case 'security':
      return config.security;
    case 'email':
      return config.email;
    case 'logging':
      return config.logging;
    default:
      return config;
  }
};

// Exportar todo como default para fácil acceso
export default {
  config,
  constants,
  database,
  storage,
  security,
  //logger,
  //systemLogger,
  //authLogger,
  //businessLogger,
  //requestLogger,
  //errorLogger,
  initializeApp,
  shutdownApp,
  healthCheck,
  quickConfig,
  getConfigFor
};