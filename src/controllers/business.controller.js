// src/controllers/businessController.js - Adaptado para Vercel
import Business from '../models/business.js';
import Template from '../models/template.js';
import Service from '../models/service.js';
import User from '../models/user.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ConflictError,
  throwIfNotFound,
  throwIf
} from '../middleware/errorHandler.js';
import { constants, logger } from '../config/index.js';
import { deleteFromCloudinary, optimizeImageUrl } from '../config/storage/cloudinary.js';
import mongoose from 'mongoose';

// ✅ DETECCIÓN DE VERCEL
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.VERCEL_URL;

const { 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES, 
  APP_LIMITS, 
  BUSINESS_STATUS, 
  BUSINESS_TYPES,
  VALIDATION_PATTERNS 
} = constants;

// ============== HELPER PARA PROCESAR ARCHIVOS ==============
const processUploadedFile = (file) => {
  if (!file) return null;

  // ✅ En Vercel, los archivos están en memoria (buffer)
  if (isVercel || file.buffer) {
    return {
      url: null, // Se llenará después de subir a Cloudinary
      filename: file.filename || `${Date.now()}-${file.originalname}`,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer, // ✅ Buffer para Cloudinary
      needsCloudinaryUpload: true,
      isVercel: true
    };
  }

  // ✅ En desarrollo local (disk storage)
  return {
    url: file.path || `/uploads/${file.filename}`,
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
    needsCloudinaryUpload: false,
    isVercel: false
  };
};

// ✅ HELPER PARA SUBIR A CLOUDINARY (cuando esté configurado)
const uploadToCloudinary = async (fileData) => {
  if (!fileData.needsCloudinaryUpload) {
    return fileData.url; // Ya está en disco local
  }

  // TODO: Implementar upload real a Cloudinary
  // Por ahora, simular URL para testing
  if (process.env.CLOUDINARY_URL) {
    // Aquí iría la lógica real de Cloudinary
    console.log('🔄 Uploading to Cloudinary:', fileData.filename);
    // const result = await cloudinary.uploader.upload_stream(...)
    // return result.secure_url;
    
    // TEMPORAL: Simular URL de Cloudinary
    return `https://res.cloudinary.com/temp/${fileData.filename}`;
  } else {
    console.warn('⚠️ CLOUDINARY_URL not configured, using temporary URL');
    return `https://temp-storage.misitofacil.com/${fileData.filename}`;
  }
};

