import { 
  upload, 
  uploadLogo, 
  uploadCover, 
  uploadGallery, 
  handleMulterError,
  cleanupTempFiles,
  UPLOAD_CONFIG 
} from '../config/storage/index.js';
import { ValidationError, throwIf } from './errorHandler.js';
import { constants } from '../config/index.js';

const { ERROR_MESSAGES, FILE_SIZE_LIMITS, ALLOWED_FILE_TYPES } = constants;

// Middleware para procesar uploads con validaciones adicionales
export const processFileUpload = (uploadType = 'general', options = {}) => {
  return (req, res, next) => {
    const {
      required = false,
      maxFiles = 1,
      customValidation = null
    } = options;

    // Seleccionar configuración de upload según el tipo
    let multerMiddleware;
    
    switch (uploadType) {
      case 'logo':
        multerMiddleware = uploadLogo.single('logo');
        break;
      case 'cover':
        multerMiddleware = uploadCover.single('cover');
        break;
      case 'gallery':
        multerMiddleware = uploadGallery.array('gallery', maxFiles);
        break;
      case 'multiple':
        multerMiddleware = upload.array('files', maxFiles);
        break;
      case 'single':
      default:
        multerMiddleware = upload.single('file');
        break;
    }

    // Ejecutar middleware de multer
    multerMiddleware(req, res, (err) => {
      try {
        // Manejar errores de multer
          if (err) {
          const e = handleMulterError(err); // traduce a AppError/ValidationError
        return next(e);
      }

        // Verificar si el archivo es requerido
        const hasFiles = req.file || (req.files && req.files.length > 0);
        
        if (required && !hasFiles) {
          return next(new ValidationError('Archivo requerido'));
        }

        // Si no hay archivos y no es requerido, continuar
        if (!hasFiles) {
          return next();
        }

        // Validaciones adicionales
        if (customValidation) {
          const validationResult = customValidation(req.file || req.files);
          if (validationResult !== true) {
            // Limpiar archivos subidos si la validación falla
            cleanupTempFiles(req.file || req.files);
            return next(new ValidationError(validationResult));
          }
        }

        // Procesar metadatos de archivos
        if (req.file) {
          req.fileMetadata = processFileMetadata(req.file, uploadType);
        } else if (req.files) {
          req.filesMetadata = req.files.map(file => processFileMetadata(file, uploadType));
        }

        next();

      } catch (error) {
        // Limpiar archivos en caso de error
        if (req.file || req.files) {
          cleanupTempFiles(req.file || req.files);
        }
        next(error);
      }
    });
  };
};

// Función para procesar metadatos de archivos
const processFileMetadata = (file, uploadType) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  
  return {
    originalName: file.originalname,
    filename: file.filename,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
    url: `${baseUrl}/${file.path.replace(/\\/g, '/')}`,
    uploadType,
    uploadedAt: new Date().toISOString()
  };
};

// Middleware específicos para cada tipo de upload
export const uploadLogoMiddleware = (required = false) => {
  return processFileUpload('logo', { 
    required,
    customValidation: (file) => {
      // Validación específica para logos
      if (file.size > FILE_SIZE_LIMITS.LOGO) {
        return `Logo muy grande. Máximo ${FILE_SIZE_LIMITS.LOGO / (1024 * 1024)}MB`;
      }
      
      if (!ALLOWED_FILE_TYPES.LOGOS.includes(file.mimetype)) {
        return 'Tipo de archivo no válido para logo. Use JPG, PNG, WebP o SVG';
      }
      
      return true;
    }
  });
};

export const uploadCoverMiddleware = (required = false) => {
  return processFileUpload('cover', { 
    required,
    customValidation: (file) => {
      if (file.size > FILE_SIZE_LIMITS.COVER) {
        return `Portada muy grande. Máximo ${FILE_SIZE_LIMITS.COVER / (1024 * 1024)}MB`;
      }
      
      if (!ALLOWED_FILE_TYPES.IMAGES.includes(file.mimetype)) {
        return 'Tipo de archivo no válido para portada. Use JPG, PNG o WebP';
      }
      
      return true;
    }
  });
};

export const uploadGalleryMiddleware = (maxFiles = 10, required = false) => {
  return processFileUpload('gallery', { 
    required,
    maxFiles,
    customValidation: (files) => {
      if (!Array.isArray(files)) {
        files = [files];
      }

      // Validar cada archivo
      for (const file of files) {
        if (file.size > FILE_SIZE_LIMITS.GALLERY) {
          return `Imagen de galería muy grande: ${file.originalname}. Máximo ${FILE_SIZE_LIMITS.GALLERY / (1024 * 1024)}MB`;
        }
        
        if (!ALLOWED_FILE_TYPES.IMAGES.includes(file.mimetype)) {
          return `Tipo de archivo no válido: ${file.originalname}. Use JPG, PNG o WebP`;
        }
      }

      // Validar cantidad total
      if (files.length > maxFiles) {
        return `Demasiadas imágenes. Máximo ${maxFiles}`;
      }

      return true;
    }
  });
};

