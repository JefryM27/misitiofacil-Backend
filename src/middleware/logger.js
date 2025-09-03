// src/middleware/logger.js
import fs from 'fs/promises';
import path from 'path';

// ─────────────────────────────────────────────
// Detección de entorno (Vercel usa FS efímero)
// ─────────────────────────────────────────────
const isVercel = process.env.VERCEL === '1';
const isProd = process.env.NODE_ENV === 'production';

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
  WARN:  '\x1b[33m',    // Amarillo
  INFO:  '\x1b[36m',    // Cian
  DEBUG: '\x1b[35m',    // Magenta
  SUCCESS: '\x1b[32m',  // Verde
  RESET: '\x1b[0m'      // Reset
};

// Configuración del logger
const logConfig = {
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  // En Vercel no escribimos a disco, pero si alguien fuerza, que sea /tmp/app.log
  file: isVercel ? (process.env.LOG_FILE || '/tmp/app.log') : (process.env.LOG_FILE || 'logs/app.log'),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  // En serverless conviene dejar consola habilitada siempre
  enableConsole: true,
  // 🔴 Nunca escribir fichero en Vercel (FS efímero)
  enableFile: !isVercel,
  dateFormat: 'YYYY-MM-DD HH:mm:ss'
};

// Asegurar directorio de logs (solo cuando enableFile=true)
const ensureLogDirectory = async () => {
  if (!logConfig.enableFile) return; // No crear directorios en Vercel
  try {
    const logDir = path.dirname(logConfig.file);
    await fs.access(logDir);
  } catch {
    await fs.mkdir(path.dirname(logConfig.file), { recursive: true });
  }
};

// Fecha legible
const formatDate = (date = new Date()) =>
  date.toISOString().replace('T', ' ').substring(0, 19);

// JSON.stringify seguro (evita ciclos o errores)
const safeStringify = (obj) => {
  try {
    return JSON.stringify(obj);
  } catch {
    try {
      return JSON.stringify(obj, Object.getOwnPropertyNames(obj));
    } catch {
      return '"[unserializable]"';
    }
  }
};