// ============== CREAR NEGOCIO ==============
export const createBusiness = asyncHandler(async (req, res) => {
  const { 
    name, 
    description, 
    category,
    phone, 
    email,
    templateId,
    location = {},
    socialMedia = {},
    operatingHours,
    settings = {}
  } = req.body;

  // ===== Basic validations =====
  throwIf(!name?.trim(), 'El nombre del negocio es requerido');
  throwIf(!category, 'La categoría del negocio es requerida');
  throwIf(req.user.role !== 'owner', 'Solo los owners pueden crear negocios');

  const existingBusiness = await Business.findOne({ owner: req.user.id });
  throwIf(existingBusiness, 'Ya tienes un negocio registrado');

  throwIf(
    !Object.values(BUSINESS_TYPES).includes(category),
    `Categoría inválida. Debe ser: ${Object.values(BUSINESS_TYPES).join(', ')}`
  );

  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }
  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  // ============== TEMPLATE RESOLUTION ==============
  let finalTemplateId = null;

  console.log(`[BUSINESS][${isVercel ? 'VERCEL' : 'LOCAL'}] Creating business with templateId:`, templateId);

  if (templateId) {
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      throw new ValidationError('templateId inválido');
    }

    const template = await Template.findById(templateId);
    if (!template) {
      console.warn('[BUSINESS] Template not found, using default');
      const auto = await Template.findOne({ isActive: true, isPublic: true })
        .sort({ isDefault: -1, 'usage.rating': -1 });
      throwIfNotFound(auto, 'No hay templates disponibles');
      finalTemplateId = auto._id;
      await auto.markAsUsed();
    } else {
      throwIf(!template.isActive, 'Template no activo');
      
      const isOwner = template.owner?.toString() === req.user.id;
      const isPublic = template.isPublic === true;
      const isDefault = template.isDefault === true;
      const isAdmin = req.user?.role === (constants.USER_ROLES?.ADMIN || 'admin');

      if (isPublic || isOwner || isDefault || isAdmin) {
        finalTemplateId = template._id;
        await template.markAsUsed();
      } else {
        const auto = await Template.findOne({ isActive: true, isPublic: true })
          .sort({ isDefault: -1, 'usage.rating': -1 });
        throwIfNotFound(auto, 'No hay templates públicos disponibles');
        finalTemplateId = auto._id;
        await auto.markAsUsed();
      }
    }
  } else {
    const auto = await Template.findOne({ isActive: true, isPublic: true })
      .sort({ isDefault: -1, 'usage.rating': -1 });
    throwIfNotFound(auto, 'No hay templates disponibles');
    finalTemplateId = auto._id;
    await auto.markAsUsed();
  }

  // ============== BUSINESS CREATION ==============
  const businessData = {
    ownerId: req.user.id,
    owner: req.user.id,
    templateId: finalTemplateId,
    name: name.trim(),
    description: description?.trim() || '',
    category,
    phone: phone?.trim(),
    email: email?.toLowerCase().trim(),

    location: {
      address: location.address?.trim(),
      city: location.city?.trim(),
      province: location.province?.trim(),
      country: location.country || 'CR',
      ...(location.coordinates && {
        coordinates: {
          lat: parseFloat(location.coordinates.lat),
          lng: parseFloat(location.coordinates.lng)
        }
      })
    },

    socialMedia: {
      facebook: socialMedia.facebook?.trim() || '',
      instagram: socialMedia.instagram?.trim() || '',
      whatsapp: socialMedia.whatsapp?.trim() || '',
      website: socialMedia.website?.trim() || '',
      tiktok: socialMedia.tiktok?.trim() || '',
      twitter: socialMedia.twitter?.trim() || ''
    },

    settings: {
      allowOnlineBooking: settings.allowOnlineBooking !== false,
      requireBookingApproval: settings.requireBookingApproval || false,
      showPrices: settings.showPrices !== false,
      currency: settings.currency || 'CRC',
      ...settings
    },

    status: BUSINESS_STATUS.DRAFT
  };

  businessData.operatingHours = operatingHours || {
    monday:    { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    tuesday:   { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    wednesday: { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    thursday:  { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    friday:    { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    saturday:  { isOpen: true,  openTime: '09:00', closeTime: '16:00' },
    sunday:    { isOpen: false }
  };

  try {
    const business = new Business(businessData);
    await business.save();

    await User.findByIdAndUpdate(req.user.id, { business: business._id });

    logger.info('Negocio creado exitosamente', { 
      businessId: business._id, 
      ownerId: req.user.id,
      businessName: business.name,
      category: business.category,
      templateId: finalTemplateId,
      platform: isVercel ? 'vercel' : 'local',
      ip: req.ip 
    });

    res.status(201).json({
      success: true,
      message: SUCCESS_MESSAGES.BUSINESS_CREATED || 'Negocio creado exitosamente',
      data: {
        business: {
          id: business._id,
          name: business.name,
          slug: business.slug,
          category: business.category,
          status: business.status,
          templateId: finalTemplateId
        }
      }
    });

  } catch (error) {
    console.error('Error al crear negocio:', error);

    if (error.code === 121) {
      throw new ValidationError('Error de validación en la base de datos', {
        mongoError: error.errmsg,
        details: error.errInfo?.details,
        code: error.code
      });
    }

    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      }));
      throw new ValidationError('Error de validación de Mongoose', validationErrors);
    }

    if (error.code === 11000) {
      throw new ValidationError('Ya existe un negocio con estos datos', {
        duplicateField: Object.keys(error.keyPattern)[0],
        duplicateValue: Object.values(error.keyValue)[0]
      });
    }

    throw error;
  }
});

