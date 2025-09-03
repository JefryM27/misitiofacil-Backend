// src/middleware/errorHandler.js
import { constants, logger } from '../config/index.js';

/* ────────────────────────────────────────────────────────────
   Mensajes por defecto (por si constants no está)
──────────────────────────────────────────────────────────── */
const DEFAULT_ERROR_MESSAGES = {
  INTERNAL_ERROR: 'Error interno del servidor',
  NOT_FOUND: 'Recurso no encontrado',
  ACCESS_DENIED: 'Acceso denegado',
  BAD_REQUEST: 'Solicitud inválida',
  RATE_LIMIT_EXCEEDED: 'Demasiadas solicitudes'
};

const ERROR_MESSAGES = {
  ...DEFAULT_ERROR_MESSAGES,
  ...(constants?.ERROR_MESSAGES || {})
};

/* ────────────────────────────────────────────────────────────
   Clases de error de dominio
──────────────────────────────────────────────────────────── */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = ERROR_MESSAGES.BAD_REQUEST, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}
export class AuthenticationError extends AppError {
  constructor(message = ERROR_MESSAGES.ACCESS_DENIED) {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}
export class AuthorizationError extends AppError {
  constructor(message = ERROR_MESSAGES.ACCESS_DENIED) {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}
export class NotFoundError extends AppError {
  constructor(message = ERROR_MESSAGES.NOT_FOUND) {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflicto con el estado actual del recurso') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}
export class RateLimitError extends AppError {
  constructor(message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED) {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

/* ────────────────────────────────────────────────────────────
   Normalizadores de errores de librerías
──────────────────────────────────────────────────────────── */
// Mongoose / MongoDB
const handleMongoError = (error) => {
  // Validaciones de Mongoose
  if (error?.name === 'ValidationError') {
    const details = Object.values(error.errors || {}).map((err) => ({
      field: err?.path,
      message: err?.message,
      value: err?.value
    }));
    return new ValidationError('Datos de entrada inválidos', details);
  }

  // Cast de ObjectId inválido
  if (error?.name === 'CastError') {
    return new ValidationError(`ID inválido: ${error?.value}`);
  }

  // Unique index duplicado
  if (error?.code === 11000 || (error?.name === 'MongoServerError' && error?.code === 11000)) {
    const field = Object.keys(error?.keyPattern || {})[0] || 'campo';
    const value = error?.keyValue?.[field];
    return new ConflictError(`El ${field}${value ? ` '${value}'` : ''} ya existe`);
  }

  // Problemas de conexión/selección de servidor (típico en serverless frío)
  if (
    error?.name === 'MongoNetworkError' ||
    error?.name === 'MongoTimeoutError' ||
    error?.name === 'MongooseServerSelectionError'
  ) {
    return new AppError('Error de conexión a la base de datos', 503, 'DATABASE_ERROR');
  }

  return error;
};

// JWT
const handleJWTError = (error) => {
  if (error?.name === 'JsonWebTokenError') return new AuthenticationError('Token inválido');
  if (error?.name === 'TokenExpiredError') return new AuthenticationError('Token expirado');
  if (error?.name === 'NotBeforeError') return new AuthenticationError('Token no válido aún');
  return error;
};

// Multer (uploads)
const handleMulterError = (error) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('Archivo muy grande', { maxSize: error?.limit });
  }
  if (error?.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Demasiados archivos', { maxFiles: error?.limit });
  }
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ValidationError('Campo de archivo inesperado', { fieldName: error?.field });
  }
  return error;
};

/* ────────────────────────────────────────────────────────────
   Sanitización de respuesta (no exponer detalles en prod)
──────────────────────────────────────────────────────────── */
const sanitizeError = (error) => {
  const statusCode = error?.statusCode || 500;
  const status = error?.status || (String(statusCode).startsWith('4') ? 'fail' : 'error');

  // Si no es operacional y es prod, no exponemos detalles
  if (process.env.NODE_ENV === 'production' && !error?.isOperational) {
    return {
      message: ERROR_MESSAGES.INTERNAL_ERROR,
      statusCode: 500,
      status,
    };
  }

  return {
    message: error?.message || ERROR_MESSAGES.INTERNAL_ERROR,
    statusCode,
    status,
    ...(error?.code && { code: error.code }),
    ...(error?.details && { details: error.details })
  };
};

/* ────────────────────────────────────────────────────────────
   Middleware principal de errores
──────────────────────────────────────────────────────────── */
export const errorHandler = (error, req, res, next) => {
  // Usa SIEMPRE el error original (no clonar con spread)
  let err = error;

  // Logging (antes de transformar) — evita filtrar secretos
  const logMeta = {
    message: err?.message,
    // En prod no enviamos stack completo
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString()
  };

  const statusForLog = err?.statusCode || 500;
  if (statusForLog >= 500) logger.error('Server Error', logMeta);
  else if (statusForLog >= 400) logger.warn('Client Error', logMeta);
  else logger.info('Error Handled', logMeta);

  // Normalización por tipo de error externo
  if (err?.name === 'ValidationError' || err?.name === 'CastError' || err?.code === 11000 || err?.name === 'MongoServerError') {
    err = handleMongoError(err);
  } else if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError' || err?.name === 'NotBeforeError') {
    err = handleJWTError(err);
  } else if (typeof err?.code === 'string' && err.code.startsWith('LIMIT_')) {
    err = handleMulterError(err);
  }

