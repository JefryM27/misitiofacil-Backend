// routes/auth.routes.js
import express from 'express';
import authController from '../controllers/auth.controller.js';

// Seguridad
import {
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit,
} from '../middleware/security.js';

// Sanitización
import { sanitizeUserData } from '../middleware/index.js';

const router = express.Router();

// Rate limiting
const rateLimitStrict = generalRateLimit;
const rateLimitAuth = authRateLimit;

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Operaciones de autenticación y autorización
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id: { type: string, description: ID único del usuario }
 *         email: { type: string, format: email }
 *         fullName: { type: string }
 *         username: { type: string }
 *         role: { type: string, enum: [owner, client, admin] }
 *         isActive: { type: boolean }
 *     LoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email: { type: string, format: email }
 *         password: { type: string, minLength: 6 }
 *     RegisterRequest:
 *       type: object
 *       required: [email, password, fullName]
 *       properties:
 *         email: { type: string, format: email }
 *         password: { type: string, minLength: 6 }
 *         fullName: { type: string }
 *         username: { type: string }
 *         role: { type: string, enum: [owner, client], default: owner }
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success: { type: boolean }
 *         data:
 *           type: object
 *           properties:
 *             user: { $ref: '#/components/schemas/User' }
 *             token: { type: string, description: JWT token de acceso }
 *             refreshToken: { type: string, description: Token para renovar acceso }
 *     ApiError:
 *       type: object
 *       properties:
 *         success: { type: boolean, example: false }
 *         error: { type: string }
 *         timestamp: { type: string, format: date-time }
 */

// Seguridad base del router
router.use(apiSecurityMiddleware);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar nuevo usuario
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Datos inválidos o usuario ya existe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/register', rateLimitStrict, sanitizeUserData, authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Inicio de sesión exitoso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       429:
 *         description: Demasiados intentos de login
 */
router.post('/login', rateLimitAuth, sanitizeUserData, authController.login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Sesión cerrada exitosamente" }
 *       401:
 *         description: No autorizado
 */
router.post('/logout', authController.logout);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Renovar token de acceso
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Token de renovación válido
 *     responses:
 *       200:
 *         description: Token renovado exitosamente
 *       401:
 *         description: Refresh token inválido o expirado
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/refresh-token', rateLimitAuth, authController.refreshToken);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Solicitar recuperación de contraseña
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email del usuario que olvidó su contraseña
 *     responses:
 *       200:
 *         description: Email de recuperación enviado
 *       404:
 *         description: Usuario no encontrado
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/forgot-password', rateLimitStrict, authController.requestPasswordReset);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Restablecer contraseña con token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword, confirmPassword]
 *             properties:
 *               token: { type: string, description: Token recibido por email }
 *               newPassword: { type: string, minLength: 6 }
 *               confirmPassword: { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Contraseña restablecida exitosamente
 *       400:
 *         description: Token inválido o contraseñas no coinciden
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/reset-password', rateLimitStrict, authController.resetPassword);

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verificar email con token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: Token de verificación recibido por email }
 *     responses:
 *       200:
 *         description: Email verificado exitosamente
 *       400:
 *         description: Token inválido o expirado
 *       501:
 *         description: No implementado aún
 */
router.post('/verify-email', rateLimitStrict, (req, res) =>
  res.status(501).json({ error: 'No implementado aún' })
  // authController.verifyEmail
);

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Reenviar email de verificación
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Email de verificación reenviado
 *       404:
 *         description: Usuario no encontrado
 *       429:
 *         description: Demasiadas solicitudes
 *       501:
 *         description: No implementado aún
 */
router.post('/resend-verification', rateLimitStrict, (req, res) =>
  res.status(501).json({ error: 'No implementado aún' })
  // authController.resendVerification
);

export default router;
