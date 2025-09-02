// src/routes/user.routes.js
import express from 'express';
import userController from '../controllers/user.controller.js';
import { apiSecurityMiddleware } from '../middleware/security.js';
import { sanitizeUserData } from '../middleware/index.js';

// ✅ IMPORTACIÓN CORREGIDA: Usar requireAnyRole que acepta cualquier rol autenticado
import { requireAnyRole, requireAdmin, auth } from '../middleware/auth.js';

// ✅ Crear requireAuth como alias de requireAnyRole para mantener compatibilidad
const requireAuth = requireAnyRole;

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User profile and management
 */

// Seguridad base del router
router.use(apiSecurityMiddleware);

// Ping para comprobar que el router está montado: GET /api/users/_ping
router.get('/_ping', (_req, res) => res.json({ ok: true, scope: 'users' }));

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get('/me', requireAnyRole, userController.getCurrentUser);

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               username: { type: string }
 *               phone: { type: string }
 *               address: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               avatar: { type: string }
 *               preferences: { type: object }
 *               socialMedia: { type: object }
 *     responses:
 *       200:
 *         description: Updated user
 */
router.put('/me', requireAnyRole, sanitizeUserData, userController.updateProfile);

/**
 * @swagger
 * /api/users/password:
 *   patch:
 *     summary: Change password (logged user)
 *     tags: [Users]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword, confirmPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *               confirmPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password changed
 */
router.patch('/password', requireAnyRole, userController.changePassword);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: List users (requires admin)
 *     tags: [Users]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Users list
 */
router.get('/', requireAdmin, userController.getAllUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user by ID (ADMIN)
 *     tags: [Users]
 *     security: [ { bearerAuth: [] } ]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User detail
 */
router.get(
  '/:id',
  requireAdmin,
  // Adaptador para que el controller reciba req.params.userId (como lo espera tu código)
  (req, _res, next) => {
    req.params.userId = req.params.id;
    next();
  },
  userController.getUserById
);

export default router;