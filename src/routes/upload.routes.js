// routes/upload.routes.js
import express from 'express';
import uploadController from '../controllers/upload.controller.js'; // ✅ Sin destructuring

// ✅ IMPORTACIONES DE MIDDLEWARE
import { 
  requireOwner,
  requireOwnerOrAdmin,
  requireBusinessOwnership,
  uploadLogoMiddleware,
  uploadCoverMiddleware,
  uploadGalleryMiddleware,
} from '../middleware/index.js';

// ✅ IMPORTACIONES DE SEGURIDAD
import { 
  apiSecurityMiddleware,
  authRateLimit,
  generalRateLimit 
} from '../middleware/security.js';

// ✅ IMPORTAR MULTER BÁSICO PARA ARCHIVOS GENERALES
import multer from 'multer';

const rateLimitStrict = generalRateLimit;
const rateLimitAuth = authRateLimit;

// ✅ CONFIGURAR MULTER BÁSICO
const upload = multer({
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Upload
 *     description: Operaciones de carga de archivos e imágenes
 */

// ✅ Aplicar seguridad
router.use(apiSecurityMiddleware);

/**
 * @swagger
 * /upload/file:
 *   post:
 *     summary: Subir archivo general
 *     tags: [Upload]
 */
router.post('/file', 
  requireOwner,
  upload.single('file'),
  uploadController.uploadFile || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/business/{businessId}/logo:
 *   post:
 *     summary: Subir logo para un negocio
 *     tags: [Upload]
 */
router.post('/business/:businessId/logo', 
  requireOwner,
  requireBusinessOwnership(),
  uploadLogoMiddleware(true),
  uploadController.uploadLogo || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/business/{businessId}/cover:
 *   post:
 *     summary: Subir imagen de portada
 *     tags: [Upload]
 */
router.post('/business/:businessId/cover', 
  requireOwner,
  requireBusinessOwnership(),
  uploadCoverMiddleware(true),
  uploadController.uploadCover || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/business/{businessId}/gallery:
 *   post:
 *     summary: Subir imágenes a galería
 *     tags: [Upload]
 */
router.post('/business/:businessId/gallery', 
  requireOwner,
  requireBusinessOwnership(),
  uploadGalleryMiddleware(10, true),
  uploadController.uploadGallery || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/business/{businessId}/gallery/{filename}:
 *   delete:
 *     summary: Eliminar imagen de galería
 *     tags: [Upload]
 */
router.delete('/business/:businessId/gallery/:filename', 
  requireOwner,
  requireBusinessOwnership(),
  uploadController.deleteGalleryImage || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/business/{businessId}/gallery/reorder:
 *   put:
 *     summary: Reordenar imágenes de galería
 *     tags: [Upload]
 */
router.put('/business/:businessId/gallery/reorder', 
  requireOwner,
  requireBusinessOwnership(),
  uploadController.reorderGallery || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/business/{businessId}/files:
 *   get:
 *     summary: Obtener archivos de un negocio
 *     tags: [Upload]
 */
router.get('/business/:businessId/files', 
  requireOwner,
  requireBusinessOwnership(),
  uploadController.getBusinessUploads || ((req, res) => {
    res.status(501).json({ error: 'Método no implementado' });
  })
);

/**
 * @swagger
 * /upload/optimize/{filename}:
 *   get:
 *     summary: Optimizar imagen
 *     tags: [Upload]
 */
router.get('/optimize/:filename', 
  uploadController.optimizeImage || ((req, res) => {
    res.status(501).json({ error: 'Optimización no implementada' });
  })
);

export default router;