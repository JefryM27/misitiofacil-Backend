// routes/business.routes.js
import express from 'express'
import businessController from '../controllers/business.controller.js'

import { auth } from '../middleware/auth.js'
import { requireBusinessOwnership } from '../middleware/businessOwnerShip.js'
import { sanitizeBusinessData } from '../middleware/sanitization.js'
import { fullPagination } from '../middleware/pagination.js'
import { constants } from '../config/index.js'

const { USER_ROLES } = constants
const requireOwner = auth(USER_ROLES.OWNER)
// const requireOwnerOrAdmin = auth([USER_ROLES.OWNER, USER_ROLES.ADMIN])

import {
  apiSecurityMiddleware,
  // authRateLimit,
  // generalRateLimit,
} from '../middleware/security.js'

const router = express.Router()

// Seguridad base
router.use(apiSecurityMiddleware)
// router.use(generalRateLimit)

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
 *     summary: Lista todos los negocios (públicos)
 *     tags: [Business]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Elementos por página
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [barberia, salon_belleza, spa] }
 *         description: Filtrar por categoría
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: Filtrar por ciudad
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Buscar en nombre o descripción
 *     responses:
 *       200:
 *         description: Lista de negocios obtenida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BusinessList'
 */
router.get(
  '/',
  fullPagination('business'),
  (businessController.listPublicBusinesses || businessController.getAllBusinesses)
)

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
router.post('/', requireOwner, sanitizeBusinessData, businessController.createBusiness)

/**
 * @swagger
 * /api/business/my:
 *   get:
 *     summary: Obtener mi negocio
 *     tags: [Business]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200: { description: OK }
 *       401: { $ref: '#/components/responses/UnauthorizedError' }
 */
router.get('/my', requireOwner, (businessController.getMyBusiness || businessController.getMyBusinesses))

/**
 * @swagger
 * /api/business/slug/{slug}:
 *   get:
 *     summary: Obtener negocio por slug (URL amigable)
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
router.get('/slug/:slug', businessController.getBusinessBySlug)

/**
 * @swagger
 * /api/business/{businessId}:
 *   get:
 *     summary: Obtener negocio por ID
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
router.get('/:businessId', businessController.getBusinessById)

/**
 * @swagger
 * /api/business/{businessId}:
 *   put:
 *     summary: Actualizar negocio
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
  '/:businessId',
  requireOwner,
  requireBusinessOwnership('businessId'),
  sanitizeBusinessData,
  businessController.updateBusiness
)

/**
 * @swagger
 * /api/business/{businessId}:
 *   delete:
 *     summary: Eliminar negocio
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
  '/:businessId',
  requireOwner,
  requireBusinessOwnership('businessId'),
  businessController.deleteBusiness
)

/**
 * @swagger
 * /api/business/{businessId}/publish:
 *   put:
 *     summary: Publicar/despublicar negocio
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
  '/:businessId/publish',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (businessController.changeBusinessStatus || businessController.publishBusiness)
)

// ---- Uploads ----

const notImplemented = (what) => (req, res) => {
  res.status(501).json({
    success: false,
    error: `${what} no implementado`,
    message: `Usa la ruta /api/upload/business/{businessId}/${what === 'Upload de logo' ? 'logo' : 'cover'}`
  })
}

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
  '/:businessId/logo',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (typeof businessController.uploadLogo === 'function'
    ? businessController.uploadLogo
    : notImplemented('Upload de logo'))
)

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
  '/:businessId/cover',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (typeof businessController.uploadCoverImage === 'function'
    ? businessController.uploadCoverImage
    : notImplemented('Upload de portada'))
)

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
  '/:businessId/stats',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (req, res) => res.status(501).json({
    success: false,
    error: 'Estadísticas no implementadas aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
)

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
  '/:businessId/duplicate',
  requireOwner,
  requireBusinessOwnership('businessId'),
  (req, res) => res.status(501).json({
    success: false,
    error: 'Duplicación no implementada aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
)

export default router