// ============== OBTENER MI NEGOCIO ==============
export const getMyBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id })
    .populate('owner', 'fullName email')
    .populate({
      path: 'services',
      select: 'name description price duration isActive sortOrder',
      options: { sort: { sortOrder: 1, createdAt: -1 } }
    })
    .populate('templateId', 'name category previewUrl sections')
    .lean();

  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  // Normalizaciones defensivas
  business.services = Array.isArray(business.services) ? business.services : [];
  business.gallery = Array.isArray(business.gallery) ? business.gallery : [];
  business.operatingHours = business.operatingHours || {};
  business.socialMedia = business.socialMedia || {};
  business.location = business.location || {};
  if (business.templateId && !Array.isArray(business.templateId.sections)) {
    business.templateId.sections = [];
  }

  // Actualización ligera de stats
  try {
    await Business.updateOne({ _id: business._id }, { $set: { 'stats.lastAccessAt': new Date() } });
  } catch (_) {}

  res.json({ success: true, data: { business } });
});

// ============== OBTENER NEGOCIO POR ID ==============
export const getBusinessById = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  const business = await Business.findById(businessId)
    .populate('owner', 'fullName')
    .populate('services', 'name description price duration isActive sortOrder')
    .populate('templateId', 'name category');

  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  if (req.user?.id !== business.owner._id.toString() && business.status !== BUSINESS_STATUS.ACTIVE) {
    throw new NotFoundError('Negocio no encontrado');
  }

  if (req.user?.id !== business.owner._id.toString()) {
    await Business.findByIdAndUpdate(businessId, { $inc: { 'stats.views': 1 } });
  }

  res.json({
    success: true,
    data: {
      business: business.toJSON()
    }
  });
});

// ============== OBTENER NEGOCIO POR SLUG ==============
export const getBusinessBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const business = await Business.findOne({ slug })
    .populate('owner', 'fullName')
    .populate('services', 'name description price duration isActive sortOrder')
    .populate('templateId', 'name category');

  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');
  throwIf(business.status !== BUSINESS_STATUS.ACTIVE, 'Negocio no disponible');

  await Business.findByIdAndUpdate(business._id, { $inc: { 'stats.views': 1 } });

  res.json({
    success: true,
    data: {
      business: business.toJSON()
    }
  });
});

// ============== LISTAR NEGOCIOS PÚBLICOS ==============
export const listPublicBusinesses = asyncHandler(async (req, res) => {
  const {
    category,
    city,
    province,
    featured,
    search,
    sortBy = 'rating'
  } = req.query;

  const filters = { status: BUSINESS_STATUS.ACTIVE };
  
  if (category) filters.category = category;
  if (city) filters['location.city'] = new RegExp(city, 'i');
  if (province) filters['location.province'] = new RegExp(province, 'i');
  if (featured === 'true') filters.featured = true;

  if (search) {
    filters.$text = { $search: search };
  }

  let sortOptions = {};
  switch (sortBy) {
    case 'rating':
      sortOptions = { 'stats.rating': -1, featured: -1 };
      break;
    case 'newest':
      sortOptions = { createdAt: -1 };
      break;
    case 'popular':
      sortOptions = { 'stats.views': -1, 'stats.rating': -1 };
      break;
    case 'name':
      sortOptions = { name: 1 };
      break;
    default:
      sortOptions = { 'stats.rating': -1, featured: -1 };
  }

  const businesses = await req.applyPagination(
    Business.find(filters)
      .populate('owner', 'fullName')
      .select('name description category location logo stats featured slug createdAt')
      .sort(sortOptions)
  );

  const total = await Business.countDocuments(filters);
  const response = req.createPaginatedResponse(businesses, total);

  res.json(response);
});

