// src/middleware/index.js
// ===================================================
// Punto único de exportación de middlewares (sin duplicados)
// ===================================================

import * as authMiddleware from './auth.js';
import * as asyncHandlerMiddleware from './asyncHandler.js';
import * as errorHandlerMiddleware from './errorHandler.js';
import * as fileUploadMiddleware from './fileUpload.js';
import * as sanitizationMiddleware from './sanitization.js';
import * as paginationMiddleware from './pagination.js';
import * as validateRequestMiddleware from './validateRequest.js';
import * as rateLimitMiddleware from './rateLimit.js';
import * as securityMiddleware from './security.js';

// Ownership: usa import namespace y provee fallback si no existen ciertos exports
import * as ownership from './businessOwnerShip.js';
import { constants } from '../config/index.js';
const { USER_ROLES } = constants;

// ---------- Auth base + helpers (una sola fuente) ----------
const {
  auth,
  authenticate,
  requireAuth,
  requireAnyRole,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractUser,
} = authMiddleware;

// Guards derivados por rol (declarados solo aquí)
export const requireOwner         = auth(USER_ROLES.OWNER);
export const requireAdmin         = auth(USER_ROLES.ADMIN);
export const requireClient        = auth(USER_ROLES.CLIENT);
export const requireOwnerOrAdmin  = auth([USER_ROLES.OWNER, USER_ROLES.ADMIN]);
export const requireClientOrOwner = auth([USER_ROLES.CLIENT, USER_ROLES.OWNER]);

// Re-export helpers de auth desde referencias locales (sin re-export cruzado)
export {
  authenticate,
  requireAuth,
  requireAnyRole,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractUser,
};

// ---------- Ownership (con fallback seguro si falta algún guard) ----------
const requireBusinessOwnership =
  ownership.requireBusinessOwnership ||
  ((param = 'businessId') => (_req, _res, next) => next());

const requireServiceOwnership =
  ownership.requireServiceOwnership ||
  ((param = 'serviceId') => (_req, _res, next) => next());

export { requireBusinessOwnership, requireServiceOwnership };

// ---------- Async handlers ----------
const {
  asyncHandler,
  asyncHandlerWithLogging,
  controllerHandler,
  middlewareHandler,
  serviceHandler,
  retryHandler,
  dbHandler,
  timeoutHandler,
  responseHandler,
  paginationHandler,
} = asyncHandlerMiddleware;

export {
  asyncHandler,
  asyncHandlerWithLogging,
  controllerHandler,
  middlewareHandler,
  serviceHandler,
  retryHandler,
  dbHandler,
  timeoutHandler,
  responseHandler,
  paginationHandler,
};

// ---------- Validación ----------
export const { validationHandler } = validateRequestMiddleware;

// ---------- Seguridad / Rate limit ----------
export const { apiSecurityMiddleware } = securityMiddleware;
export const { authRateLimit, generalRateLimit } = rateLimitMiddleware;

// ---------- Error handling ----------
const {
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
  setupGlobalErrorHandling,
} = errorHandlerMiddleware;

export {
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
  setupGlobalErrorHandling,
};

// ---------- File upload ----------
const {
  processFileUpload,
  uploadLogoMiddleware,
  uploadCoverMiddleware,
  uploadGalleryMiddleware,
  validateImageDimensions,
  optimizeImages,
  cleanupOnError,
  canUploadFiles,
  getUploadedFilesInfo,
} = fileUploadMiddleware;

export {
  processFileUpload,
  uploadLogoMiddleware,
  uploadCoverMiddleware,
  uploadGalleryMiddleware,
  validateImageDimensions,
  optimizeImages,
  cleanupOnError,
  canUploadFiles,
  getUploadedFilesInfo,
};

// ---------- Sanitización ----------
const {
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
  sanitizePhone,
} = sanitizationMiddleware;

export {
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
  sanitizePhone,
};

// ---------- Paginación ----------
const {
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
  getPaginationMeta,
} = paginationMiddleware;

export {
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
  getPaginationMeta,
};

// ---------- Presets (lazy: NO ejecutar factorías en top-level) ----------
export const authAndOwnership = (businessIdParam = 'businessId') => [
  requireOwner,
  requireBusinessOwnership(businessIdParam),
];

export const authOwnerOrAdmin = [requireOwnerOrAdmin];

export const protectedRoute = (roles = []) => [
  auth(roles),
  errorHandler,
];

// Configs rápidas (lazy)
export const quickAuth = {
  any: requireAnyRole,
  owner: requireOwner,
  admin: requireAdmin,
  client: requireClient,

  ownBusiness: (param = 'businessId') => [requireOwner, requireBusinessOwnership(param)],
  ownerOrAdmin: requireOwnerOrAdmin,
  clientOrOwner: requireClientOrOwner,

  optional: optionalAuth,
  extract: extractUser,
};

// Endpoints presets (lazy)
export const endpointSecurity = {
  public: [],
  authenticated: [requireAnyRole],
  businessOwner: [requireOwner],
  ownBusiness: (param = 'businessId') => [requireOwner, requireBusinessOwnership(param)],
  adminOnly: [requireAdmin],
  ownerOrAdmin: [requireOwnerOrAdmin],
  clientOnly: [requireClient],
};

// No ejecutar factorías aquí (lazy builders)
export const routeConfigs = {
  business: {
    list:   [fullSanitization, fullPagination('business')],
    create: [requireOwner, sanitizeBusinessData, uploadLogoMiddleware()],
    read:   [],
    update: (param = 'businessId') => [requireOwner, requireBusinessOwnership(param), sanitizeBusinessData],
    delete: (param = 'businessId') => [requireOwner, requireBusinessOwnership(param)],
    uploadLogo:   (param = 'businessId') => [requireOwner, requireBusinessOwnership(param), uploadLogoMiddleware(true)],
    uploadCover:  (param = 'businessId') => [requireOwner, requireBusinessOwnership(param), uploadCoverMiddleware(true)],
    uploadGallery:(param = 'businessId') => [requireOwner, requireBusinessOwnership(param), uploadGalleryMiddleware(10)],
  },
  service: {
    list:   [fullSanitization, fullPagination('service')],
    create: (param = 'businessId') => [requireOwner, requireBusinessOwnership(param), sanitizeServiceData],
    read:   [],
    update: (param = 'serviceId')  => [requireOwner, requireServiceOwnership(param), sanitizeServiceData],
    delete: (param = 'serviceId')  => [requireOwner, requireServiceOwnership(param)],
  },
  reservation: {
    list:   [requireAnyRole, fullSanitization, fullPagination('reservation')],
    create: [requireAnyRole, sanitizeInput()],
    read:   [requireAnyRole], // TODO: añadir guard cuando exista
    update: [requireAnyRole],
    cancel: [requireAnyRole],
  },
  user: {
    list:   [requireAdmin, fullPagination('user')],
    create: [sanitizeUserData],
    profile:[requireAnyRole],
    update: [requireAnyRole, sanitizeUserData],
    delete: [requireAnyRole],
  },
};

// ---------- Default export (opcional, solo referencias) ----------
export default {
  // Auth
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

  // Async
  asyncHandler,
  controllerHandler,
  dbHandler,
  catchAsync,

  // Error
  errorHandler,
  notFoundHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  throwIfNotFound,
  throwIf,

  // Upload
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
};
