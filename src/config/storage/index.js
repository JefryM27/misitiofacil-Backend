import multerConfig from './multer.js';
import cloudinaryConfig from './cloudinary.js';

// Exportar configuraciones de Multer
export const {
  upload,
  uploadImage,
  uploadLogo,
  uploadCover,
  uploadGallery,
  handleMulterError,
  cleanupTempFiles,
  UPLOAD_CONFIG,
  validateTotalSize
} = multerConfig;

// Exportar configuraciones de Cloudinary
export const {
  cloudinaryUploadLogo,
  cloudinaryUploadCover,
  cloudinaryUploadGallery,
  cloudinaryUploadProfile,
  deleteFromCloudinary,
  optimizeImageUrl,
  getImageInfo,
  processCloudinaryResponse,
  isCloudinaryConfigured,
  migrateToCloudinary,
  cloudinary
} = cloudinaryConfig;

// Función para decidir qué storage usar
export const getStorageConfig = (type = 'local') => {
  if (type === 'cloudinary' && isCloudinaryConfigured()) {
    return {
      type: 'cloudinary',
      logo: cloudinaryUploadLogo,
      cover: cloudinaryUploadCover,
      gallery: cloudinaryUploadGallery,
      profile: cloudinaryUploadProfile
    };
  }
  
  return {
    type: 'local',
    logo: uploadLogo,
    cover: uploadCover,
    gallery: uploadGallery,
    image: uploadImage,
    general: upload
  };
};

// Middleware inteligente que usa el storage configurado
export const smartUpload = (field, type = 'image') => {
  const storageType = process.env.STORAGE_TYPE || 'local';
  const config = getStorageConfig(storageType);
  
  switch (type) {
    case 'logo':
      return config.logo;
    case 'cover':
      return config.cover;
    case 'gallery':
      return config.gallery;
    case 'profile':
      return config.profile;
    default:
      return config.image || config.general;
  }
};

// Función para limpiar archivos según el tipo de storage
export const cleanupFiles = async (files, storageType = 'local') => {
  if (storageType === 'local') {
    return cleanupTempFiles(files);
  } else if (storageType === 'cloudinary' && files) {
    const filesToDelete = Array.isArray(files) ? files : [files];
    const promises = filesToDelete.map(file => {
      const publicId = file.filename || file.publicId;
      return deleteFromCloudinary(publicId);
    });
    return Promise.all(promises);
  }
};

// Función para obtener URL optimizada según el storage
export const getOptimizedUrl = (file, options = {}) => {
  if (!file) return null;
  
  const storageType = process.env.STORAGE_TYPE || 'local';
  
  if (storageType === 'cloudinary' && file.url) {
    return optimizeImageUrl(file.url, options);
  }
  
  // Para storage local, retornar URL base
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  return `${baseUrl}/${file.path || file.filename}`;
};

export default {
  // Multer configs
  upload,
  uploadImage,
  uploadLogo,
  uploadCover,
  uploadGallery,
  handleMulterError,
  cleanupTempFiles,
  UPLOAD_CONFIG,
  
  // Cloudinary configs
  cloudinaryUploadLogo,
  cloudinaryUploadCover,
  cloudinaryUploadGallery,
  deleteFromCloudinary,
  optimizeImageUrl,
  isCloudinaryConfigured,
  
  // Smart configs
  smartUpload,
  getStorageConfig,
  cleanupFiles,
  getOptimizedUrl
};