// ============== ACTUALIZAR NEGOCIO ==============
export const updateBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  const {
    name,
    description,
    phone,
    email,
    location,
    socialMedia,
    operatingHours,
    settings,
    visualConfig
  } = req.body;

  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  if (name) business.name = name.trim();
  if (description !== undefined) business.description = description.trim();
  if (phone !== undefined) business.phone = phone?.trim();
  if (email !== undefined) business.email = email?.toLowerCase().trim();

  if (location) {
    business.location = {
      ...business.location,
      ...location,
      address: location.address?.trim(),
      city: location.city?.trim(),
      province: location.province?.trim()
    };
  }

  if (socialMedia) {
    business.socialMedia = {
      ...business.socialMedia,
      ...socialMedia
    };
  }

  if (operatingHours) {
    business.operatingHours = {
      ...business.operatingHours,
      ...operatingHours
    };
  }

  if (settings) {
    business.settings = {
      ...business.settings,
      ...settings
    };
  }

  if (visualConfig) {
    business.visualConfig = {
      ...business.visualConfig,
      ...visualConfig
    };
  }

  await business.save();

  logger.info('Negocio actualizado', { 
    businessId: business._id, 
    ownerId: req.user.id,
    changes: Object.keys(req.body),
    platform: isVercel ? 'vercel' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Negocio actualizado exitosamente',
    data: {
      business: business.toJSON()
    }
  });
});

// ============== SUBIR LOGO - ADAPTADO PARA VERCEL ==============
export const uploadLogo = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');
  throwIf(!req.file, 'No se proporcionó archivo de logo');

  // ✅ Procesar archivo según el entorno
  const fileData = processUploadedFile(req.file);
  
  // ✅ Subir a Cloudinary si es necesario
  if (fileData.needsCloudinaryUpload) {
    fileData.url = await uploadToCloudinary(fileData);
    console.log(`📦 Logo uploaded (${isVercel ? 'Vercel' : 'Local'}):`, fileData.filename);
  }

  // Eliminar logo anterior si existe
  if (business.logo && business.logo.filename) {
    await deleteFromCloudinary(business.logo.filename);
  }

  business.logo = {
    url: fileData.url,
    filename: fileData.filename,
    uploadedAt: new Date()
  };

  await business.save();

  logger.info('Logo subido', { 
    businessId: business._id, 
    ownerId: req.user.id,
    filename: fileData.filename,
    platform: isVercel ? 'vercel' : 'local',
    storageType: fileData.needsCloudinaryUpload ? 'cloudinary' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Logo subido exitosamente',
    data: { logo: business.logo }
  });
});

// ============== SUBIR IMAGEN DE PORTADA - ADAPTADO ==============
export const uploadCoverImage = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');
  throwIf(!req.file, 'No se proporcionó archivo de imagen');

  const fileData = processUploadedFile(req.file);
  
  if (fileData.needsCloudinaryUpload) {
    fileData.url = await uploadToCloudinary(fileData);
    console.log(`📦 Cover uploaded (${isVercel ? 'Vercel' : 'Local'}):`, fileData.filename);
  }

  if (business.coverImage && business.coverImage.filename) {
    await deleteFromCloudinary(business.coverImage.filename);
  }

  business.coverImage = {
    url: fileData.url,
    filename: fileData.filename,
    uploadedAt: new Date()
  };

  await business.save();

  logger.info('Imagen de portada subida', { 
    businessId: business._id, 
    ownerId: req.user.id,
    filename: fileData.filename,
    platform: isVercel ? 'vercel' : 'local',
    storageType: fileData.needsCloudinaryUpload ? 'cloudinary' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Imagen de portada subida exitosamente',
    data: { coverImage: business.coverImage }
  });
});

