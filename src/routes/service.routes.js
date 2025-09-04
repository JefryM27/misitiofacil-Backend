// src/routes/service.routes.js
import express from 'express';
import serviceController from '../controllers/service.controller.js';
import {
  requireOwner,
  requireOwnerOrAdmin,
  requireBusinessOwnership,
  requireServiceOwnership,
  sanitizeServiceData,
  fullPagination,
  routeConfigs,
  asyncHandler, // ✅ usar asyncHandler como en otros routers
} from '../middleware/index.js';

// Seguridad (puedes importar estos también desde middleware/index si prefieres)
import {
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit,
} from '../middleware/security.js';

const rateLimitStrict = generalRateLimit;
const rateLimitAuth = authRateLimit;

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Services
 *     description: Operaciones relacionadas con servicios de negocios
 */

// Seguridad base para todas las rutas de este router
router.use(apiSecurityMiddleware);

/**
 * @swagger
 * /services/business/{businessId}:
 *   get:
 *     summary: Obtener servicios de un negocio
 *     tags: [Services]
 */
router.get(
  '/business/:businessId',
  rateLimitStrict,
  fullPagination('service'),
  serviceController.getServicesByBusiness ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services:
 *   post:
 *     summary: 
 *     tags: [Services]
 */
router.post(
  '/',
  rateLimitAuth,
  requireOwner,
  // Mapear business/body → params para reutilizar requireBusinessOwnership('businessId')
  (req, _res, next) => {
    const id = req.body?.business || req.body?.businessId;
    if (id) req.params.businessId = id;
    next();
  },
  requireBusinessOwnership('businessId'),
  sanitizeServiceData,
  (typeof serviceController.createService === 'function'
    ? asyncHandler(serviceController.createService.bind(serviceController))
    : (req, res) =>
        res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/business/{businessId}:
 *   post:
 *     summary: Crear servicio para un negocio
 *     tags: [Services]
 */
router.post(
  '/business/:businessId',
  rateLimitAuth,
  requireOwner,
  requireBusinessOwnership('businessId'),
  sanitizeServiceData,
  (typeof serviceController.createService === 'function'
    ? asyncHandler(serviceController.createService.bind(serviceController))
    : (req, res) =>
        res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/search:
 *   get:
 *     summary: Buscar servicios
 *     tags: [Services]
 */
router.get(
  '/search',
  rateLimitStrict,
  fullPagination('service'),
  serviceController.searchServices ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/popular:
 *   get:
 *     summary: Obtener servicios populares
 *     tags: [Services]
 */
router.get(
  '/popular',
  rateLimitStrict,
  serviceController.getPopularServices ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/categories:
 *   get:
 *     summary: Obtener categorías de servicios
 *     tags: [Services]
 */
router.get(
  '/categories',
  rateLimitStrict,
  serviceController.getServiceCategories ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/{serviceId}:
 *   get:
 *     summary: Obtener servicio por ID
 *     tags: [Services]
 */
router.get(
  '/:serviceId',
  rateLimitStrict,
  serviceController.getServiceById ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/{serviceId}:
 *   put:
 *     summary: Actualizar servicio
 *     tags: [Services]
 */
router.put(
  '/:serviceId',
  rateLimitAuth,
  ...routeConfigs.service.update('serviceId'),
  (typeof serviceController.updateService === 'function'
    ? asyncHandler(serviceController.updateService.bind(serviceController))
    : (req, res) =>
        res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/{serviceId}:
 *   delete:
 *     summary: Eliminar servicio
 *     tags: [Services]
 */
router.delete(
  '/:serviceId',
  rateLimitAuth,
  requireOwner,
  requireServiceOwnership('serviceId'),
  serviceController.deleteService ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/{serviceId}/toggle-status:
 *   put:
 *     summary: Activar/desactivar servicio
 *     tags: [Services]
 */
router.put(
  '/:serviceId/toggle-status',
  rateLimitAuth,
  requireOwner,
  requireServiceOwnership('serviceId'),
  serviceController.toggleServiceStatus ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/{serviceId}/duplicate:
 *   post:
 *     summary: Duplicar servicio
 *     tags: [Services]
 */
router.post(
  '/:serviceId/duplicate',
  rateLimitAuth,
  requireOwner,
  requireServiceOwnership('serviceId'),
  serviceController.duplicateService ||
    ((req, res) => res.status(501).json({ error: 'Método no implementado' }))
);

/**
 * @swagger
 * /services/{serviceId}/stats:
 *   get:
 *     summary: Estadísticas del servicio
 *     tags: [Services]
 */
router.get(
  '/:serviceId/stats',
  rateLimitStrict,
  requireOwner,
  requireServiceOwnership('serviceId'),
  serviceController.getServiceStats ||
    ((req, res) =>
      res.status(501).json({ error: 'Estadísticas no implementadas' }))
);

// ============== RUTAS ADMINISTRATIVAS ==============

/**
 * @swagger
 * /services/admin/analytics:
 *   get:
 *     summary: Análisis de servicios (admin)
 *     tags: [Services]
 */
router.get(
  '/admin/analytics',
  rateLimitStrict,
  requireOwnerOrAdmin,
  serviceController.getServicesAnalytics ||
    ((req, res) =>
      res.status(501).json({ error: 'Análisis administrativo no implementado' }))
);

export default router;
