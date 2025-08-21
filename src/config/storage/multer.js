import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// Configuración de tipos de archivos y límites
const UPLOAD_CONFIG = {
  images: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    maxSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE) || 2 * 1024 * 1024, // 2MB
    maxFiles: parseInt(process.env.UPLOAD_MAX_FILES) || 5
  },
  logos: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSize: 1 * 1024 * 1024, // 1MB para logos
    maxFiles: 1
  },
  covers: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 3 * 1024 * 1024, // 3MB para portadas
    maxFiles: 1
  },
  gallery: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
    maxFiles: 10 // Máximo 10 imágenes en galería
  }
};

// Función para asegurar que las carpetas existan
const ensureDir = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    console.log(`📁 Carpeta creada: ${dir}`);
  }
};

// Función para obtener la ruta de destino según el tipo de archivo
const getDestinationPath = (fieldname) => {
  const basePath = process.env.UPLOAD_PATH || 'uploads';
  
  switch (fieldname) {
    case 'logo':
      return `${basePath}/logos/`;
    case 'cover':
    case 'portada':
      return `${basePath}/covers/`;
    case 'gallery':
    case 'galeria':
      return `${basePath}/gallery/`;
    case 'avatar':
    case 'profile':
      return `${basePath}/profiles/`;
    default:
      return `${basePath}/general/`;
  }
};

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const uploadPath = getDestinationPath(file.fieldname);
      await ensureDir(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      console.error('❌ Error creando directorio de upload:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    try {
      const uniqueSuffix = uuidv4();
      const timestamp = Date.now();
      const ext = path.extname(file.originalname).toLowerCase();
      const sanitizedOriginalName = file.originalname
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50); // Limitar longitud
      
      const filename = `${file.fieldname}-${timestamp}-${uniqueSuffix}${ext}`;
      
      // Agregar metadata al request para uso posterior
      if (!req.uploadedFiles) req.uploadedFiles = [];
      req.uploadedFiles.push({
        fieldname: file.fieldname,
        originalname: file.originalname,
        filename: filename,
        path: getDestinationPath(file.fieldname) + filename
      });
      
      cb(null, filename);
    } catch (error) {
      console.error('❌ Error generando nombre de archivo:', error);
      cb(error);
    }
  }
});

// Función para crear filtro de archivos específico
const createFileFilter = (type = 'images') => {
  return (req, file, cb) => {
    const config = UPLOAD_CONFIG[type];
    
    if (!config) {
      return cb(new Error(`Tipo de configuración no válido: ${type}`), false);
    }
    
    // Verificar tipo MIME
    if (config.mimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const allowedTypes = config.mimeTypes.join(', ');
      cb(new Error(`Tipo de archivo no válido para ${type}. Permitidos: ${allowedTypes}`), false);
    }
  };
};

// Middleware para validar el tamaño total de archivos múltiples
const validateTotalSize = (maxTotalSize) => {
  return (req, res, next) => {
    if (req.files && Array.isArray(req.files)) {
      const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
      if (totalSize > maxTotalSize) {
        return res.status(400).json({
          error: 'Total file size exceeded',
          message: `El tamaño total de archivos excede el límite de ${maxTotalSize / (1024 * 1024)}MB`
        });
      }
    }
    next();
  };
};

// Configuraciones de upload específicas
export const uploadImage = multer({
  storage,
  fileFilter: createFileFilter('images'),
  limits: {
    fileSize: UPLOAD_CONFIG.images.maxSize,
    files: UPLOAD_CONFIG.images.maxFiles
  }
});

export const uploadLogo = multer({
  storage,
  fileFilter: createFileFilter('logos'),
  limits: {
    fileSize: UPLOAD_CONFIG.logos.maxSize,
    files: UPLOAD_CONFIG.logos.maxFiles
  }
});

export const uploadCover = multer({
  storage,
  fileFilter: createFileFilter('covers'),
  limits: {
    fileSize: UPLOAD_CONFIG.covers.maxSize,
    files: UPLOAD_CONFIG.covers.maxFiles
  }
});

export const uploadGallery = multer({
  storage,
  fileFilter: createFileFilter('gallery'),
  limits: {
    fileSize: UPLOAD_CONFIG.gallery.maxSize,
    files: UPLOAD_CONFIG.gallery.maxFiles
  }
});

// Upload general (backward compatibility)
export const upload = uploadImage;

// Middleware para manejo de errores de Multer
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: 'El archivo excede el tamaño máximo permitido',
          maxSize: `${err.field ? UPLOAD_CONFIG[err.field]?.maxSize || UPLOAD_CONFIG.images.maxSize : UPLOAD_CONFIG.images.maxSize} bytes`
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Demasiados archivos subidos',
          maxFiles: UPLOAD_CONFIG.images.maxFiles
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected field',
          message: `Campo de archivo inesperado: ${err.field}`
        });
      
      default:
        return res.status(400).json({
          error: 'Upload error',
          message: err.message
        });
    }
  }
  
  // Errores personalizados (tipo de archivo, etc.)
  if (err.message.includes('Tipo de archivo no válido')) {
    return res.status(400).json({
      error: 'Invalid file type',
      message: err.message
    });
  }
  
  // Error genérico
  console.error('❌ Error de upload no manejado:', err);
  return res.status(500).json({
    error: 'Internal upload error',
    message: 'Error interno procesando el archivo'
  });
};

// Función utilitaria para limpiar archivos huérfanos
export const cleanupTempFiles = async (files) => {
  if (!files) return;
  
  const filesToDelete = Array.isArray(files) ? files : [files];
  
  for (const file of filesToDelete) {
    try {
      const filePath = file.path || file.destination + file.filename;
      await fs.unlink(filePath);
      console.log(`🗑️ Archivo temporal eliminado: ${filePath}`);
    } catch (error) {
      console.error(`❌ Error eliminando archivo temporal: ${error.message}`);
    }
  }
};

// Exportar configuraciones para uso directo
export { UPLOAD_CONFIG, validateTotalSize };

export default {
  upload,
  uploadImage,
  uploadLogo,
  uploadCover,
  uploadGallery,
  handleMulterError,
  cleanupTempFiles,
  UPLOAD_CONFIG
};