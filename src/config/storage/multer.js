// src/config/storage/multer.js
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const isProd = process.env.NODE_ENV === 'production';
const storageType = (process.env.STORAGE_TYPE || '').toLowerCase(); // 'cloudinary' | 'local' | ''
const useMemory = isProd || storageType === 'cloudinary';           // Vercel: true

// ---------------------------------------------
// Config de tipos y límites
// ---------------------------------------------
export const UPLOAD_CONFIG = {
  images: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
    maxSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE) || 2 * 1024 * 1024, // 2MB
    maxFiles: parseInt(process.env.UPLOAD_MAX_FILES) || 5
  },
  logos: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maxSize: 1 * 1024 * 1024, // 1MB
    maxFiles: 1
  },
  covers: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 3 * 1024 * 1024, // 3MB
    maxFiles: 1
  },
  gallery: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
    maxFiles: 10
  }
};

// ---------------------------------------------
// Paths y utilidades
// ---------------------------------------------
const baseUploadPath = process.env.UPLOAD_PATH || 'uploads';

const getDestinationPath = (fieldname) => {
  switch ((fieldname || '').toLowerCase()) {
    case 'logo': return `${baseUploadPath}/logos/`;
    case 'cover':
    case 'portada': return `${baseUploadPath}/covers/`;
    case 'gallery':
    case 'galeria': return `${baseUploadPath}/gallery/`;
    case 'avatar':
    case 'profile': return `${baseUploadPath}/profiles/`;
    default: return `${baseUploadPath}/general/`;
  }
};

const ensureDir = async (dir) => {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
    console.log(`📁 Carpeta creada: ${dir}`);
  }
};

const sanitizeName = (name = '') =>
  name.replace(/[^a-zA-Z0-9.\-_]/g, '_').substring(0, 120);

const generateFilename = (file) => {
  const ext = path.extname(file.originalname || '').toLowerCase() || '';
  return `${file.fieldname || 'file'}-${Date.now()}-${uuidv4()}${ext}`;
};

// ---------------------------------------------
// FileFilter con validación + metadata
// - Valida mimetype por "type" (images, logos, ...)
// - Precalcula filename y path; llena req.uploadedFiles
// ---------------------------------------------
const createFileFilter = (type = 'images') => {
  const cfg = UPLOAD_CONFIG[type];
  if (!cfg) throw new Error(`Tipo de configuración no válido: ${type}`);

  return (req, file, cb) => {
    // 1) Validación de mimetype
    if (!cfg.mimeTypes.includes(file.mimetype)) {
      const allowed = cfg.mimeTypes.join(', ');
      return cb(new Error(`Tipo de archivo no válido para ${type}. Permitidos: ${allowed}`), false);
    }

    // 2) Metadata consistente (para disk y memory)
    const uploadDir = getDestinationPath(file.fieldname);
    const filename = generateFilename(file);

    // Guardar en propiedades internas para que storage las reutilice
    file.__generatedFilename = filename;
    file.__uploadDir = uploadDir;

    // Exponer metadata "tipo legacy" para tu código
    if (!req.uploadedFiles) req.uploadedFiles = [];
    req.uploadedFiles.push({
      fieldname: file.fieldname,
      originalname: file.originalname,
      filename,
      path: useMemory ? null : uploadDir + filename, // en memory no hay path en disco
      mimetype: file.mimetype,
      inMemory: useMemory
    });

    cb(null, true);
  };
};

// ---------------------------------------------
// Storages
// - En prod/cloudinary: memoryStorage
// - En dev/local: diskStorage (asegura directorios)
// ---------------------------------------------
const memoryStorage = multer.memoryStorage();

const diskStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const dest = file.__uploadDir || getDestinationPath(file.fieldname);
      await ensureDir(dest);
      cb(null, dest);
    } catch (err) {
      console.error('❌ Error creando directorio de upload:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    try {
      const name = sanitizeName(file.__generatedFilename || generateFilename(file));
      // Actualiza también el objeto en req.uploadedFiles si existe
      if (req.uploadedFiles && Array.isArray(req.uploadedFiles)) {
        const meta = req.uploadedFiles.find(
          (m) => m.originalname === file.originalname && m.fieldname === file.fieldname
        );
        if (meta) {
          meta.filename = name;
          meta.path = (file.__uploadDir || getDestinationPath(file.fieldname)) + name;
        }
      }
      cb(null, name);
    } catch (err) {
      console.error('❌ Error generando nombre de archivo:', err);
      cb(err);
    }
  }
});

// El storage efectivo según entorno
const storage = useMemory ? memoryStorage : diskStorage;

// ---------------------------------------------
// Factory de uploaders por tipo
// ---------------------------------------------
const createUploader = (type) => {
  const cfg = UPLOAD_CONFIG[type];
  return multer({
    storage,
    fileFilter: createFileFilter(type),
    limits: {
      fileSize: cfg.maxSize,
      files: cfg.maxFiles
    }
  });
};

// Exporta instancias compatibles con tu código anterior
export const uploadImage = createUploader('images');
export const uploadLogo = createUploader('logos');
export const uploadCover = createUploader('covers');
export const uploadGallery = createUploader('gallery');

// Backward compatibility
export const upload = uploadImage;

// ---------------------------------------------
// Middleware: validar tamaño total (cuando uses array())
// ---------------------------------------------
export const validateTotalSize = (maxTotalSize) => {
  return (req, res, next) => {
    // Soporta tanto req.files (array) como req.files[field]
    const files = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files || {}).flat();

    if (files?.length) {
      const total = files.reduce((sum, f) => sum + (f.size || 0), 0);
      if (total > maxTotalSize) {
        return res.status(400).json({
          error: 'Total file size exceeded',
          message: `El tamaño total de archivos excede ${Math.round(maxTotalSize / (1024 * 1024))}MB`
        });
      }
    }
    next();
  };
};

// ---------------------------------------------
// Errores de Multer
// ---------------------------------------------
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: 'El archivo excede el tamaño máximo permitido'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Demasiados archivos subidos'
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

  if (err?.message?.includes?.('Tipo de archivo no válido')) {
    return res.status(400).json({ error: 'Invalid file type', message: err.message });
  }

  console.error('❌ Error de upload no manejado:', err);
  return res.status(500).json({
    error: 'Internal upload error',
    message: 'Error interno procesando el archivo'
  });
};

// ---------------------------------------------
// Limpieza de temporales (solo dev/disk)
// ---------------------------------------------
export const cleanupTempFiles = async (files) => {
  if (!files) return;

  const arr = Array.isArray(files)
    ? files
    : Object.values(files).flat();

  for (const file of arr) {
    try {
      // En memoryStorage no hay path que borrar
      if (!file?.path) continue;
      await fs.unlink(file.path);
      console.log(`🗑️ Archivo temporal eliminado: ${file.path}`);
    } catch (error) {
      console.error(`❌ Error eliminando archivo temporal: ${error.message}`);
    }
  }
};

// ---------------------------------------------
// Export default (comodidad)
// ---------------------------------------------
export default {
  upload,
  uploadImage,
  uploadLogo,
  uploadCover,
  uploadGallery,
  validateTotalSize,
  handleMulterError,
  cleanupTempFiles,
  UPLOAD_CONFIG
};
