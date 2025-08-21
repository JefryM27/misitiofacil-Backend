// controllers/upload.controller.js
import path from 'path';
import fs from 'fs/promises';
import { controllerHandler } from '../middleware/asyncHandler.js';
import { logger } from '../middleware/logger.js';
import { 
  cleanupTempFiles, 
  UPLOAD_CONFIG,
  isCloudinaryConfigured,
  deleteFromCloudinary,
  optimizeImageUrl
} from '../config/storage/index.js';
import Business from '../models/business.js';

export const uploadController = {
  
  // ============== UPLOAD BÁSICO ==============
  
  // Upload de archivo general
  uploadFile: controllerHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se ha enviado ningún archivo'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    const fileUrl = `${baseUrl}/${req.file.path.replace(/\\/g, '/')}`;

    logger.success('Archivo subido exitosamente', {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      userId: req.user?.id
    });

    res.status(200).json({
      success: true,
      message: 'Archivo subido exitosamente',
      data: {
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: fileUrl,
          path: req.file.path,
          uploadedAt: new Date().toISOString()
        }
      }
    });
  }, 'Upload File'),

  // ============== UPLOADS ESPECÍFICOS ==============
  
  // Upload de logo para negocio
  uploadLogo: controllerHandler(async (req, res) => {
    const { businessId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se ha enviado ningún logo'
      });
    }

    // Verificar que el negocio existe y pertenece al usuario
    const business = await Business.findById(businessId);
    if (!business) {
      await cleanupTempFiles([req.file]);
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      await cleanupTempFiles([req.file]);
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este negocio'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    const logoUrl = `${baseUrl}/${req.file.path.replace(/\\/g, '/')}`;

    // Eliminar logo anterior si existe
    if (business.branding?.logo?.filename) {
      try {
        await deleteOldFile(business.branding.logo.filename, 'logos');
      } catch (error) {
        logger.warn('Error eliminando logo anterior', { error: error.message });
      }
    }

    // Actualizar negocio con nuevo logo
    business.branding = {
      ...business.branding,
      logo: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: logoUrl,
        path: req.file.path,
        uploadedAt: new Date()
      }
    };

    await business.save();

    logger.success('Logo actualizado exitosamente', {
      businessId,
      filename: req.file.filename,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Logo actualizado exitosamente',
      data: {
        business: {
          id: business._id,
          name: business.name
        },
        logo: business.branding.logo
      }
    });
  }, 'Upload Logo'),

  // Upload de portada para negocio
  uploadCover: controllerHandler(async (req, res) => {
    const { businessId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se ha enviado ninguna imagen de portada'
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      await cleanupTempFiles([req.file]);
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      await cleanupTempFiles([req.file]);
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este negocio'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    const coverUrl = `${baseUrl}/${req.file.path.replace(/\\/g, '/')}`;

    // Eliminar portada anterior
    if (business.branding?.cover?.filename) {
      try {
        await deleteOldFile(business.branding.cover.filename, 'covers');
      } catch (error) {
        logger.warn('Error eliminando portada anterior', { error: error.message });
      }
    }

    // Actualizar negocio
    business.branding = {
      ...business.branding,
      cover: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: coverUrl,
        path: req.file.path,
        uploadedAt: new Date()
      }
    };

    await business.save();

    logger.success('Portada actualizada exitosamente', {
      businessId,
      filename: req.file.filename,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Portada actualizada exitosamente',
      data: {
        business: {
          id: business._id,
          name: business.name
        },
        cover: business.branding.cover
      }
    });
  }, 'Upload Cover'),

  // Upload de galería para negocio
  uploadGallery: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const { replace = false } = req.body; // Si reemplazar toda la galería

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se han enviado imágenes para la galería'
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      await cleanupTempFiles(req.files);
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      await cleanupTempFiles(req.files);
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este negocio'
      });
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';

    // Procesar archivos subidos
    const newImages = req.files.map((file, index) => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `${baseUrl}/${file.path.replace(/\\/g, '/')}`,
      path: file.path,
      order: business.content?.gallery?.length + index || index,
      uploadedAt: new Date()
    }));

    // Gestionar galería existente
    let currentGallery = business.content?.gallery || [];

    if (replace === 'true' || replace === true) {
      // Eliminar imágenes anteriores
      if (currentGallery.length > 0) {
        try {
          await Promise.all(
            currentGallery.map(img => deleteOldFile(img.filename, 'gallery'))
          );
        } catch (error) {
          logger.warn('Error eliminando galería anterior', { error: error.message });
        }
      }
      currentGallery = newImages;
    } else {
      // Agregar a la galería existente
      currentGallery = [...currentGallery, ...newImages];
    }

    // Validar límite de imágenes
    const maxGalleryImages = UPLOAD_CONFIG.gallery.maxFiles;
    if (currentGallery.length > maxGalleryImages) {
      await cleanupTempFiles(req.files);
      return res.status(400).json({
        success: false,
        error: `La galería no puede tener más de ${maxGalleryImages} imágenes`
      });
    }

    // Actualizar negocio
    business.content = {
      ...business.content,
      gallery: currentGallery
    };

    await business.save();

    logger.success('Galería actualizada exitosamente', {
      businessId,
      imagesAdded: req.files.length,
      totalImages: currentGallery.length,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Galería actualizada exitosamente',
      data: {
        business: {
          id: business._id,
          name: business.name
        },
        gallery: currentGallery,
        stats: {
          imagesAdded: req.files.length,
          totalImages: currentGallery.length,
          replaced: replace === 'true' || replace === true
        }
      }
    });
  }, 'Upload Gallery'),

  // ============== GESTIÓN DE ARCHIVOS ==============
  
  // Eliminar archivo específico de galería
  deleteGalleryImage: controllerHandler(async (req, res) => {
    const { businessId, filename } = req.params;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este negocio'
      });
    }

    const gallery = business.content?.gallery || [];
    const imageIndex = gallery.findIndex(img => img.filename === filename);

    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Imagen no encontrada en la galería'
      });
    }

    // Eliminar archivo físico
    try {
      await deleteOldFile(filename, 'gallery');
    } catch (error) {
      logger.warn('Error eliminando archivo físico', { error: error.message });
    }

    // Remover de la galería
    gallery.splice(imageIndex, 1);
    
    // Reordenar índices
    gallery.forEach((img, index) => {
      img.order = index;
    });

    business.content.gallery = gallery;
    await business.save();

    logger.success('Imagen eliminada de galería', {
      businessId,
      filename,
      remainingImages: gallery.length,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente',
      data: {
        gallery: gallery,
        remainingImages: gallery.length
      }
    });
  }, 'Delete Gallery Image'),

  // Reordenar imágenes de galería
  reorderGallery: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const { imageOrder } = req.body; // Array de filenames en el orden deseado

    if (!Array.isArray(imageOrder)) {
      return res.status(400).json({
        success: false,
        error: 'El orden debe ser un array de nombres de archivo'
      });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este negocio'
      });
    }

    const gallery = business.content?.gallery || [];
    
    // Validar que todos los filenames existen
    const galleryFilenames = gallery.map(img => img.filename);
    const invalidFilenames = imageOrder.filter(filename => !galleryFilenames.includes(filename));
    
    if (invalidFilenames.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Archivos no encontrados: ${invalidFilenames.join(', ')}`
      });
    }

    // Reordenar galería
    const reorderedGallery = imageOrder.map((filename, index) => {
      const image = gallery.find(img => img.filename === filename);
      return {
        ...image,
        order: index
      };
    });

    business.content.gallery = reorderedGallery;
    await business.save();

    logger.success('Galería reordenada', {
      businessId,
      newOrder: imageOrder,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Galería reordenada exitosamente',
      data: {
        gallery: reorderedGallery
      }
    });
  }, 'Reorder Gallery'),

  // ============== INFORMACIÓN DE ARCHIVOS ==============
  
  // Obtener información de uploads de un negocio
  getBusinessUploads: controllerHandler(async (req, res) => {
    const { businessId } = req.params;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para ver estos archivos'
      });
    }

    const uploads = {
      logo: business.branding?.logo || null,
      cover: business.branding?.cover || null,
      gallery: business.content?.gallery || [],
      stats: {
        totalFiles: 0,
        totalSize: 0,
        galleryCount: business.content?.gallery?.length || 0
      }
    };

    // Calcular estadísticas
    let totalFiles = 0;
    let totalSize = 0;

    if (uploads.logo) {
      totalFiles++;
      // El tamaño se puede obtener del archivo si está disponible
    }

    if (uploads.cover) {
      totalFiles++;
    }

    totalFiles += uploads.gallery.length;
    uploads.stats.totalFiles = totalFiles;

    res.json({
      success: true,
      data: uploads
    });
  }, 'Get Business Uploads'),

  // ============== UTILIDADES ==============
  
  // Optimizar imagen (si se usa Cloudinary)
  optimizeImage: controllerHandler(async (req, res) => {
    const { filename } = req.params;
    const { width, height, quality = 'auto', format = 'auto' } = req.query;

    if (!isCloudinaryConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Optimización de imágenes no disponible'
      });
    }

    try {
      const optimizedUrl = optimizeImageUrl(filename, {
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        quality,
        format
      });

      res.json({
        success: true,
        data: {
          originalFilename: filename,
          optimizedUrl,
          params: { width, height, quality, format }
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Error optimizando imagen',
        details: error.message
      });
    }
  }, 'Optimize Image')
};

// ============== FUNCIONES AUXILIARES ==============

// Función para eliminar archivos antiguos
const deleteOldFile = async (filename, folder) => {
  try {
    const uploadPath = process.env.UPLOAD_PATH || 'uploads';
    const filePath = path.join(uploadPath, folder, filename);
    
    await fs.access(filePath);
    await fs.unlink(filePath);
    
    logger.info('Archivo anterior eliminado', { filename, folder });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // Archivo no existe, no es un error
  }
};

export default uploadController;