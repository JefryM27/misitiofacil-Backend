// Wrapper para manejar errores async/await automáticamente
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    // Ejecutar la función y capturar cualquier error
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Versión con logging mejorado
export const asyncHandlerWithLogging = (fn, context = '') => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    Promise.resolve(fn(req, res, next))
      .then(() => {
        // Log exitoso solo en desarrollo
        if (process.env.NODE_ENV === 'development') {
          const duration = Date.now() - startTime;
          console.log(`✅ ${context || 'Handler'} completed in ${duration}ms`);
        }
      })
      .catch((error) => {
        // Agregar contexto al error
        if (context) {
          error.context = context;
        }
        
        // Agregar información de request al error
        error.requestInfo = {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?.id || null
        };
        
        // Log del error
        console.error(`❌ Error in ${context || 'handler'}:`, {
          error: error.message,
          stack: error.stack,
          requestInfo: error.requestInfo
        });
        
        next(error);
      });
  };
};

// Wrapper específico para controladores
export const controllerHandler = (controllerFn, controllerName = '') => {
  return asyncHandlerWithLogging(controllerFn, `Controller: ${controllerName}`);
};

// Wrapper para middleware
export const middlewareHandler = (middlewareFn, middlewareName = '') => {
  return asyncHandlerWithLogging(middlewareFn, `Middleware: ${middlewareName}`);
};

// Wrapper para servicios/utilidades
export const serviceHandler = (serviceFn, serviceName = '') => {
  return async (...args) => {
    try {
      return await serviceFn(...args);
    } catch (error) {
      // Agregar contexto al error
      error.context = `Service: ${serviceName}`;
      throw error;
    }
  };
};

// Función para crear handlers con retry automático
export const retryHandler = (fn, maxRetries = 3, delay = 1000) => {
  return asyncHandler(async (req, res, next) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(req, res, next);
      } catch (error) {
        lastError = error;
        
        // No reintentar en errores del cliente (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // Si es el último intento, lanzar el error
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Esperar antes del siguiente intento
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
        
        console.warn(`⚠️ Reintento ${attempt}/${maxRetries} para ${req.method} ${req.path}`);
      }
    }
    
    throw lastError;
  });
};

// Handler para operaciones de base de datos
export const dbHandler = (dbOperation, operationName = '') => {
  return asyncHandler(async (req, res, next) => {
    try {
      const result = await dbOperation(req, res, next);
      return result;
    } catch (error) {
      // Transformar errores específicos de MongoDB
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }));
        
        const customError = new Error('Datos de entrada inválidos');
        customError.status = 400;
        customError.validationErrors = validationErrors;
        customError.context = `DB Operation: ${operationName}`;
        throw customError;
      }
      
      if (error.name === 'CastError') {
        const customError = new Error('ID inválido');
        customError.status = 400;
        customError.context = `DB Operation: ${operationName}`;
        throw customError;
      }
      
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        const customError = new Error(`El ${field} ya existe`);
        customError.status = 409;
        customError.context = `DB Operation: ${operationName}`;
        throw customError;
      }
      
      // Agregar contexto y relanzar
      error.context = `DB Operation: ${operationName}`;
      throw error;
    }
  });
};

// Handler con timeout
export const timeoutHandler = (fn, timeoutMs = 30000) => {
  return asyncHandler(async (req, res, next) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    try {
      return await Promise.race([
        fn(req, res, next),
        timeoutPromise
      ]);
    } catch (error) {
      if (error.message.includes('timed out')) {
        error.status = 408; // Request Timeout
      }
      throw error;
    }
  });
};

// Handler para validar y transformar datos
export const validationHandler = (validationFn, transformFn = null) => {
  return asyncHandler(async (req, res, next) => {
    try {
      // Validar datos
      const validatedData = await validationFn(req.body, req);
      
      // Transformar datos si se proporciona función
      req.validatedData = transformFn ? transformFn(validatedData) : validatedData;
      
      next();
    } catch (error) {
      // Manejar errores de validación
      if (error.isJoi || error.name === 'ValidationError') {
        const customError = new Error('Datos de entrada inválidos');
        customError.status = 400;
        customError.validationErrors = error.details || error.errors;
        throw customError;
      }
      
      throw error;
    }
  });
};

// Función utilitaria para crear respuestas consistentes
export const responseHandler = (successMessage = 'Operación exitosa') => {
  return (data, statusCode = 200) => {
    return (req, res) => {
      res.status(statusCode).json({
        success: true,
        message: successMessage,
        data: data,
        timestamp: new Date().toISOString()
      });
    };
  };
};

// Handler para paginación automática
export const paginationHandler = (queryFn, defaultLimit = 20) => {
  return asyncHandler(async (req, res, next) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || defaultLimit;
    const skip = (page - 1) * limit;
    
    // Validar parámetros
    if (page < 1 || limit < 1 || limit > 100) {
      const error = new Error('Parámetros de paginación inválidos');
      error.status = 400;
      throw error;
    }
    
    try {
      const [data, total] = await Promise.all([
        queryFn({ ...req.query, skip, limit }),
        queryFn({ ...req.query, countOnly: true })
      ]);
      
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        success: true,
        data: data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      throw error;
    }
  });
};

export default {
  asyncHandler,
  asyncHandlerWithLogging,
  controllerHandler,
  middlewareHandler,
  serviceHandler,
  retryHandler,
  dbHandler,
  timeoutHandler,
  validationHandler,
  responseHandler,
  paginationHandler
};