// ============== SUBIR IMÁGENES A GALERÍA - ADAPTADO ==============
export const uploadGalleryImages = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');
  throwIf(!req.files || req.files.length === 0, 'No se proporcionaron archivos');
  throwIf(
    business.gallery.length + req.files.length > APP_LIMITS.MAX_GALLERY_IMAGES,
    `Máximo ${APP_LIMITS.MAX_GALLERY_IMAGES} imágenes permitidas en la galería`
  );

  // ✅ Procesar todos los archivos
  const newImages = await Promise.all(
    req.files.map(async (file) => {
      const fileData = processUploadedFile(file);
      
      if (fileData.needsCloudinaryUpload) {
        fileData.url = await uploadToCloudinary(fileData);
        console.log(`📦 Gallery image uploaded (${isVercel ? 'Vercel' : 'Local'}):`, fileData.filename);
      }

      return {
        url: fileData.url,
        filename: fileData.filename,
        caption: '',
        uploadedAt: new Date()
      };
    })
  );

  business.gallery.push(...newImages);
  await business.save();

  logger.info('Imágenes de galería subidas', { 
    businessId: business._id, 
    ownerId: req.user.id,
    count: req.files.length,
    platform: isVercel ? 'vercel' : 'local',
    storageType: newImages[0]?.filename ? 'cloudinary' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: `${req.files.length} imágenes subidas exitosamente`,
    data: {
      gallery: business.gallery,
      newImages
    }
  });
});

// ============== ELIMINAR IMAGEN DE GALERÍA ==============
export const deleteGalleryImage = asyncHandler(async (req, res) => {
  const { imageId } = req.params;
  
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  const image = business.gallery.id(imageId);
  throwIfNotFound(image, 'Imagen no encontrada');

  if (image.filename) {
    await deleteFromCloudinary(image.filename);
  }

  business.gallery.pull(imageId);
  await business.save();

  logger.info('Imagen de galería eliminada', { 
    businessId: business._id, 
    ownerId: req.user.id,
    imageId,
    platform: isVercel ? 'vercel' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Imagen eliminada exitosamente'
  });
});

// ============== CAMBIAR ESTADO DEL NEGOCIO ==============
export const changeBusinessStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  throwIf(
    !Object.values(BUSINESS_STATUS).includes(status),
    `Estado inválido. Debe ser: ${Object.values(BUSINESS_STATUS).join(', ')}`
  );

  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  if (status === BUSINESS_STATUS.ACTIVE) {
    throwIf(!business.name, 'El negocio debe tener nombre para activarse');
    throwIf(!business.category, 'El negocio debe tener categoría para activarse');
  }

  const oldStatus = business.status;
  business.status = status;

  if (status === BUSINESS_STATUS.ACTIVE && !business.publishedAt) {
    business.publishedAt = new Date();
  }

  await business.save();

  logger.info('Estado de negocio cambiado', { 
    businessId: business._id, 
    ownerId: req.user.id,
    oldStatus,
    newStatus: status,
    platform: isVercel ? 'vercel' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: `Negocio ${status === BUSINESS_STATUS.ACTIVE ? 'publicado' : 'despublicado'} exitosamente`,
    data: {
      business: {
        id: business._id,
        status: business.status,
        publishedAt: business.publishedAt
      }
    }
  });
});

// ============== ELIMINAR NEGOCIO ==============
export const deleteBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  const imagesToDelete = [];
  if (business.logo?.filename) imagesToDelete.push(business.logo.filename);
  if (business.coverImage?.filename) imagesToDelete.push(business.coverImage.filename);
  business.gallery.forEach(img => {
    if (img.filename) imagesToDelete.push(img.filename);
  });

  await Promise.allSettled(
    imagesToDelete.map(filename => deleteFromCloudinary(filename))
  );

  await Service.deleteMany({ business: business._id });
  await business.deleteOne();
  await User.findByIdAndUpdate(req.user.id, { $unset: { business: 1 } });

  logger.info('Negocio eliminado', { 
    businessId: business._id, 
    ownerId: req.user.id,
    businessName: business.name,
    platform: isVercel ? 'vercel' : 'local',
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Negocio eliminado exitosamente'
  });
});

// ============== EXPORTACIONES ==============
export default {
  createBusiness,
  getMyBusiness,
  getBusinessById,
  getBusinessBySlug,
  listPublicBusinesses,
  updateBusiness,
  uploadLogo,
  uploadCoverImage,
  uploadGalleryImages,
  deleteGalleryImage,
  changeBusinessStatus,
  deleteBusiness
};