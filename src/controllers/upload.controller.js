// controllers/upload.controller.js
import path from 'path';
import fs from 'fs/promises';
import { v2 as cloudinary } from 'cloudinary';
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

const isProd = process.env.NODE_ENV === 'production';
const APP_BASE =
  (process.env.APP_URL && process.env.APP_URL.replace(/\/+$/, '')) ||
  `http://localhost:${process.env.PORT || 3001}`;
const useCloud =
  isProd || (process.env.STORAGE_TYPE || '').toLowerCase() === 'cloudinary';

/* ========================= Helpers ========================= */

/** Devuelve la carpeta de Cloudinary según el campo */
function cloudFolderFor(field) {
  const base = 'misitiofacil';
  switch ((field || '').toLowerCase()) {
    case 'logo': return `${base}/logos`;
    case 'cover':
    case 'portada': return `${base}/covers`;
    case 'gallery':
    case 'galeria': return `${base}/gallery`;
    case 'avatar':
    case 'profile': return `${base}/profiles`;
    default: return `${base}/general`;
  }
}

/** Sube un buffer a Cloudinary (promesa) */
function uploadBufferToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        // Opcional: forzar nombre legible (Cloudinary añadirá sufijo si existe)
        // filename_override: file.originalname?.slice(0, 100),
        // unique_filename: true
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(file.buffer);
  });
}

/** Sube un archivo en disco a Cloudinary (dev) */
function uploadPathToCloudinary(file, folder) {
  return cloudinary.uploader.upload(file.path, {
    folder,
    resource_type: 'image'
  });
}

/** Construye el objeto de archivo para guardar en DB */
function buildRecordFromCloudinary(result, originalName) {
  return {
    filename: path.basename(result.public_id), // sin la carpeta
    originalName: originalName,
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    provider: 'cloudinary',
    uploadedAt: new Date()
  };
}

function buildRecordFromLocal(file) {
  const url = `${APP_BASE}/${(file.path || '').replace(/\\/g, '/')}`;
  return {
    filename: file.filename,
    originalName: file.originalname,
    url,
    path: file.path,
    mimetype: file.mimetype,
    size: file.size,
    provider: 'local',
    uploadedAt: new Date()
  };
}

/** Borra el archivo anterior (Cloudinary o local) con tolerancia */
async function deletePreviousAsset(asset, fallbackFolder) {
  if (!asset) return;
  try {
    if (asset.publicId) {
      await deleteFromCloudinary(asset.publicId);
    } else if (asset.filename) {
      await deleteOldFile(asset.filename, fallbackFolder);
    }
  } catch (e) {
    logger.warn('No se pudo eliminar el asset anterior', {
      error: e?.message || String(e)
    });
  }
}

/** Elimina archivo local */
const deleteOldFile = async (filename, folder) => {
  try {
    const uploadPath = process.env.UPLOAD_PATH || 'uploads';
    const filePath = path.join(uploadPath, folder, filename);
    await fs.access(filePath);
    await fs.unlink(filePath);
    logger.info('Archivo anterior (local) eliminado', { filename, folder });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // ignora si no existe
  }
};

/** Decide si debemos usar Cloudinary para esta request */
function shouldUseCloudinary(file) {
  // Requiere configuración válida y el modo Cloud (prod o STORAGE_TYPE=cloudinary)
  if (!useCloud || !isCloudinaryConfigured()) return false;
  // Si viene en memoria (Vercel), es ideal para Cloudinary
  if (file?.buffer) return true;
  // Si viene en disco pero Cloud está activo, también permitimos subir
  if (file?.path) return true;
  return false;
}

/* ========================= Controller ========================= */

