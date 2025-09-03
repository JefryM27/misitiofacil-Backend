// src/config/logger.js
import fs from 'fs/promises';
import path from 'path';

/* ────────────────────────────────────────────────────────────
   Detección de entorno
──────────────────────────────────────────────────────────── */
const IS_VERCEL = process.env.VERCEL === '1';
const IS_PROD = process.env.NODE_ENV === 'production';

/* ────────────────────────────────────────────────────────────
   Niveles de log
──────────────────────────────────────────────────────────── */
export const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const levelFromEnv =
  (process.env.LOG_LEVEL || 'info').toUpperCase();
const CURRENT_LEVEL =
  LOG_LEVELS[levelFromEnv] ?? LOG_LEVELS.INFO;

/* ────────────────────────────────────────────────────────────
   Colores para consola (solo si hay TTY y no NO_COLOR)
──────────────────────────────────────────────────────────── */
const USE_COLORS =
  process.stdout?.isTTY && process.env.NO_COLOR !== '1';

const COLORS = {
  ERROR: '\x1b[31m',   // Rojo
  WARN: '\x1b[33m',    // Amarillo
  INFO: '\x1b[36m',    // Cian
  DEBUG: '\x1b[35m',   // Magenta
  SUCCESS: '\x1b[32m', // Verde
  RESET: '\x1b[0m'     // Reset
};

const colorize = (level, text) =>
  USE_COLORS && COLORS[level] ? `${COLORS[level]}${text}${COLORS.RESET}` : text;

/* ────────────────────────────────────────────────────────────
   Configuración de destino de logs
   - En Vercel: solo consola (filesystem efímero/readonly)
   - Local/Servidor propio: consola + archivo (opcional)
──────────────────────────────────────────────────────────── */
const ENABLE_CONSOLE =
  process.env.LOG_TO_CONSOLE === 'true'
  || (!IS_PROD)                       // por defecto en dev
  || IS_VERCEL;                       // siempre en Vercel

const ENABLE_FILE =
  !IS_VERCEL &&                       // nunca en Vercel
  process.env.ENABLE_FILE_LOGS !== 'false';

const LOG_FILE =
  process.env.LOG_FILE || 'logs/app.log';

const MAX_FILE_SIZE = Number(process.env.LOG_MAX_SIZE || 10 * 1024 * 1024); // 10MB
const MAX_FILES = Number(process.env.LOG_MAX_FILES || 5);

/* ────────────────────────────────────────────────────────────
   Utilidades
──────────────────────────────────────────────────────────── */
const formatDate = (date = new Date()) =>
  date.toISOString().replace('T', ' ').substring(0, 19);

const safeStringify = (obj) => {
  try {
    return JSON.stringify(obj);
  } catch {
    // Evita errores por referencias circulares
    const cache = new Set();
    const out = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) return '[Circular]';
        cache.add(value);
      }
      return value;
    });
    cache.clear();
    return out;
  }
};

const formatLogMessage = (level, message, meta = {}) => {
  const timestamp = formatDate();
  const hasMeta = meta && Object.keys(meta).length > 0;
  const metaString = hasMeta ? ` | ${safeStringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}`;
};