  // Si ya se enviaron cabeceras, delegar
  if (res.headersSent) return next(err);

  // Sanitiza respuesta
  const sanitized = sanitizeError(err);

  // Info extra en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    sanitized.stack = err?.stack;
    sanitized.requestInfo = {
      url: req.originalUrl,
      method: req.method,
      params: req.params,
      query: req.query,
      body: req.body
    };
  }

  res.status(sanitized.statusCode).json({
    success: false,
    error: sanitized.message,
    ...(sanitized.code && { code: sanitized.code }),
    ...(sanitized.details && { details: sanitized.details }),
    ...(sanitized.stack && { stack: sanitized.stack }),
    ...(sanitized.requestInfo && { requestInfo: sanitized.requestInfo }),
    timestamp: new Date().toISOString()
  });
};

/* ────────────────────────────────────────────────────────────
   404 handler
──────────────────────────────────────────────────────────── */
export const notFoundHandler = (req, _res, next) => {
  next(new NotFoundError(`Ruta ${req.originalUrl} no encontrada`));
};

/* ────────────────────────────────────────────────────────────
   Helpers útiles
──────────────────────────────────────────────────────────── */
export const createError = (message, statusCode = 500, code = null, details = null) =>
  new AppError(message, statusCode, code, details);

export const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const throwIf = (condition, message, statusCode = 400, code = null) => {
  if (condition) throw new AppError(message, statusCode, code);
};

export const throwIfNotFound = (resource, message = ERROR_MESSAGES.NOT_FOUND) => {
  if (!resource) throw new NotFoundError(message);
  return resource;
};

export const throwIfForbidden = (condition, message = ERROR_MESSAGES.ACCESS_DENIED) => {
  if (condition) throw new AuthorizationError(message);
};

// Respuesta de éxito consistente (útil en controladores)
export const successHandler = (data, message = 'Operación exitosa', statusCode = 200) => {
  return (_req, res) => {
    res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };
};

/* ────────────────────────────────────────────────────────────
   Manejo global (no matar proceso en Vercel)
──────────────────────────────────────────────────────────── */
const IS_VERCEL = process.env.VERCEL === '1';

export const handlePromiseRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || String(reason),
      stack: process.env.NODE_ENV === 'production' ? undefined : reason?.stack,
      promise: String(promise)
    });
    if (!IS_VERCEL) {
      console.log('💥 Unhandled Rejection.');
      // En servidores propios podrías terminar el proceso:
      // process.exit(1);
    }
  });
};

export const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', {
      error: err?.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack
    });
    if (!IS_VERCEL) {
      console.log('💥 Uncaught Exception.');
      // En servidores propios podrías terminar el proceso:
      // process.exit(1);
    }
  });
};

export const setupGlobalErrorHandling = () => {
  handleUncaughtException();
  handlePromiseRejection();
};

/* ────────────────────────────────────────────────────────────
   Middleware de log de errores (opcional si ya logueas en errorHandler)
──────────────────────────────────────────────────────────── */
export const errorLogger = (error, req, _res, next) => {
  const meta = {
    message: error?.message,
    statusCode: error?.statusCode || 500,
    stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    timestamp: new Date().toISOString()
  };

  if ((error?.statusCode || 500) >= 500) logger.error('Application Error', meta);
  else if ((error?.statusCode || 500) >= 400) logger.warn('Client Error', meta);
  else logger.info('Handled Error', meta);

  next(error);
};

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  notFoundHandler,
  errorLogger,
  createError,
  catchAsync,
  throwIf,
  throwIfNotFound,
  throwIfForbidden,
  successHandler,
  setupGlobalErrorHandling
};
