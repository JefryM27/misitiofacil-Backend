// routes/auth.routes.js
import express from 'express';
import authController from '../controllers/auth.controller.js';

// ✅ IMPORTACIONES CORREGIDAS - sin duplicados
import { 
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit 
} from '../middleware/security.js';

import { 
  sanitizeUserData 
} from '../middleware/index.js';

// ✅ CREAR los alias una sola vez
const rateLimitStrict = generalRateLimit;
const rateLimitAuth = authRateLimit;

const router = express.Router();

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
 *         id:
 *           type: string
 *           description: ID único del usuario
 *         email:
 *           type: string
 *           format: email
 *           description: Correo electrónico del usuario
 *         fullName:
 *           type: string
 *           description: Nombre completo del usuario
 *         username:
 *           type: string
 *           description: Nombre de usuario único
 *         role:
 *           type: string
 *           enum: [owner, client, admin]
 *           description: Rol del usuario en el sistema
 *         isActive:
 *           type: boolean
 *           description: Estado de activación de la cuenta
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - fullName
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 *         fullName:
 *           type: string
 *         username:
 *           type: string
 *         role:
 *           type: string
 *           enum: [owner, client]
 *           default: owner
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *             token:
 *               type: string
 *               description: JWT token de acceso
 *             refreshToken:
 *               type: string
 *               description: Token para renovar acceso
 *     ApiError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: string
 *           description: Mensaje de error
 *         timestamp:
 *           type: string
 *           format: date-time
 */

// ✅ Aplicar seguridad para autenticación
router.use(apiSecurityMiddleware);

/**
 * @swagger
 * /auth/register:
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
router.post('/register', 
  rateLimitStrict, 
  sanitizeUserData, 
  authController.register
);

/**
 * @swagger
 * /auth/login:
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
router.post('/login', 
  rateLimitAuth, 
  sanitizeUserData, 
  authController.login
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Sesión cerrada exitosamente"
 */
router.post('/logout', 
  authController.logout
);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Renovar token de acceso
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Token de renovación válido
 *     responses:
 *       200:
 *         description: Token renovado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       401:
 *         description: Refresh token inválido o expirado
 */
router.post('/refresh-token', 
  rateLimitAuth, 
  authController.refreshToken
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Solicitar recuperación de contraseña
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email del usuario que olvido su contraseña
 *     responses:
 *       200:
 *         description: Email de recuperación enviado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Email de recuperación enviado"
 *       404:
 *         description: Usuario no encontrado
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/forgot-password', 
  rateLimitStrict, 
  authController.requestPasswordReset  // ✅ MÉTODO CORRECTO
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Restablecer contraseña con token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token de recuperación recibido por email
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: Nueva contraseña
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: Confirmación de nueva contraseña
 *     responses:
 *       200:
 *         description: Contraseña restablecida exitosamente
 *       400:
 *         description: Token inválido o contraseñas no coinciden
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/reset-password', 
  rateLimitStrict, 
  authController.resetPassword
);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verificar email con token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Token de verificación recibido por email
 *     responses:
 *       200:
 *         description: Email verificado exitosamente
 *       400:
 *         description: Token inválido o expirado
 */
router.post('/verify-email', 
  rateLimitStrict, 
  // ✅ TEMPORAL: función placeholder hasta implementar
  (req, res) => res.status(501).json({ error: 'Función no implementada aún' })
);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     summary: Reenviar email de verificación
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email del usuario
 *     responses:
 *       200:
 *         description: Email de verificación reenviado
 *       404:
 *         description: Usuario no encontrado
 *       429:
 *         description: Demasiadas solicitudes
 */
router.post('/resend-verification', 
  rateLimitStrict, 
  // ✅ TEMPORAL: función placeholder hasta implementar
  (req, res) => res.status(501).json({ error: 'Función no implementada aún' })
);

export default router;