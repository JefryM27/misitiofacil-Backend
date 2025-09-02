// routes/template.routes.js - Con controlador real
import express from 'express';

// Importar el controlador real
import templateController from '../controllers/template.controller.js';

// ✅ IMPORTACIONES DE MIDDLEWARE - Usando tu estructura actual
import { 
  requireOwner,
  requireOwnerOrAdmin,
  optionalAuth,
  fullPagination,
  asyncHandler
} from '../middleware/index.js';

// ✅ IMPORTACIONES DE SEGURIDAD
import { 
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit 
} from '../middleware/security.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Templates
 *     description: Operaciones relacionadas con plantillas de diseño
 */

// ✅ Aplicar seguridad
router.use(apiSecurityMiddleware);

// =================== RUTAS CON CONTROLADOR REAL ===================

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Obtener templates públicos
 *     tags: [Templates]
 */
router.get('/', 
  optionalAuth,
  templateController.getPublicTemplates
);

/**
 * @swagger
 * /api/templates:
 *   post:
 *     summary: Crear nuevo template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', 
  requireOwner,
  templateController.createTemplate
);

/**
 * @swagger
 * /api/templates/default:
 *   get:
 *     summary: Obtener template por defecto
 *     tags: [Templates]
 */
router.get('/default', 
  templateController.getDefaultTemplate
);

/**
 * @swagger
 * /api/templates/my:
 *   get:
 *     summary: Obtener mis templates
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 */
router.get('/my', 
  requireOwner,
  templateController.getMyTemplates
);

/**
 * @swagger
 * /api/templates/test:
 *   get:
 *     summary: Ruta de prueba
 *     tags: [Templates]
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Template routes funcionando correctamente con controlador real',
    timestamp: new Date().toISOString(),
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : null
  });
});

/**
 * @swagger
 * /api/templates/{templateId}:
 *   get:
 *     summary: Obtener template por ID
 *     tags: [Templates]
 */
router.get('/:templateId', 
  optionalAuth,
  templateController.getTemplateById
);

/**
 * @swagger
 * /api/templates/{templateId}:
 *   put:
 *     summary: Actualizar template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:templateId', 
  requireOwner,
  templateController.updateTemplate
);

/**
 * @swagger
 * /api/templates/{templateId}:
 *   delete:
 *     summary: Eliminar template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:templateId', 
  requireOwner,
  templateController.deleteTemplate
);

/**
 * @swagger
 * /api/templates/{templateId}/duplicate:
 *   post:
 *     summary: Duplicar template
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:templateId/duplicate', 
  requireOwner,
  templateController.duplicateTemplate
);

export default router;