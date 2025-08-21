import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Función para generar configuración de storage
const createCloudinaryStorage = (folder, transformation = {}) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: `misitiofacil/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: transformation,
      public_id: (req, file) => {
        const timestamp = Date.now();
        const originalName = file.originalname.split('.')[0];
        return `${originalName}-${timestamp}`;
      }
    }
  });
};

// Configuraciones específicas de storage
const logoStorage = createCloudinaryStorage('logos', {
  width: 300,
  height: 300,
  crop: 'fit',
  quality: 'auto'
});

const coverStorage = createCloudinaryStorage('covers', {
  width: 1200,
  height: 600,
  crop: 'fill',
  quality: 'auto'
});

const galleryStorage = createCloudinaryStorage('gallery', {
  width: 800,
  height: 600,
  crop: 'fit',
  quality: 'auto'
});

const profileStorage = createCloudinaryStorage('profiles', {
  width: 200,
  height: 200,
  crop: 'fill',
  quality: 'auto',
  gravity: 'face'
});

// Configuraciones de upload con Cloudinary
export const cloudinaryUploadLogo = multer({
  storage: logoStorage,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB
    files: 1
  }
});

export const cloudinaryUploadCover = multer({
  storage: coverStorage,
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB
    files: 1
  }
});

export const cloudinaryUploadGallery = multer({
  storage: galleryStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 10
  }
});

export const cloudinaryUploadProfile = multer({
  storage: profileStorage,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1MB
    files: 1
  }
});

// Función para eliminar imagen de Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result === 'ok') {
      console.log(`✅ Imagen eliminada de Cloudinary: ${publicId}`);
      return true;
    } else {
      console.warn(`⚠️ No se pudo eliminar de Cloudinary: ${publicId}`, result);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error eliminando de Cloudinary: ${publicId}`, error);
    return false;
  }
};

// Función para optimizar URL de imagen
export const optimizeImageUrl = (url, options = {}) => {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const {
    width,
    height,
    quality = 'auto',
    format = 'auto',
    crop = 'fit'
  } = options;

  let transformation = `q_${quality},f_${format}`;
  
  if (width && height) {
    transformation += `,w_${width},h_${height},c_${crop}`;
  } else if (width) {
    transformation += `,w_${width}`;
  } else if (height) {
    transformation += `,h_${height}`;
  }

  // Insertar transformación en la URL
  return url.replace('/upload/', `/upload/${transformation}/`);
};

// Función para obtener información de la imagen
export const getImageInfo = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId);
    return {
      publicId: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.bytes,
      createdAt: result.created_at
    };
  } catch (error) {
    console.error(`❌ Error obteniendo info de imagen: ${publicId}`, error);
    return null;
  }
};

// Middleware para procesar respuesta de Cloudinary
export const processCloudinaryResponse = (req, res, next) => {
  if (req.file && req.file.path) {
    req.uploadedImage = {
      url: req.file.path,
      publicId: req.file.filename,
      originalName: req.file.originalname
    };
  } else if (req.files && req.files.length > 0) {
    req.uploadedImages = req.files.map(file => ({
      url: file.path,
      publicId: file.filename,
      originalName: file.originalname
    }));
  }
  next();
};

// Verificar si Cloudinary está configurado
export const isCloudinaryConfigured = () => {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

// Función para migrar imagen local a Cloudinary
export const migrateToCloudinary = async (localImagePath, folder = 'migrated') => {
  try {
    const result = await cloudinary.uploader.upload(localImagePath, {
      folder: `misitiofacil/${folder}`,
      transformation: {
        quality: 'auto',
        fetch_format: 'auto'
      }
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('❌ Error migrando a Cloudinary:', error);
    throw error;
  }
};

export { cloudinary };

export default {
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
};