// Mensaje formateado
const formatLogMessage = (level, message, meta = {}) => {
  const timestamp = formatDate();
  const hasMeta = meta && Object.keys(meta).length > 0;
  const metaString = hasMeta ? ` | ${safeStringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
};

// Escritura a archivo (cuando está habilitado)
const writeToFile = async (formattedMessage) => {
  if (!logConfig.enableFile) return;
  try {
    await ensureLogDirectory();
    await fs.appendFile(logConfig.file, formattedMessage + '\n');
    await rotateLogFile();
  } catch (error) {
    // No rompas la app si falla el disco
    console.error('Error writing to log file:', error?.message || error);
  }
};

// Rotación de archivo
const rotateLogFile = async () => {
  if (!logConfig.enableFile) return;
  try {
    const stats = await fs.stat(logConfig.file);
    if (stats.size > logConfig.maxFileSize) {
      const timestamp = new Date().toISOString().slice(0, 10);
      const rotatedFile = logConfig.file.replace('.log', `-${timestamp}.log`);
      await fs.rename(logConfig.file, rotatedFile);
      await cleanOldLogFiles();
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('Error rotating log file:', error?.message || error);
    }
  }
};

// Limpiar logs antiguos
const cleanOldLogFiles = async () => {
  if (!logConfig.enableFile) return;
  try {
    const logDir = path.dirname(logConfig.file);
    const files = await fs.readdir(logDir);
    const logFiles = files
      .filter((file) => file.endsWith('.log') && file !== path.basename(logConfig.file))
      .sort()
      .reverse();

    if (logFiles.length > logConfig.maxFiles) {
      const filesToDelete = logFiles.slice(logConfig.maxFiles);
      for (const file of filesToDelete) {
        await fs.unlink(path.join(logDir, file));
      }
    }
  } catch (error) {
    // No bloquear por limpieza
  }
};

// Consola con colores
const writeToConsole = (level, message, meta = {}) => {
  if (!logConfig.enableConsole) return;
  const color = COLORS[level.toUpperCase()] || COLORS.RESET;
  const timestamp = formatDate();
  const hasMeta = meta && Object.keys(meta).length > 0;
  const metaString = hasMeta ? ` ${safeStringify(meta)}` : '';
  // eslint-disable-next-line no-console
  console.log(`${color}[${timestamp}] [${level.toUpperCase()}]${COLORS.RESET} ${message}${metaString}`);
};

// Core
const log = async (level, message, meta = {}) => {
  const lvl = level?.toUpperCase?.() || 'INFO';
  const levelValue = LOG_LEVELS[lvl] ?? LOG_LEVELS.INFO;
  const configLevelValue = LOG_LEVELS[logConfig.level.toUpperCase()] ?? LOG_LEVELS.INFO;

  if (levelValue > configLevelValue) return;

  const formattedMessage = formatLogMessage(lvl, message, meta);
  writeToConsole(lvl, message, meta);
  await writeToFile(formattedMessage);
};

// API pública
export const logger = {
  error: (message, meta = {}) => log('error', message, meta),
  warn:  (message, meta = {}) => log('warn',  message, meta),
  info:  (message, meta = {}) => log('info',  message, meta),
  debug: (message, meta = {}) => log('debug', message, meta),

  success: (message, meta = {}) => {
    if (logConfig.enableConsole) {
      const timestamp = formatDate();
      const hasMeta = meta && Object.keys(meta).length > 0;
      const metaString = hasMeta ? ` ${safeStringify(meta)}` : '';
      // eslint-disable-next-line no-console
      console.log(`${COLORS.SUCCESS}[${timestamp}] [SUCCESS]${COLORS.RESET} ${message}${metaString}`);
    }
    log('info', `SUCCESS: ${message}`, meta);
  }
};

// Middleware de requests (event-based; no parchea res.send)
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.once('finish', () => {
    const duration = Date.now() - start;

    const logData = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      duration: `${duration}ms`
    };

    if (res.statusCode >= 500) {
      logger.error('HTTP Request', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else if (!isProd) {
      // En prod, baja el ruido: solo >=400
      logger.info('HTTP Request', logData);
    }
  });

  next();
};

// Middleware para errores no capturados
export const errorLogger = (err, req, _res, next) => {
  logger.error('Unhandled Error', {
    error: err?.message,
    stack: err?.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next(err);
};

// Loggers de sistema/negocio
export const systemLogger = {
  startup: (port) => {
    logger.success(`Server started on port ${port}`, {
      environment: process.env.NODE_ENV,
      pid: process.pid
    });
  },
  shutdown: (signal) => logger.info('Server shutting down', { signal }),
  dbConnect: (database) => logger.success(`Database connected: ${database}`),
  dbDisconnect: (database) => logger.warn(`Database disconnected: ${database}`),
  dbError: (database, error) => logger.error(`Database error: ${database}`, { error: error?.message })
};

export const authLogger = {
  login: (userId, ip) => logger.info('User login', { userId, ip }),
  loginFailed: (email, ip, reason) => logger.warn('Login failed', { email, ip, reason }),
  logout: (userId, ip) => logger.info('User logout', { userId, ip }),
  register: (userId, email, ip) => logger.info('User registered', { userId, email, ip }),
  passwordReset: (email, ip) => logger.info('Password reset requested', { email, ip })
};

export const businessLogger = {
  created: (businessId, ownerId) => logger.info('Business created', { businessId, ownerId }),
  updated: (businessId, changes) => logger.info('Business updated', { businessId, changes }),
  deleted: (businessId, ownerId) => logger.warn('Business deleted', { businessId, ownerId }),
  reservationCreated: (reservationId, businessId, clientId) =>
    logger.info('Reservation created', { reservationId, businessId, clientId }),
  reservationCancelled: (reservationId, reason) =>
    logger.info('Reservation cancelled', { reservationId, reason })
};

// Stats del archivo (si existe y si el file logging está habilitado)
export const getLogStats = async () => {
  if (!logConfig.enableFile) {
    return { error: 'File logging disabled in this environment', config: logConfig };
  }
  try {
    const stats = await fs.stat(logConfig.file);
    const logDir = path.dirname(logConfig.file);
    const files = await fs.readdir(logDir);
    const logFiles = files.filter((f) => f.endsWith('.log'));
    return {
      currentFileSize: stats.size,
      totalFiles: logFiles.length,
      lastModified: stats.mtime,
      config: logConfig
    };
  } catch (error) {
    return { error: error?.message || String(error), config: logConfig };
  }
};

// Configuración inicial: solo intenta crear carpeta si vamos a escribir fichero
if (logConfig.enableFile) {
  await ensureLogDirectory();
}

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