// Middleware para validar dimensiones de imagen (usando sharp si está disponible)
export const validateImageDimensions = (minWidth = 0, minHeight = 0, maxWidth = 5000, maxHeight = 5000) => {
  return async (req, res, next) => {
    try {
      // Solo validar si hay archivos
      if (!req.file && (!req.files || req.files.length === 0)) {
        return next();
      }

      const files = req.file ? [req.file] : req.files;

      // Intentar importar sharp para validación de dimensiones
      let sharp;
      try {
        sharp = (await import('sharp')).default;
      } catch (err) {
        // Si sharp no está disponible, continuar sin validación de dimensiones
        console.warn('Sharp no disponible. Saltando validación de dimensiones.');
        return next();
      }

      // Validar dimensiones de cada archivo
      for (const file of files) {
        try {
          const metadata = await sharp(file.path).metadata();
          
          throwIf(
            metadata.width < minWidth || metadata.height < minHeight,
            `Imagen muy pequeña: ${file.originalname}. Mínimo ${minWidth}x${minHeight}px`
          );
          
          throwIf(
            metadata.width > maxWidth || metadata.height > maxHeight,
            `Imagen muy grande: ${file.originalname}. Máximo ${maxWidth}x${maxHeight}px`
          );

          // Agregar metadatos de dimensiones
          if (req.fileMetadata && files.length === 1) {
            req.fileMetadata.dimensions = {
              width: metadata.width,
              height: metadata.height
            };
          } else if (req.filesMetadata) {
            const fileMetadata = req.filesMetadata.find(meta => meta.filename === file.filename);
            if (fileMetadata) {
              fileMetadata.dimensions = {
                width: metadata.width,
                height: metadata.height
              };
            }
          }

        } catch (sharpError) {
          console.error('Error validando dimensiones:', sharpError);
          // Si hay error con sharp, continuar sin validación
        }
      }

      next();

    } catch (error) {
      // Limpiar archivos en caso de error
      if (req.file || req.files) {
        cleanupTempFiles(req.file || req.files);
      }
      next(error);
    }
  };
};

// Middleware para optimizar imágenes (usando sharp si está disponible)
export const optimizeImages = (options = {}) => {
  const {
    quality = 80,
    format = null, // 'jpeg', 'png', 'webp'
    resize = null // { width: 800, height: 600 }
  } = options;

  return async (req, res, next) => {
    try {
      // Solo optimizar si hay archivos de imagen
      if (!req.file && (!req.files || req.files.length === 0)) {
        return next();
      }

      const files = req.file ? [req.file] : req.files;

      // Intentar importar sharp
      let sharp;
      try {
        sharp = (await import('sharp')).default;
      } catch (err) {
        console.warn('Sharp no disponible. Saltando optimización de imágenes.');
        return next();
      }

      // Optimizar cada archivo
      for (const file of files) {
        try {
          let pipeline = sharp(file.path);

          // Redimensionar si se especifica
          if (resize) {
            pipeline = pipeline.resize(resize.width, resize.height, {
              fit: 'inside',
              withoutEnlargement: true
            });
          }

          // Aplicar formato y calidad
          if (format === 'jpeg' || file.mimetype === 'image/jpeg') {
            pipeline = pipeline.jpeg({ quality });
          } else if (format === 'png' || file.mimetype === 'image/png') {
            pipeline = pipeline.png({ quality });
          } else if (format === 'webp' || file.mimetype === 'image/webp') {
            pipeline = pipeline.webp({ quality });
          }

          // Sobrescribir archivo original con versión optimizada
          await pipeline.toFile(file.path + '.optimized');
          
          // Reemplazar archivo original
          const fs = await import('fs/promises');
          await fs.rename(file.path + '.optimized', file.path);

        } catch (optimizeError) {
          console.error('Error optimizando imagen:', optimizeError);
          // Si hay error en optimización, continuar con archivo original
        }
      }

      next();

    } catch (error) {
      next(error);
    }
  };
};

// Middleware para limpiar archivos temporales en caso de error
export const cleanupOnError = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Si la respuesta es un error (status >= 400), limpiar archivos
    if (res.statusCode >= 400) {
      if (req.file || req.files) {
        cleanupTempFiles(req.file || req.files);
      }
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Middleware para validar que el usuario puede subir archivos
export const canUploadFiles = (req, res, next) => {
  // Verificar que el usuario está autenticado
  if (!req.user) {
    return next(new ValidationError('Debe estar autenticado para subir archivos'));
  }

  // Verificar límites por rol
  const maxFileSize = req.user.role === 'admin' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
  const maxFiles = req.user.role === 'admin' ? 20 : 10;

  // Agregar límites al request para uso posterior
  req.uploadLimits = {
    maxFileSize,
    maxFiles
  };

  next();
};

// Función helper para obtener información de archivos subidos
export const getUploadedFilesInfo = (req) => {
  if (req.fileMetadata) {
    return [req.fileMetadata];
  } else if (req.filesMetadata) {
    return req.filesMetadata;
  }
  return [];
};

export default {
  processFileUpload,
  uploadLogoMiddleware,
  uploadCoverMiddleware,
  uploadGalleryMiddleware,
  validateImageDimensions,
  optimizeImages,
  cleanupOnError,
  canUploadFiles,
  getUploadedFilesInfo,
  processFileMetadata
};