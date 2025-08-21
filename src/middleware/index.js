// Importar todos los middleware
import authMiddleware from './auth.js';
import businessOwnershipMiddleware from './businessOwnership.js';
import asyncHandlerMiddleware from './asyncHandler.js';
import errorHandlerMiddleware from './errorHandler.js';
import fileUploadMiddleware from './fileUpload.js';
import sanitizationMiddleware from './sanitization.js';
import paginationMiddleware from './pagination.js';

// Re-exportar todos los middleware de autenticación
export const {
  auth,
  requireOwner,
  requireAdmin,
  requireClient,
  requireOwnerOrAdmin,
  requireClientOrOwner,
  requireAnyRole,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractUser
} = authMiddleware;

// Re-exportar middleware de ownership
export const {
  requireBusinessOwnership,
  requireServiceOwnership,
  requireReservationAccess,
  requireResourceOwnership
} = businessOwnershipMiddleware;

// Re-exportar async handlers
export const {
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
} = asyncHandlerMiddleware;

// Re-exportar error handlers
export const {
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
} = errorHandlerMiddleware;

// Re-exportar middleware de file upload
export const {
  processFileUpload,
  uploadLogoMiddleware,
  uploadCoverMiddleware,
  uploadGalleryMiddleware,
  validateImageDimensions,
  optimizeImages,
  cleanupOnError,
  canUploadFiles,
  getUploadedFilesInfo
} = fileUploadMiddleware;

// Re-exportar middleware de sanitización
export const {
  sanitizeInput,
  sanitizeBusinessData,
  sanitizeServiceData,
  sanitizeUserData,
  preventNoSQLInjection,
  trimWhitespace,
  normalizeData,
  fullSanitization,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone
} = sanitizationMiddleware;

// Re-exportar middleware de paginación
export const {
  paginate,
  paginateBusinesses,
  paginateServices,
  paginateReservations,
  paginateUsers,
  addFilters,
  addBusinessFilters,
  addServiceFilters,
  addReservationFilters,
  addUserFilters,
  addRelevanceSort,
  validateDateFilters,
  fullPagination,
  createPaginatedResponse,
  getPaginationMeta
} = paginationMiddleware;

// Middleware combinados para casos comunes
export const authAndOwnership = (businessIdParam = 'businessId') => [
  requireOwner,
  requireBusinessOwnership(businessIdParam)
];

export const authOwnerOrAdmin = [
  requireOwnerOrAdmin
];

export const protectedRoute = (roles = []) => [
  auth(roles),
  errorHandler
];

// Configuraciones rápidas para rutas comunes
export const quickAuth = {
  // Solo autenticación
  any: requireAnyRole,
  owner: requireOwner,
  admin: requireAdmin,
  client: requireClient,
  
  // Autenticación + ownership
  ownBusiness: (param = 'businessId') => [
    requireOwner,
    requireBusinessOwnership(param)
  ],
  
  // Autenticación + múltiples roles
  ownerOrAdmin: requireOwnerOrAdmin,
  clientOrOwner: requireClientOrOwner,
  
  // Opcional
  optional: optionalAuth,
  extract: extractUser
};

// Configuraciones para diferentes tipos de endpoints
export const endpointSecurity = {
  // Endpoints públicos (no requieren auth)
  public: [],
  
  // Endpoints que requieren cualquier usuario autenticado
  authenticated: [requireAnyRole],
  
  // Endpoints para owners de negocios
  businessOwner: [requireOwner],
  
  // Endpoints para owners + verificación de ownership
  ownBusiness: (param = 'businessId') => [
    requireOwner,
    requireBusinessOwnership(param)
  ],
  
  // Endpoints para admins
  adminOnly: [requireAdmin],
  
  // Endpoints para owners o admins
  ownerOrAdmin: [requireOwnerOrAdmin],
  
  // Endpoints para clientes
  clientOnly: [requireClient]
};

// Configuraciones completas para diferentes tipos de rutas
export const routeConfigs = {
  // Configuración para rutas de negocios
  business: {
    list: [fullSanitization, fullPagination('business')],
    create: [requireOwner, sanitizeBusinessData, uploadLogoMiddleware()],
    read: [],
    update: [requireOwner, requireBusinessOwnership(), sanitizeBusinessData],
    delete: [requireOwner, requireBusinessOwnership()],
    uploadLogo: [requireOwner, requireBusinessOwnership(), uploadLogoMiddleware(true)],
    uploadCover: [requireOwner, requireBusinessOwnership(), uploadCoverMiddleware(true)],
    uploadGallery: [requireOwner, requireBusinessOwnership(), uploadGalleryMiddleware(10)]
  },
  
  // Configuración para rutas de servicios
  service: {
    list: [fullSanitization, fullPagination('service')],
    create: [requireOwner, requireBusinessOwnership(), sanitizeServiceData],
    read: [],
    update: [requireOwner, requireServiceOwnership(), sanitizeServiceData],
    delete: [requireOwner, requireServiceOwnership()]
  },
  
  // Configuración para rutas de reservas
  reservation: {
    list: [requireAnyRole, fullSanitization, fullPagination('reservation')],
    create: [requireAnyRole, sanitizeInput()],
    read: [requireAnyRole, requireReservationAccess()],
    update: [requireAnyRole, requireReservationAccess()],
    cancel: [requireAnyRole, requireReservationAccess()]
  },
  
  // Configuración para rutas de usuarios
  user: {
    list: [requireAdmin, fullPagination('user')],
    create: [sanitizeUserData],
    profile: [requireAnyRole],
    update: [requireAnyRole, sanitizeUserData],
    delete: [requireAnyRole]
  }
};

