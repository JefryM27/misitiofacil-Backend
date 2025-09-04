// routes/business.routes.js
import express from 'express';
import * as businessController from '../controllers/business.controller.js';
import { auth } from '../middleware/auth.js';
import { requireBusinessOwnership } from '../middleware/businessOwnerShip.js';
import { sanitizeBusinessData } from '../middleware/sanitization.js';
import { constants } from '../config/index.js';

import {
  apiSecurityMiddleware,
  // authRateLimit,
  // generalRateLimit,
} from '../middleware/security.js';

const { USER_ROLES } = constants;
const requireOwner        = auth(USER_ROLES.OWNER);
const requireAdmin        = auth(USER_ROLES.ADMIN);
const requireOwnerOrAdmin = auth([USER_ROLES.OWNER, USER_ROLES.ADMIN]);

const router = express.Router();

// Seguridad base
router.use(apiSecurityMiddleware);
// router.use(generalRateLimit);

const or501 = (fn, msg) => (req, res, next) =>
  (typeof fn === 'function'
    ? fn(req, res, next)
    : res.status(501).json({ success: false, error: msg || 'No implementado' })
  );

/**
 * @swagger
 * tags:
 *   - name: Business
 *     description: Operaciones relacionadas con negocios
 */

/**
 * @swagger
 * /api/business:
 *   get:
 *     summary: Listar negocios del usuario (owner) o todos (admin con ?all=1)
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: all
 *         schema: { type: string, enum: [0, 1] }
 *         description: Si es admin y all=1, lista todos los negocios
 *     responses:
 *       200:
 *         description: Lista de negocios
 */
router.get(
  '/',
  requireOwnerOrAdmin,
  // Preferimos la función que exista en el controller
  (req, res, next) => {
    const handler =
      businessController.listBusinesses ||
      businessController.listMyBusinesses ||
      businessController.listAllBusinesses;
    return or501(handler, 'listBusinesses no implementado')(req, res, next);
  }
);

/**
 * @swagger
 * /api/business:
 *   post:
 *     summary: Crear nuevo negocio
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBusinessRequest'
 *     responses:
 *       201: { description: Creado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.post('/', requireOwner, sanitizeBusinessData, or501(businessController.createBusiness, 'createBusiness no implementado'));

/**
 * @swagger
 * /api/business/my:
 *   get:
 *     summary: Obtener mis negocios (compatibilidad)
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get(
  '/my',
  requireOwner,
  (req, res, next) => {
    const handler =
      businessController.getMyBusiness ||
      businessController.getMyBusinesses ||
      businessController.listMyBusinesses;
    return or501(handler, 'getMyBusinesses no implementado')(req, res, next);
  }
);

/**
 * @swagger
 * /api/business/slug/{slug}:
 *   get:
 *     summary: Obtener negocio por slug (público/compatibilidad)
 *     tags: [Business]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get('/slug/:slug', or501(businessController.getBusinessBySlug, 'getBusinessBySlug no implementado'));

/**
 * @swagger
 * /api/business/{businessId}:
 *   get:
 *     summary: Obtener negocio por ID (compatibilidad)
 *     tags: [Business]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:businessId([0-9a-fA-F]{24})',
  requireOwnerOrAdmin,
  requireBusinessOwnership('businessId'),
  or501(businessController.getBusinessById, 'getBusinessById no implementado')
);

/**
 * @swagger
 * /api/business/{businessId}:
 *   put:
 *     summary: Actualizar negocio (owner o admin)
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateBusinessRequest'
 *     responses:
 *       200: { description: Actualizado }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.put(
  '/:businessId([0-9a-fA-F]{24})',
  requireOwnerOrAdmin,
  requireBusinessOwnership('businessId'),
  sanitizeBusinessData,
  or501(businessController.updateBusiness, 'updateBusiness no implementado')
);

/**
 * @swagger
 * /api/business/{businessId}:
 *   delete:
 *     summary: Eliminar negocio (owner o admin)
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Eliminado }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.delete(
  '/:businessId([0-9a-fA-F]{24})',
  requireOwnerOrAdmin,
  requireBusinessOwnership('businessId'),
  or501(businessController.deleteBusiness, 'deleteBusiness no implementado')
);

/**
 * @swagger
 * /api/business/{businessId}/status:
 *   patch:
 *     summary: Activar/Desactivar negocio (solo admin)
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled: { type: boolean }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.patch(
  '/:businessId([0-9a-fA-F]{24})/status',
  requireAdmin,
  or501(businessController.setBusinessStatus || businessController.changeBusinessStatus, 'setBusinessStatus no implementado')
);

/**
 * @swagger
 * /api/business/{businessId}/publish:
 *   put:
 *     summary: Publicar/despublicar negocio (compatibilidad)
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.put(
  '/:businessId([0-9a-fA-F]{24})/publish',
  requireOwner,
  requireBusinessOwnership('businessId'),
  // Compatibilidad: si no hay publishBusiness/changeBusinessStatus, usamos setBusinessStatus con body.enabled
  (req, res, next) => {
    const handler =
      businessController.publishBusiness ||
      businessController.changeBusinessStatus ||
      businessController.setBusinessStatus;
    return or501(handler, 'publishBusiness no implementado')(req, res, next);
  }
);

// ---- Uploads ----
const notImplemented = (what) => (_req, res) => {
  res.status(501).json({
    success: false,
    error: `${what} no implementado`,
    message: `Usa la ruta /api/upload/business/{businessId}/${what === 'Upload de logo' ? 'logo' : 'cover'}`
  });
};

/**
 * @swagger
 * /api/business/{businessId}/logo:
 *   post:
 *     summary: Subir logo del negocio
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/:businessId([0-9a-fA-F]{24})/logo',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (typeof businessController.uploadLogo === 'function'
    ? businessController.uploadLogo
    : notImplemented('Upload de logo'))
);

/**
 * @swagger
 * /api/business/{businessId}/cover:
 *   post:
 *     summary: Subir imagen de portada
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/:businessId([0-9a-fA-F]{24})/cover',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (typeof businessController.uploadCoverImage === 'function'
    ? businessController.uploadCoverImage
    : notImplemented('Upload de portada'))
);

/**
 * @swagger
 * /api/business/{businessId}/stats:
 *   get:
 *     summary: Obtener estadísticas del negocio
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       501: { description: No implementado }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.get(
  '/:businessId([0-9a-fA-F]{24})/stats',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (_req, res) => res.status(501).json({
    success: false,
    error: 'Estadísticas no implementadas aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
);

/**
 * @swagger
 * /api/business/{businessId}/duplicate:
 *   post:
 *     summary: Duplicar negocio
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: businessId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       501: { description: No implementado }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 *       403: { $ref: '#/components/responses/ForbiddenError' }
 *       404: { $ref: '#/components/responses/NotFoundError' }
 */
router.post(
  '/:businessId([0-9a-fA-F]{24})/duplicate',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (_req, res) => res.status(501).json({
    success: false,
    error: 'Duplicación no implementada aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
);

export default router;
