// routes/business.routes.js
import express from 'express';
import businessController from '../controllers/business.controller.js';

// ✅ IMPORTACIONES DE MIDDLEWARE CORREGIDAS
import { 
  requireOwner,
  requireOwnerOrAdmin, 
  requireBusinessOwnership,
  sanitizeBusinessData,
  fullPagination,
} from '../middleware/index.js';

// ✅ IMPORTACIONES DE SEGURIDAD
import { 
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit 
} from '../middleware/security.js';

// ✅ CREAR ALIAS
const rateLimitStrict = generalRateLimit;
const rateLimitAuth = authRateLimit;

const router = express.Router();

// ✅ Aplicar seguridad
router.use(apiSecurityMiddleware);

/**
 * @swagger
 * /business:
 *   get:
 *     summary: Lista todos los negocios (públicos)
 *     tags: [Business]
 */
// ✅ CORREGIDO: Usar listPublicBusinesses que sí existe
router.get('/', 
  fullPagination('business'), 
  businessController.listPublicBusinesses
);

/**
 * @swagger
 * /business:
 *   post:
 *     summary: Crear nuevo negocio
 *     tags: [Business]
 */
router.post('/', 
  requireOwner,
  sanitizeBusinessData, 
  businessController.createBusiness
);

/**
 * @swagger
 * /business/my:
 *   get:
 *     summary: Obtener mi negocio
 *     tags: [Business]
 */
// ✅ CORREGIDO: Usar getMyBusiness que sí existe
router.get('/my', 
  requireOwner, 
  businessController.getMyBusiness
);

/**
 * @swagger
 * /business/{businessId}:
 *   get:
 *     summary: Obtener negocio por ID
 *     tags: [Business]
 */
router.get('/:businessId', 
  businessController.getBusinessById
);

/**
 * @swagger
 * /business/{businessId}:
 *   put:
 *     summary: Actualizar negocio
 *     tags: [Business]
 */
router.put('/:businessId', 
  requireOwner,
  requireBusinessOwnership(),
  sanitizeBusinessData, 
  businessController.updateBusiness
);

/**
 * @swagger
 * /business/{businessId}:
 *   delete:
 *     summary: Eliminar negocio
 *     tags: [Business]
 */
router.delete('/:businessId', 
  requireOwner,
  requireBusinessOwnership(),
  businessController.deleteBusiness
);

/**
 * @swagger
 * /business/{businessId}/publish:
 *   put:
 *     summary: Publicar/despublicar negocio
 *     tags: [Business]
 */
// ✅ CORREGIDO: Usar changeBusinessStatus que sí existe
router.put('/:businessId/publish', 
  requireOwner,
  requireBusinessOwnership(),
  businessController.changeBusinessStatus
);

/**
 * @swagger
 * /business/slug/{slug}:
 *   get:
 *     summary: Obtener negocio por slug (URL amigable)
 *     tags: [Business]
 */
router.get('/slug/:slug', 
  businessController.getBusinessBySlug
);

/**
 * @swagger
 * /business/{businessId}/logo:
 *   post:
 *     summary: Subir logo del negocio
 *     tags: [Business]
 */
// ✅ AGREGADO: Ruta para subir logo
router.post('/:businessId/logo', 
  requireOwner,
  requireBusinessOwnership(),
  businessController.uploadLogo
);

/**
 * @swagger
 * /business/{businessId}/cover:
 *   post:
 *     summary: Subir imagen de portada
 *     tags: [Business]
 */
// ✅ AGREGADO: Ruta para subir portada
router.post('/:businessId/cover', 
  requireOwner,
  requireBusinessOwnership(),
  businessController.uploadCoverImage
);

/**
 * @swagger
 * /business/{businessId}/gallery:
 *   post:
 *     summary: Subir imágenes a galería
 *     tags: [Business]
 */
// ✅ AGREGADO: Ruta para subir galería
router.post('/:businessId/gallery', 
  requireOwner,
  requireBusinessOwnership(),
  businessController.uploadGalleryImages
);

/**
 * @swagger
 * /business/{businessId}/gallery/{imageId}:
 *   delete:
 *     summary: Eliminar imagen de galería
 *     tags: [Business]
 */
// ✅ AGREGADO: Ruta para eliminar imagen de galería
router.delete('/:businessId/gallery/:imageId', 
  requireOwner,
  requireBusinessOwnership(),
  businessController.deleteGalleryImage
);

// ============== RUTAS TEMPORALMENTE DESHABILITADAS ==============
// Estas rutas requieren métodos que aún no están implementados

/**
 * @swagger
 * /business/{businessId}/stats:
 *   get:
 *     summary: Obtener estadísticas del negocio (NO IMPLEMENTADO)
 *     tags: [Business]
 */
router.get('/:businessId/stats', 
  requireOwner,
  requireBusinessOwnership(),
  (req, res) => res.status(501).json({ 
    error: 'Estadísticas no implementadas aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
);

/**
 * @swagger
 * /business/{businessId}/duplicate:
 *   post:
 *     summary: Duplicar negocio (NO IMPLEMENTADO)
 *     tags: [Business]
 */
router.post('/:businessId/duplicate', 
  requireOwner,
  requireBusinessOwnership(),
  (req, res) => res.status(501).json({ 
    error: 'Duplicación no implementada aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
);

// ============== RUTAS ADMINISTRATIVAS (TEMPORALMENTE DESHABILITADAS) ==============

/**
 * @swagger
 * /business/admin/all:
 *   get:
 *     summary: Lista todos los negocios del sistema (NO IMPLEMENTADO)
 *     tags: [Business]
 */
router.get('/admin/all', 
  requireOwnerOrAdmin, 
  fullPagination('business'),
  (req, res) => res.status(501).json({ 
    error: 'Panel administrativo no implementado aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
);

/**
 * @swagger
 * /business/admin/{businessId}/suspend:
 *   put:
 *     summary: Suspender/reactivar negocio (NO IMPLEMENTADO)
 *     tags: [Business]
 */
router.put('/admin/:businessId/suspend', 
  requireOwnerOrAdmin,
  (req, res) => res.status(501).json({ 
    error: 'Suspensión de negocios no implementada aún',
    message: 'Esta funcionalidad estará disponible pronto'
  })
);

export default router;