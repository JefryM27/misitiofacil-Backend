// src/routes/reservation.routes.js
import express from 'express';
import { apiSecurityMiddleware } from '../middleware/security.js';

// ✅ IMPORTAR EL CONTROLADOR REAL
import reservationController from '../controllers/reservation.controller.js';

// ✅ IMPORTAR MIDDLEWARE DE AUTH CORRECTO
import { 
  auth, 
  requireAnyRole, 
  optionalAuth 
} from '../middleware/auth.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Reservations
 *     description: Booking & scheduling
 */

router.use(apiSecurityMiddleware);

// Test endpoint
router.get('/_ping', (_req, res) => res.json({ ok: true, scope: 'reservations' }));

// ============================================================================
// RUTAS CON CONTROLADOR REAL - SIN MIDDLEWARE INEXISTENTE
// ============================================================================

/**
 * @swagger
 * /api/reservations:
 *   post:
 *     summary: Crear una reserva
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [business, service, dateTime]
 *             properties:
 *               business: { type: string, description: "ID del negocio" }
 *               service: { type: string, description: "ID del servicio" }
 *               dateTime: { type: string, format: date-time }
 *               notes: { type: string }
 *               customerName: { type: string }
 *               customerEmail: { type: string, format: email }
 *               customerPhone: { type: string }
 *     responses:
 *       201:
 *         description: Reserva creada exitosamente
 *       400:
 *         description: Datos inválidos
 */
router.post('/', optionalAuth, reservationController.create);

/**
 * @swagger
 * /api/reservations:
 *   get:
 *     summary: Listar reservas (admin/owner)
 *     tags: [Reservations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: businessId
 *         schema: { type: string }
 *       - in: query
 *         name: serviceId  
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de reservas
 */
router.get('/', requireAnyRole, reservationController.list);

/**
 * @swagger
 * /api/reservations/my:
 *   get:
 *     summary: Listar mis reservas (cliente)
 *     tags: [Reservations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Lista de mis reservas
 */
router.get('/my', requireAnyRole, reservationController.listMine);

/**
 * @swagger
 * /api/reservations/{id}:
 *   get:
 *     summary: Obtener reserva por ID
 *     tags: [Reservations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Reserva encontrada
 *       404:
 *         description: Reserva no encontrada
 */
router.get('/:id', requireAnyRole, reservationController.getById);

/**
 * @swagger
 * /api/reservations/{id}/status:
 *   patch:
 *     summary: Actualizar estado de reserva
 *     tags: [Reservations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, cancelled]
 *     responses:
 *       200:
 *         description: Estado actualizado
 */
router.patch('/:id/status', requireAnyRole, reservationController.updateStatus);

/**
 * @swagger
 * /api/reservations/{id}/cancel:
 *   post:
 *     summary: Cancelar reserva
 *     tags: [Reservations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, maxLength: 300 }
 *     responses:
 *       200:
 *         description: Reserva cancelada
 */
router.post('/:id/cancel', requireAnyRole, reservationController.cancel);

export default router;