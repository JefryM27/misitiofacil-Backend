import fs from 'fs/promises';
import path from 'path';

// Niveles de log
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Colores para consola
const COLORS = {
  ERROR: '\x1b[31m',   // Rojo
  WARN: '\x1b[33m',    // Amarillo
  INFO: '\x1b[36m',    // Cian
  DEBUG: '\x1b[35m',   // Magenta
  SUCCESS: '\x1b[32m', // Verde
  RESET: '\x1b[0m'     // Reset
};

// Configuración del logger
const logConfig = {
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE || 'logs/app.log',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: true,
  dateFormat: 'YYYY-MM-DD HH:mm:ss'
};

// Función para asegurar que el directorio de logs existe
const ensureLogDirectory = async () => {
  try {
    const logDir = path.dirname(logConfig.file);
    await fs.access(logDir);
  } catch {
    await fs.mkdir(path.dirname(logConfig.file), { recursive: true });
  }
};

// Función para formatear fecha
const formatDate = (date = new Date()) => {
  return date.toISOString().replace('T', ' ').substring(0, 19);
};

// Función para formatear el mensaje de log
const formatLogMessage = (level, message, meta = {}) => {
  const timestamp = formatDate();
  const metaString = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
};

// Función para escribir en archivo
const writeToFile = async (formattedMessage) => {
  if (!logConfig.enableFile) return;
  
  try {
    await ensureLogDirectory();
    await fs.appendFile(logConfig.file, formattedMessage + '\n');
    
    // Verificar tamaño del archivo y rotar si es necesario
    await rotateLogFile();
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
};

// Función para rotar archivos de log
const rotateLogFile = async () => {
  try {
    const stats = await fs.stat(logConfig.file);
    
    if (stats.size > logConfig.maxFileSize) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const rotatedFile = logConfig.file.replace('.log', `-${timestamp}.log`);
      
      await fs.rename(logConfig.file, rotatedFile);
      
      // Limpiar archivos antiguos
      await cleanOldLogFiles();
    }
  } catch (error) {
    // Si el archivo no existe, no es un error
    if (error.code !== 'ENOENT') {
      console.error('Error rotating log file:', error);
    }
  }
};

// Función para limpiar archivos de log antiguos
const cleanOldLogFiles = async () => {
  try {
    const logDir = path.dirname(logConfig.file);
    const files = await fs.readdir(logDir);
    
    const logFiles = files
      .filter(file => file.endsWith('.log') && file !== path.basename(logConfig.file))
      .sort()
      .reverse();
    
    // Mantener solo los últimos N archivos
    if (logFiles.length > logConfig.maxFiles) {
      const filesToDelete = logFiles.slice(logConfig.maxFiles);
      
      for (const file of filesToDelete) {
        await fs.unlink(path.join(logDir, file));
      }
    }
  } catch (error) {
    console.error('Error cleaning old log files:', error);
  }
};

// Función para escribir en consola con colores
const writeToConsole = (level, message, meta = {}) => {
  if (!logConfig.enableConsole) return;
  
  const color = COLORS[level.toUpperCase()] || COLORS.RESET;
  const timestamp = formatDate();
  const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : '';
  
  console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${COLORS.RESET} ${message}${metaString}`);
};

// Función principal de logging
const log = async (level, message, meta = {}) => {
  const levelValue = LOG_LEVELS[level.toUpperCase()];
  const configLevelValue = LOG_LEVELS[logConfig.level.toUpperCase()];
  
  // Solo loggear si el nivel es suficiente
  if (levelValue > configLevelValue) return;
  
  const formattedMessage = formatLogMessage(level, message, meta);
  
  // Escribir en consola
  writeToConsole(level, message, meta);
  
  // Escribir en archivo
  await writeToFile(formattedMessage);
};

// Funciones específicas para cada nivel
export const logger = {
  error: (message, meta = {}) => log('error', message, meta),
  warn: (message, meta = {}) => log('warn', message, meta),
  info: (message, meta = {}) => log('info', message, meta),
  debug: (message, meta = {}) => log('debug', message, meta),
  
  // Función especial para éxito
  success: (message, meta = {}) => {
    if (logConfig.enableConsole) {
      const timestamp = formatDate();
      const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : '';
      console.log(`${COLORS.SUCCESS}[${timestamp}] [SUCCESS]${COLORS.RESET} ${message}${metaString}`);
    }
    log('info', `SUCCESS: ${message}`, meta);
  }
};

// Middleware de logging para Express
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  // Interceptar response para loggear
  res.send = function(data) {
    const duration = Date.now() - start;
    const size = Buffer.byteLength(data, 'utf8');
    
    const logData = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      size: `${size} bytes`
    };
    
    // Loggear según el status code
    if (res.statusCode >= 500) {
      logger.error('HTTP Request', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Middleware para loggear errores no capturados
export const errorLogger = (err, req, res, next) => {
  logger.error('Unhandled Error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  next(err);
};

// Función para loggear eventos del sistema
export const systemLogger = {
  startup: (port) => {
    logger.success(`Server started on port ${port}`, {
      environment: process.env.NODE_ENV,
      pid: process.pid,
      memory: process.memoryUsage()
    });
  },
  
  shutdown: (signal) => {
    logger.info(`Server shutting down`, { signal });
  },
  
  dbConnect: (database) => {
    logger.success(`Database connected: ${database}`);
  },
  
  dbDisconnect: (database) => {
    logger.warn(`Database disconnected: ${database}`);
  },
  
  dbError: (database, error) => {
    logger.error(`Database error: ${database}`, { error: error.message });
  }
};

// Función para loggear eventos de autenticación
export const authLogger = {
  login: (userId, ip) => {
    logger.info('User login', { userId, ip });
  },
  
  loginFailed: (email, ip, reason) => {
    logger.warn('Login failed', { email, ip, reason });
  },
  
  logout: (userId, ip) => {
    logger.info('User logout', { userId, ip });
  },
  
  register: (userId, email, ip) => {
    logger.info('User registered', { userId, email, ip });
  },
  
  passwordReset: (email, ip) => {
    logger.info('Password reset requested', { email, ip });
  }
};

// Función para loggear eventos de negocio
export const businessLogger = {
  created: (businessId, ownerId) => {
    logger.info('Business created', { businessId, ownerId });
  },
  
  updated: (businessId, changes) => {
    logger.info('Business updated', { businessId, changes });
  },
  
  deleted: (businessId, ownerId) => {
    logger.warn('Business deleted', { businessId, ownerId });
  },
  
  reservationCreated: (reservationId, businessId, clientId) => {
    logger.info('Reservation created', { reservationId, businessId, clientId });
  },
  
  reservationCancelled: (reservationId, reason) => {
    logger.info('Reservation cancelled', { reservationId, reason });
  }
};

// Función para obtener estadísticas de logs
export const getLogStats = async () => {
  try {
    const stats = await fs.stat(logConfig.file);
    const logDir = path.dirname(logConfig.file);
    const files = await fs.readdir(logDir);
    const logFiles = files.filter(file => file.endsWith('.log'));
    
    return {
      currentFileSize: stats.size,
      totalFiles: logFiles.length,
      lastModified: stats.mtime,
      config: logConfig
    };
  } catch (error) {
    return { error: error.message };
  }
};

// Configuración inicial
await ensureLogDirectory();

export default {
  logger,
  requestLogger,
  errorLogger,
  systemLogger,
  authLogger,
  businessLogger,
  getLogStats,
  LOG_LEVELS
};