const ensureLogDirectory = async () => {
  try {
    const dir = path.dirname(LOG_FILE);
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
};

const rotateLogFile = async () => {
  try {
    const stats = await fs.stat(LOG_FILE);
    if (stats.size <= MAX_FILE_SIZE) return;

    const date = new Date().toISOString().slice(0, 10);
    const rotated = LOG_FILE.replace(/\.log$/i, `-${date}.log`);
    await fs.rename(LOG_FILE, rotated);

    // limpiar antiguos
    const dir = path.dirname(LOG_FILE);
    const files = await fs.readdir(dir);
    const logFiles = files
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse();

    if (logFiles.length > MAX_FILES) {
      const toDelete = logFiles.slice(MAX_FILES);
      await Promise.allSettled(
        toDelete.map((f) => fs.unlink(path.join(dir, f)))
      );
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      // No spamear si no existe aún
      console.error('Log rotation error:', err?.message || err);
    }
  }
};

const writeToFile = async (formatted) => {
  if (!ENABLE_FILE) return;
  try {
    await ensureLogDirectory();
    await fs.appendFile(LOG_FILE, `${formatted}\n`, 'utf8');
    await rotateLogFile();
  } catch (err) {
    // Evita romper ejecución por fallo de disco
    console.error('File log error:', err?.message || err);
  }
};

const writeToConsole = (level, message, meta = {}) => {
  if (!ENABLE_CONSOLE) return;
  const timestamp = formatDate();
  const hasMeta = meta && Object.keys(meta).length > 0;
  const metaPretty = hasMeta ? ` ${safeStringify(meta)}` : '';
  const head = colorize(level, `[${timestamp}] [${level}]`);
  // En serverless, console.* se captura por la plataforma
  // Elegimos método según severidad
  if (level === 'ERROR') {
    console.error(`${head} ${message}${metaPretty}`);
  } else if (level === 'WARN') {
    console.warn(`${head} ${message}${metaPretty}`);
  } else {
    console.log(`${head} ${message}${metaPretty}`);
  }
};

/* ────────────────────────────────────────────────────────────
   Núcleo de logger
──────────────────────────────────────────────────────────── */
const shouldLog = (level) =>
  LOG_LEVELS[level] <= CURRENT_LEVEL;

const logCore = async (level, message, meta = {}) => {
  if (!shouldLog(level)) return;
  const formatted = formatLogMessage(level, message, meta);
  writeToConsole(level, message, meta);
  await writeToFile(formatted);
};

/* ────────────────────────────────────────────────────────────
   API pública del logger
──────────────────────────────────────────────────────────── */
export const logger = {
  error: (message, meta = {}) => logCore('ERROR', message, meta),
  warn:  (message, meta = {}) => logCore('WARN',  message, meta),
  info:  (message, meta = {}) => logCore('INFO',  message, meta),
  debug: (message, meta = {}) => logCore('DEBUG', message, meta),

  // Alias conveniente para eventos exitosos (nivel INFO)
  success: (message, meta = {}) => {
    if (ENABLE_CONSOLE) {
      const head = colorize('SUCCESS', `[${formatDate()}] [SUCCESS]`);
      const metaPretty = meta && Object.keys(meta).length ? ` ${safeStringify(meta)}` : '';
      console.log(`${head} ${message}${metaPretty}`);
    }
    return logCore('INFO', `SUCCESS: ${message}`, meta);
  }
};

/* ────────────────────────────────────────────────────────────
   Middlewares de Express
──────────────────────────────────────────────────────────── */
const realIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim()
  || req.socket?.remoteAddress
  || req.ip;

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      ip: realIp(req),
      userAgent: req.get('user-agent'),
      statusCode: res.statusCode,
      durationMs,
      bytes: Number(res.getHeader('content-length')) || 0
    };

    if (res.statusCode >= 500) {
      logger.error('HTTP Request', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });
  next();
};

export const errorLogger = (err, req, _res, next) => {
  logger.error('Unhandled Error', {
    error: err?.message,
    stack: IS_PROD ? undefined : err?.stack,
    method: req?.method,
    url: req?.originalUrl,
    ip: realIp(req),
    userAgent: req?.get?.('user-agent')
  });
  next(err);
};

/* ────────────────────────────────────────────────────────────
   Loggers de dominio (opcional)
──────────────────────────────────────────────────────────── */
export const systemLogger = {
  startup: (port) => {
    logger.success(`Server started on port ${port}`, {
      environment: process.env.NODE_ENV,
      pid: process.pid,
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    });
  },
  shutdown: (signal) => {
    logger.info('Server shutting down', { signal });
  },
  dbConnect: (database) => {
    logger.success(`Database connected`, { database });
  },
  dbDisconnect: (database) => {
    logger.warn('Database disconnected', { database });
  },
  dbError: (database, error) => {
    logger.error('Database error', { database, error: error?.message });
  }
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

/* ────────────────────────────────────────────────────────────
   Métricas/estadísticas
──────────────────────────────────────────────────────────── */
export const getLogStats = async () => {
  if (!ENABLE_FILE) {
    return {
      fileLogging: false,
      message: IS_VERCEL
        ? 'File logging deshabilitado en Vercel (solo consola).'
        : 'File logging deshabilitado por configuración.',
      config: { ENABLE_CONSOLE, ENABLE_FILE, LOG_FILE, level: levelFromEnv }
    };
  }

  try {
    const stats = await fs.stat(LOG_FILE);
    const dir = path.dirname(LOG_FILE);
    const files = await fs.readdir(dir);
    const logFiles = files.filter((f) => f.endsWith('.log'));

    return {
      fileLogging: true,
      currentFile: LOG_FILE,
      currentFileSize: stats.size,
      totalFiles: logFiles.length,
      lastModified: stats.mtime,
      config: { ENABLE_CONSOLE, ENABLE_FILE, LOG_FILE, level: levelFromEnv }
    };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
};

/* ────────────────────────────────────────────────────────────
   Export default
──────────────────────────────────────────────────────────── */
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