// Función utilitaria para crear middleware personalizado
export const createMiddleware = (config) => {
  const middleware = [];
  
  // Agregar autenticación si se especifica
  if (config.auth) {
    if (Array.isArray(config.auth)) {
      middleware.push(auth(config.auth));
    } else if (typeof config.auth === 'string') {
      middleware.push(auth([config.auth]));
    } else if (config.auth === true) {
      middleware.push(requireAnyRole);
    }
  }
  
  // Agregar sanitización si se especifica
  if (config.sanitize) {
    if (config.sanitize === 'full') {
      middleware.push(...fullSanitization);
    } else if (config.sanitize === 'business') {
      middleware.push(sanitizeBusinessData);
    } else if (config.sanitize === 'service') {
      middleware.push(sanitizeServiceData);
    } else if (config.sanitize === 'user') {
      middleware.push(sanitizeUserData);
    } else if (config.sanitize === true) {
      middleware.push(sanitizeInput());
    }
  }
  
  // Agregar paginación si se especifica
  if (config.paginate) {
    if (typeof config.paginate === 'string') {
      middleware.push(...fullPagination(config.paginate));
    } else if (config.paginate === true) {
      middleware.push(paginate());
    }
  }
  
  // Agregar verificación de ownership si se especifica
  if (config.ownership) {
    if (config.ownership.business) {
      middleware.push(requireBusinessOwnership(config.ownership.business));
    }
    if (config.ownership.service) {
      middleware.push(requireServiceOwnership());
    }
    if (config.ownership.reservation) {
      middleware.push(requireReservationAccess());
    }
  }
  
  // Agregar upload si se especifica
  if (config.upload) {
    if (config.upload === 'logo') {
      middleware.push(uploadLogoMiddleware(config.required));
    } else if (config.upload === 'cover') {
      middleware.push(uploadCoverMiddleware(config.required));
    } else if (config.upload === 'gallery') {
      middleware.push(uploadGalleryMiddleware(config.maxFiles || 10, config.required));
    }
  }
  
  // Agregar validaciones personalizadas
  if (config.validation) {
    middleware.push(validationHandler(config.validation));
  }
  
  return middleware;
};

// Helpers para respuestas estándar
export const responses = {
  success: (data, message = 'Operación exitosa', statusCode = 200) => {
    return (req, res) => {
      res.status(statusCode).json({
        success: true,
        message,
        data,
        timestamp: new Date().toISOString()
      });
    };
  },
  
  created: (data, message = 'Recurso creado exitosamente') => {
    return responses.success(data, message, 201);
  },
  
  updated: (data, message = 'Recurso actualizado exitosamente') => {
    return responses.success(data, message, 200);
  },
  
  deleted: (message = 'Recurso eliminado exitosamente') => {
    return (req, res) => {
      res.status(200).json({
        success: true,
        message,
        timestamp: new Date().toISOString()
      });
    };
  },
  
  paginated: (data, total, req) => {
    return (req, res) => {
      const response = req.createPaginatedResponse(data, total);
      res.json(response);
    };
  },
  
  error: (message, statusCode = 500, code = null) => {
    return (req, res) => {
      res.status(statusCode).json({
        success: false,
        error: message,
        ...(code && { code }),
        timestamp: new Date().toISOString()
      });
    };
  }
};

// Función para aplicar middleware de forma condicional
export const conditionalMiddleware = (condition, middleware) => {
  return (req, res, next) => {
    if (condition(req)) {
      return middleware(req, res, next);
    }
    next();
  };
};

// Función para combinar múltiples middleware
export const combineMiddleware = (...middlewares) => {
  return (req, res, next) => {
    let index = 0;
    
    const runNext = (error) => {
      if (error) return next(error);
      
      if (index >= middlewares.length) return next();
      
      const middleware = middlewares[index++];
      
      if (Array.isArray(middleware)) {
        // Si es un array de middleware, ejecutarlos en secuencia
        return combineMiddleware(...middleware)(req, res, runNext);
      }
      
      middleware(req, res, runNext);
    };
    
    runNext();
  };
};

// Exportar configuración completa
export default {
  // Autenticación
  auth,
  requireOwner,
  requireAdmin,
  requireClient,
  requireOwnerOrAdmin,
  requireClientOrOwner,
  requireAnyRole,
  optionalAuth,
  extractUser,
  
  // Ownership
  requireBusinessOwnership,
  requireServiceOwnership,
  requireReservationAccess,
  
  // Async handling
  asyncHandler,
  controllerHandler,
  dbHandler,
  catchAsync,
  
  // Error handling
  errorHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  throwIfNotFound,
  throwIf,
  
  // File upload
  uploadLogoMiddleware,
  uploadCoverMiddleware,
  uploadGalleryMiddleware,
  canUploadFiles,
  getUploadedFilesInfo,
  
  // Sanitización
  sanitizeInput,
  sanitizeBusinessData,
  sanitizeServiceData,
  sanitizeUserData,
  fullSanitization,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  
  // Paginación
  paginate,
  paginateBusinesses,
  paginateServices,
  paginateReservations,
  fullPagination,
  createPaginatedResponse,
  
  // Utilidades
  generateToken,
  generateRefreshToken,
  quickAuth,
  endpointSecurity,
  routeConfigs,
  responses,
  createMiddleware,
  combineMiddleware
};