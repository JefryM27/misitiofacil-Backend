import { constants, logger } from '../config/index.js';

const { ERROR_MESSAGES } = constants;

// Clase personalizada para errores de la aplicación
export class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Errores específicos para diferentes situaciones
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

// Función para manejar errores de MongoDB
const handleMongoError = (error) => {
  // Error de validación de Mongoose
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    
    return new ValidationError('Datos de entrada inválidos', errors);
  }

  // Error de cast (ID inválido)
  if (error.name === 'CastError') {
    return new ValidationError(`ID inválido: ${error.value}`);
  }

  // Error de duplicado (unique constraint)
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    const value = error.keyValue[field];
    return new ConflictError(`El ${field} '${value}' ya existe`);
  }

  // Error de conexión a MongoDB
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return new AppError('Error de conexión a la base de datos', 503, 'DATABASE_ERROR');
  }

  return error;
};

// Función para manejar errores de JWT
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Token inválido');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expirado');
  }
  
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token no válido aún');
  }
  
  return error;
};

// Función para manejar errores de Multer (uploads)
const handleMulterError = (error) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new ValidationError('Archivo muy grande', {
      maxSize: error.field ? `${error.field}: ${error.limit} bytes` : `${error.limit} bytes`
    });
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return new ValidationError('Demasiados archivos', {
      maxFiles: error.limit
    });
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new ValidationError('Campo de archivo inesperado', {
      fieldName: error.field
    });
  }
  
  return error;
};

// Función para sanitizar errores en producción
const sanitizeError = (error) => {
  // En producción, no exponer información sensible
  if (process.env.NODE_ENV === 'production' && !error.isOperational) {
    return {
      message: ERROR_MESSAGES.INTERNAL_ERROR,
      statusCode: 500,
      status: 'error'
    };
  }
  
  return {
    message: error.message,
    statusCode: error.statusCode || 500,
    status: error.status || 'error',
    ...(error.code && { code: error.code }),
    ...(error.details && { details: error.details })
  };
};

// Middleware principal de manejo de errores
export const errorHandler = (error, req, res, next) => {
  // Crear copia del error para evitar mutaciones
  let err = { ...error };
  err.message = error.message;

  // Log del error
  const errorInfo = {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString()
  };

  // Determinar nivel de log según el tipo de error
  if (err.statusCode >= 500) {
    logger.error('Server Error', errorInfo);
  } else if (err.statusCode >= 400) {
    logger.warn('Client Error', errorInfo);
  } else {
    logger.info('Error Handled', errorInfo);
  }

  // Transformar errores específicos
  if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000) {
    err = handleMongoError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    err = handleJWTError(err);
  } else if (err.code && typeof err.code === 'string' && err.code.startsWith('LIMIT_')) {
    err = handleMulterError(err);
  }

  // Sanitizar error para respuesta
  const sanitizedError = sanitizeError(err);

  // Agregar información adicional en desarrollo
  if (process.env.NODE_ENV === 'development') {
    sanitizedError.stack = err.stack;
    sanitizedError.context = err.context;
    sanitizedError.requestInfo = {
      url: req.originalUrl,
      method: req.method,
      params: req.params,
      query: req.query,
      body: req.body
    };
  }

  // Enviar respuesta de error
  res.status(sanitizedError.statusCode).json({
    success: false,
    error: sanitizedError.message,
    ...(sanitizedError.code && { code: sanitizedError.code }),
    ...(sanitizedError.details && { details: sanitizedError.details }),
    ...(process.env.NODE_ENV === 'development' && sanitizedError.stack && { stack: sanitizedError.stack }),
    ...(process.env.NODE_ENV === 'development' && sanitizedError.context && { context: sanitizedError.context }),
    ...(process.env.NODE_ENV === 'development' && sanitizedError.requestInfo && { requestInfo: sanitizedError.requestInfo }),
    timestamp: new Date().toISOString()
  });
};

// Middleware para capturar rutas no encontradas
export const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Ruta ${req.originalUrl} no encontrada`);
  next(error);
};

// Función helper para crear errores consistentes
export const createError = (message, statusCode = 500, code = null, details = null) => {
  return new AppError(message, statusCode, code, details);
};

// Wrapper para capturar errores async sin try/catch
export const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Función para validar y lanzar errores de negocio
export const throwIf = (condition, message, statusCode = 400, code = null) => {
  if (condition) {
    throw new AppError(message, statusCode, code);
  }
};

// Función para validar recursos existentes
export const throwIfNotFound = (resource, message = ERROR_MESSAGES.NOT_FOUND) => {
  if (!resource) {
    throw new NotFoundError(message);
  }
  return resource;
};

// Función para validar permisos
export const throwIfForbidden = (condition, message = ERROR_MESSAGES.ACCESS_DENIED) => {
  if (condition) {
    throw new AuthorizationError(message);
  }
};

// Middleware para transformar respuestas exitosas
export const successHandler = (data, message = 'Operación exitosa', statusCode = 200) => {
  return (req, res) => {
    res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };
};

// Función para manejar errores en promesas
export const handlePromiseRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString()
    });
    
    console.log('💥 Unhandled Promise Rejection. Shutting down...');
    process.exit(1);
  });
};

// Función para manejar excepciones no capturadas
export const handleUncaughtException = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    });
    
    console.log('💥 Uncaught Exception. Shutting down...');
    process.exit(1);
  });
};

// Función para configurar manejo global de errores
export const setupGlobalErrorHandling = () => {
  handleUncaughtException();
  handlePromiseRejection();
};

// Middleware para logging de errores específico
export const errorLogger = (error, req, res, next) => {
  const errorLog = {
    message: error.message,
    statusCode: error.statusCode || 500,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    timestamp: new Date().toISOString()
  };

  // Log según severidad
  if (error.statusCode >= 500) {
    logger.error('Application Error', errorLog);
  } else if (error.statusCode >= 400) {
    logger.warn('Client Error', errorLog);
  } else {
    logger.info('Handled Error', errorLog);
  }

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