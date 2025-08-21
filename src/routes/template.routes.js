// routes/template.routes.js
import express from 'express';
import templateController from '../controllers/template.controller.js'; // ✅ Sin destructuring

// ✅ IMPORTACIONES DE MIDDLEWARE
import { 
  requireOwner,
  requireOwnerOrAdmin,
  optionalAuth,
  fullPagination,
} from '../middleware/index.js';

// ✅ IMPORTACIONES DE SEGURIDAD
import { 
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit 
} from '../middleware/security.js';

const rateLimitStrict = generalRateLimit;
const rateLimitAuth = authRateLimit;

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Templates
 *     description: Operaciones relacionadas con plantillas de diseño
 */

// ✅ Aplicar seguridad
router.use(apiSecurityMiddleware);

/**
 * @swagger
 * /templates:
 *   get:
 *     summary: Obtener todas las plantillas disponibles
 *     tags: [Templates]
 */
router.get('/', 
  optionalAuth,
  fullPagination('template'),
  templateController.getAllTemplates || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates:
 *   post:
 *     summary: Crear nueva plantilla
 *     tags: [Templates]
 */
router.post('/', 
  requireOwner,
  templateController.createTemplate || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/featured:
 *   get:
 *     summary: Obtener plantillas destacadas
 *     tags: [Templates]
 */
router.get('/featured', 
  templateController.getFeaturedTemplates || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/category/{category}:
 *   get:
 *     summary: Obtener plantillas por categoría
 *     tags: [Templates]
 */
router.get('/category/:category', 
  templateController.getTemplatesByCategory || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/categories/stats:
 *   get:
 *     summary: Estadísticas por categoría
 *     tags: [Templates]
 */
router.get('/categories/stats', 
  templateController.getCategoriesStats || ((req, res) => {
    // ✅ Implementación temporal con datos de ejemplo
    res.json({
      success: true,
      data: {
        categories: [
          {
            category: 'modern',
            displayName: 'Moderno',
            totalTemplates: 15,
            totalUsage: 342,
            averageRating: 4.2
          },
          {
            category: 'elegant',
            displayName: 'Elegante',
            totalTemplates: 12,
            totalUsage: 278,
            averageRating: 4.5
          },
          {
            category: 'minimalist',
            displayName: 'Minimalista',
            totalTemplates: 8,
            totalUsage: 156,
            averageRating: 4.1
          }
        ],
        summary: {
          totalCategories: 5,
          mostPopularCategory: 'modern',
          totalTemplatesAcrossCategories: 35
        }
      }
    });
  })
);

/**
 * @swagger
 * /templates/{id}:
 *   get:
 *     summary: Obtener plantilla por ID
 *     tags: [Templates]
 */
router.get('/:id', 
  optionalAuth,
  templateController.getTemplateById || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/{id}:
 *   put:
 *     summary: Actualizar plantilla
 *     tags: [Templates]
 */
router.put('/:id', 
  requireOwner,
  templateController.updateTemplate || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/{id}:
 *   delete:
 *     summary: Eliminar plantilla
 *     tags: [Templates]
 */
router.delete('/:id', 
  requireOwner,
  templateController.deleteTemplate || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/{templateId}/apply/{businessId}:
 *   post:
 *     summary: Aplicar plantilla a un negocio
 *     tags: [Templates]
 */
router.post('/:templateId/apply/:businessId', 
  requireOwner,
  templateController.applyTemplateToBusiness || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/{id}/duplicate:
 *   post:
 *     summary: Duplicar plantilla
 *     tags: [Templates]
 */
router.post('/:id/duplicate', 
  requireOwner,
  templateController.duplicateTemplate || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/{id}/rate:
 *   post:
 *     summary: Calificar plantilla
 *     tags: [Templates]
 */
router.post('/:id/rate', 
  requireOwner,
  templateController.rateTemplate || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /templates/{id}/stats:
 *   get:
 *     summary: Estadísticas de la plantilla
 *     tags: [Templates]
 */
router.get('/:id/stats', 
  requireOwner,
  templateController.getTemplateStats || ((req, res) => {
    res.status(501).json({ error: 'Estadísticas no implementadas' });
  })
);

// ============== RUTAS ADMINISTRATIVAS ==============

/**
 * @swagger
 * /templates/admin/manage:
 *   get:
 *     summary: Gestión administrativa de plantillas
 *     tags: [Templates]
 */
router.get('/admin/manage', 
  requireOwnerOrAdmin,
  fullPagination('template'),
  templateController.adminManageTemplates || ((req, res) => {
    res.status(501).json({ error: 'Gestión administrativa no implementada' });
  })
);

/**
 * @swagger
 * /templates/admin/{id}/approve:
 *   put:
 *     summary: Aprobar plantilla (admin)
 *     tags: [Templates]
 */
router.put('/admin/:id/approve', 
  requireOwnerOrAdmin,
  templateController.adminApproveTemplate || ((req, res) => {
    res.status(501).json({ error: 'Aprobación no implementada' });
  })
);

export default router;