export const uploadController = {
  /* ============== UPLOAD BÁSICO ============== */

  uploadFile: controllerHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha enviado ningún archivo' });
    }

    let record;

    try {
      if (shouldUseCloudinary(req.file)) {
        const folder = cloudFolderFor(req.file.fieldname);
        const result = req.file.buffer
          ? await uploadBufferToCloudinary(req.file, folder)
          : await uploadPathToCloudinary(req.file, folder);

        record = buildRecordFromCloudinary(result, req.file.originalname);

        // Si subimos a Cloudinary desde disco, borra el temporal
        if (req.file.path) await cleanupTempFiles(req.file);
      } else {
        // Local (dev)
        record = buildRecordFromLocal(req.file);
      }

      logger.success('Archivo subido exitosamente', {
        filename: record.filename,
        provider: record.provider,
        userId: req.user?.id
      });

      return res.status(200).json({
        success: true,
        message: 'Archivo subido exitosamente',
        data: { file: record }
      });
    } catch (err) {
      await cleanupTempFiles(req.file);
      logger.error('Error subiendo archivo', { error: err?.message || err });
      return res.status(500).json({ success: false, error: 'Error subiendo archivo' });
    }
  }, 'Upload File'),

  /* ============== UPLOADS ESPECÍFICOS ============== */

  uploadLogo: controllerHandler(async (req, res) => {
    const { businessId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha enviado ningún logo' });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      await cleanupTempFiles(req.file);
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      await cleanupTempFiles(req.file);
      return res.status(403).json({ success: false, error: 'No tienes permisos para modificar este negocio' });
    }

    try {
      // Subir nuevo logo
      let newLogo;
      if (shouldUseCloudinary(req.file)) {
        const result = req.file.buffer
          ? await uploadBufferToCloudinary(req.file, cloudFolderFor('logo'))
          : await uploadPathToCloudinary(req.file, cloudFolderFor('logo'));
        newLogo = buildRecordFromCloudinary(result, req.file.originalname);
        if (req.file.path) await cleanupTempFiles(req.file);
      } else {
        newLogo = buildRecordFromLocal(req.file);
      }

      // Eliminar logo anterior
      await deletePreviousAsset(business.branding?.logo, 'logos');

      // Guardar en DB
      business.branding = { ...business.branding, logo: newLogo };
      await business.save();

      logger.success('Logo actualizado exitosamente', {
        businessId,
        filename: newLogo.filename,
        provider: newLogo.provider,
        userId: req.user.id
      });

      return res.json({
        success: true,
        message: 'Logo actualizado exitosamente',
        data: {
          business: { id: business._id, name: business.name },
          logo: newLogo
        }
      });
    } catch (err) {
      await cleanupTempFiles(req.file);
      logger.error('Error actualizando logo', { error: err?.message || err });
      return res.status(500).json({ success: false, error: 'Error subiendo el logo' });
    }
  }, 'Upload Logo'),

  uploadCover: controllerHandler(async (req, res) => {
    const { businessId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se ha enviado ninguna imagen de portada' });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      await cleanupTempFiles(req.file);
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      await cleanupTempFiles(req.file);
      return res.status(403).json({ success: false, error: 'No tienes permisos para modificar este negocio' });
    }

    try {
      let newCover;
      if (shouldUseCloudinary(req.file)) {
        const result = req.file.buffer
          ? await uploadBufferToCloudinary(req.file, cloudFolderFor('cover'))
          : await uploadPathToCloudinary(req.file, cloudFolderFor('cover'));
        newCover = buildRecordFromCloudinary(result, req.file.originalname);
        if (req.file.path) await cleanupTempFiles(req.file);
      } else {
        newCover = buildRecordFromLocal(req.file);
      }

      // Eliminar anterior
      await deletePreviousAsset(business.branding?.cover, 'covers');

      // Guardar
      business.branding = { ...business.branding, cover: newCover };
      await business.save();

      logger.success('Portada actualizada exitosamente', {
        businessId,
        filename: newCover.filename,
        provider: newCover.provider,
        userId: req.user.id
      });

      return res.json({
        success: true,
        message: 'Portada actualizada exitosamente',
        data: {
          business: { id: business._id, name: business.name },
          cover: newCover
        }
      });
    } catch (err) {
      await cleanupTempFiles(req.file);
      logger.error('Error actualizando portada', { error: err?.message || err });
      return res.status(500).json({ success: false, error: 'Error subiendo la portada' });
    }
  }, 'Upload Cover'),

  uploadGallery: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const { replace = false } = req.body;

    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ success: false, error: 'No se han enviado imágenes para la galería' });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      await cleanupTempFiles(files);
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      await cleanupTempFiles(files);
      return res.status(403).json({ success: false, error: 'No tienes permisos para modificar este negocio' });
    }

    try {
      // Subidas (Cloudinary o local)
      let newImages = [];

      if (shouldUseCloudinary(files[0])) {
        const folder = cloudFolderFor('gallery');
        const results = await Promise.all(
          files.map((f) =>
            f.buffer ? uploadBufferToCloudinary(f, folder) : uploadPathToCloudinary(f, folder)
          )
        );
        newImages = results.map((r, idx) => ({
          ...buildRecordFromCloudinary(r, files[idx].originalname),
          order: (business.content?.gallery?.length || 0) + idx
        }));

        // limpiar temporales si venían de disco
        await cleanupTempFiles(files);
      } else {
        newImages = files.map((f, idx) => ({
          ...buildRecordFromLocal(f),
          order: (business.content?.gallery?.length || 0) + idx
        }));
      }

      // Reemplazar o agregar
      let currentGallery = business.content?.gallery || [];
      if (replace === 'true' || replace === true) {
        // Eliminar existentes
        await Promise.all(
          currentGallery.map((img) =>
            img.publicId ? deleteFromCloudinary(img.publicId) : deleteOldFile(img.filename, 'gallery')
          )
        );
        currentGallery = newImages;
      } else {
        currentGallery = [...currentGallery, ...newImages];
      }

      // Validar límite
      const max = UPLOAD_CONFIG.gallery.maxFiles;
      if (currentGallery.length > max) {
        // si te pasaste, borra las nuevas que estaban en Cloudinary
        await Promise.all(
          newImages.map((img) =>
            img.publicId ? deleteFromCloudinary(img.publicId) : deleteOldFile(img.filename, 'gallery')
          )
        );
        return res.status(400).json({
          success: false,
          error: `La galería no puede tener más de ${max} imágenes`
        });
      }

      // Guardar
      business.content = { ...business.content, gallery: currentGallery };
      await Business.updateOne({ _id: business._id }, { $set: { content: business.content } });

      logger.success('Galería actualizada exitosamente', {
        businessId,
        imagesAdded: newImages.length,
        totalImages: currentGallery.length,
        userId: req.user.id
      });

      return res.json({
        success: true,
        message: 'Galería actualizada exitosamente',
        data: {
          business: { id: business._id, name: business.name },
          gallery: currentGallery,
          stats: {
            imagesAdded: newImages.length,
            totalImages: currentGallery.length,
            replaced: replace === 'true' || replace === true
          }
        }
      });
    } catch (err) {
      await cleanupTempFiles(files);
      logger.error('Error actualizando galería', { error: err?.message || err });
      return res.status(500).json({ success: false, error: 'Error subiendo la galería' });
    }
  }, 'Upload Gallery'),

  /* ============== GESTIÓN DE ARCHIVOS ============== */

  deleteGalleryImage: controllerHandler(async (req, res) => {
    const { businessId, filename } = req.params;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'No tienes permisos para modificar este negocio' });
    }

    const gallery = business.content?.gallery || [];
    const idx = gallery.findIndex((img) => img.filename === filename);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Imagen no encontrada en la galería' });
    }

    const img = gallery[idx];

    try {
      if (img.publicId) {
        await deleteFromCloudinary(img.publicId);
      } else {
        await deleteOldFile(filename, 'gallery');
      }
    } catch (e) {
      logger.warn('Error eliminando archivo físico', { error: e?.message || e });
    }

    gallery.splice(idx, 1);
    // Reordenar
    gallery.forEach((g, i) => (g.order = i));
    business.content.gallery = gallery;
    await business.save();

    logger.success('Imagen eliminada de galería', {
      businessId,
      filename,
      remainingImages: gallery.length,
      userId: req.user.id
    });

    return res.json({
      success: true,
      message: 'Imagen eliminada exitosamente',
      data: {
        gallery,
        remainingImages: gallery.length
      }
    });
  }, 'Delete Gallery Image'),

  reorderGallery: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const { imageOrder } = req.body;

    if (!Array.isArray(imageOrder)) {
      return res.status(400).json({ success: false, error: 'El orden debe ser un array de nombres de archivo' });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'No tienes permisos para modificar este negocio' });
    }

    const gallery = business.content?.gallery || [];
    const existing = new Set(gallery.map((img) => img.filename));
    const invalid = imageOrder.filter((f) => !existing.has(f));
    if (invalid.length) {
      return res.status(400).json({ success: false, error: `Archivos no encontrados: ${invalid.join(', ')}` });
    }

    const reordered = imageOrder.map((f, i) => {
      const img = gallery.find((g) => g.filename === f);
      return { ...img, order: i };
    });

    business.content.gallery = reordered;
    await business.save();

    logger.success('Galería reordenada', { businessId, newOrder: imageOrder, userId: req.user.id });

    return res.json({ success: true, message: 'Galería reordenada exitosamente', data: { gallery: reordered } });
  }, 'Reorder Gallery'),

  /* ============== INFORMACIÓN / UTILIDADES ============== */

  getBusinessUploads: controllerHandler(async (req, res) => {
    const { businessId } = req.params;

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ success: false, error: 'Negocio no encontrado' });
    }
    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'No tienes permisos para ver estos archivos' });
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

    let totalFiles = 0;
    if (uploads.logo) totalFiles++;
    if (uploads.cover) totalFiles++;
    totalFiles += uploads.gallery.length;
    uploads.stats.totalFiles = totalFiles;

    return res.json({ success: true, data: uploads });
  }, 'Get Business Uploads'),

  optimizeImage: controllerHandler(async (req, res) => {
    const { filename } = req.params;
    const { width, height, quality = 'auto', format = 'auto' } = req.query;

    if (!isCloudinaryConfigured()) {
      return res.status(400).json({ success: false, error: 'Optimización de imágenes no disponible' });
    }

    try {
      const optimizedUrl = optimizeImageUrl(filename, {
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        quality,
        format
      });

      return res.json({
        success: true,
        data: {
          originalFilename: filename,
          optimizedUrl,
          params: { width, height, quality, format }
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Error optimizando imagen',
        details: error.message
      });
    }
  }, 'Optimize Image')
};

export default uploadController;
