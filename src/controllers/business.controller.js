// src/controllers/businessController.js
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

const { 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES, 
  APP_LIMITS, 
  BUSINESS_STATUS, 
  BUSINESS_TYPES,
  VALIDATION_PATTERNS 
} = constants;

// ============== CREAR NEGOCIO ==============
export const createBusiness = asyncHandler(async (req, res) => {
  const { 
    name, 
    description, 
    category,
    phone, 
    email,
    templateId, // Optional - user provided
    location = {},
    socialMedia = {},
    operatingHours,
    settings = {}
  } = req.body;

  // ===== Basic validations =====
  throwIf(!name?.trim(), 'El nombre del negocio es requerido');
  throwIf(!category, 'La categoría del negocio es requerida');

  // Only owners can create businesses
  throwIf(req.user.role !== 'owner', 'Solo los owners pueden crear negocios');

  // One business per owner (adjust if you allow multiple)
  const existingBusiness = await Business.findOne({ owner: req.user.id });
  throwIf(existingBusiness, 'Ya tienes un negocio registrado');

  // Category validation
  throwIf(
    !Object.values(BUSINESS_TYPES).includes(category),
    `Categoría inválida. Debe ser: ${Object.values(BUSINESS_TYPES).join(', ')}`
  );

  // Email/phone validation
  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }
  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  // ============== TEMPLATE RESOLUTION (reinforced) ==============
  let finalTemplateId = null;

  // ---- Debug: where are we connected and what id arrived?
  console.log('[BUSINESS][DBG] userId     =', req.user?.id);
  console.log('[BUSINESS][DBG] db/host    =', mongoose.connection?.name, '/', mongoose.connection?.host);
  console.log('[BUSINESS][DBG] templateId =', templateId);

  if (templateId) {
    // 1) Guard: ensure ObjectId format
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      throw new ValidationError('templateId inválido');
    }

    // 2) Extra diagnosis: does this _id exist in THIS database/collection?
    const exists = await Template.exists({ _id: templateId });
    console.log('[BUSINESS][DBG] Template.exists? ->', Boolean(exists));

    // 3) Try to load the template
    let template = null;
    if (exists) {
      template = await Template.findById(templateId);
    }

    // 4) If not found in current DB, fallback to public/default template
    if (!template) {
      console.warn('[BUSINESS][WARN] Template not found by _id in current DB. Using public/default fallback.');
      const auto = await Template.findOne({ isActive: true, isPublic: true })
        .sort({ isDefault: -1, 'usage.rating': -1, 'usage.timesUsed': -1 });
      throwIfNotFound(auto, 'No hay templates disponibles. Revisa la conexión a la base de datos o crea un template primero.');
      finalTemplateId = auto._id;
      await auto.markAsUsed();
    } else {
      // 5) Validate status & permissions
      throwIf(!template.isActive, 'Template no activo');

      const isOwner   = template.owner?.toString() === req.user.id;
      const isPublic  = template.isPublic === true;
      const isDefault = template.isDefault === true;
      const isAdmin   = req.user?.role === (constants.USER_ROLES?.ADMIN || 'admin');

      if (isPublic || isOwner || isDefault || isAdmin) {
        finalTemplateId = template._id;
        await template.markAsUsed();
      } else {
        const auto = await Template.findOne({ isActive: true, isPublic: true })
          .sort({ isDefault: -1, 'usage.rating': -1, 'usage.timesUsed': -1 });
        throwIfNotFound(auto, 'No hay templates públicos disponibles.');
        finalTemplateId = auto._id;
        await auto.markAsUsed();
      }
    }
  } else {
    // No template provided -> choose a public/default template
    const auto = await Template.findOne({ isActive: true, isPublic: true })
      .sort({ isDefault: -1, 'usage.rating': -1, 'usage.timesUsed': -1 });
    throwIfNotFound(auto, 'No hay templates disponibles. Crea un template primero.');
    finalTemplateId = auto._id;
    await auto.markAsUsed();
  }

  // ============== BUSINESS CREATION ==============
  const businessData = {
    // --- Required by schema ---
    ownerId: req.user.id,        // Atlas mirror
    owner: req.user.id,          // Mongoose ref
    templateId: finalTemplateId, // Resolved template
    name: name.trim(),

    // --- Optional fields ---
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

  // Default operating hours (if none provided)
  businessData.operatingHours = operatingHours || {
    monday:    { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    tuesday:   { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    wednesday: { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    thursday:  { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    friday:    { isOpen: true,  openTime: '09:00', closeTime: '18:00' },
    saturday:  { isOpen: true,  openTime: '09:00', closeTime: '16:00' },
    sunday:    { isOpen: false }
  };

  // Debug: payload to be saved
  console.log('[BUSINESS][DBG] businessData:', JSON.stringify({
    ...businessData,
    templateId: businessData.templateId?.toString()
  }, null, 2));

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
    console.error('Error code:', error.code);
    console.error('Error message:', error.errmsg || error.message);

    if (error.code === 121) {
      // MongoDB JSON Schema validation error
      console.error('=== MONGODB VALIDATION ERROR (121) ===');
      console.error('errInfo completo:', JSON.stringify(error.errInfo, null, 2));
      throw new ValidationError('Error de validación en la base de datos', {
        mongoError: error.errmsg,
        details: error.errInfo?.details,
        code: error.code
      });
    }

    if (error.name === 'ValidationError') {
      // Mongoose validation error
      console.error('=== MONGOOSE VALIDATION ERROR ===');
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value
      }));
      console.error('Validation errors:', validationErrors);
      throw new ValidationError('Error de validación de Mongoose', validationErrors);
    }

    if (error.code === 11000) {
      // Duplicate key error
      console.error('=== DUPLICATE KEY ERROR ===');
      console.error('keyPattern:', error.keyPattern);
      console.error('keyValue:', error.keyValue);
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
      options: { sort: { sortOrder: 1, createdAt: -1 } } // ordena desde Mongoose
    })
    .populate('templateId', 'name category previewUrl sections')
    .lean(); // evita transforms que puedan hacer .sort sobre undefined

  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  // Normalizaciones defensivas (evitan .sort sobre undefined en cualquier capa)
  business.services = Array.isArray(business.services) ? business.services : [];
  business.gallery = Array.isArray(business.gallery) ? business.gallery : [];
  business.operatingHours = business.operatingHours || {};
  business.socialMedia = business.socialMedia || {};
  business.location = business.location || {};
  if (business.templateId && !Array.isArray(business.templateId.sections)) {
    business.templateId.sections = [];
  }

  // (Opcional) actualización ligera de stats sin tocar transforms
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

  // Solo mostrar negocios públicos a no-owners
  if (req.user?.id !== business.owner._id.toString() && business.status !== BUSINESS_STATUS.ACTIVE) {
    throw new NotFoundError('Negocio no encontrado');
  }

  // Incrementar vistas si no es el owner
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

  // Solo mostrar negocios activos en vista pública
  throwIf(business.status !== BUSINESS_STATUS.ACTIVE, 'Negocio no disponible');

  // Incrementar vistas
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

  // Construir filtros
  const filters = { status: BUSINESS_STATUS.ACTIVE };
  
  if (category) filters.category = category;
  if (city) filters['location.city'] = new RegExp(city, 'i');
  if (province) filters['location.province'] = new RegExp(province, 'i');
  if (featured === 'true') filters.featured = true;

  // Agregar búsqueda de texto si existe
  if (search) {
    filters.$text = { $search: search };
  }

  // Configurar ordenamiento
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

  // Aplicar paginación (viene del middleware)
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

  // Validaciones si se proporcionan nuevos valores
  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  // Actualizar campos permitidos
  if (name) business.name = name.trim();
  if (description !== undefined) business.description = description.trim();
  if (phone !== undefined) business.phone = phone?.trim();
  if (email !== undefined) business.email = email?.toLowerCase().trim();

  // Actualizar ubicación
  if (location) {
    business.location = {
      ...business.location,
      ...location,
      address: location.address?.trim(),
      city: location.city?.trim(),
      province: location.province?.trim()
    };
  }

  // Actualizar redes sociales
  if (socialMedia) {
    business.socialMedia = {
      ...business.socialMedia,
      ...socialMedia
    };
  }

  // Actualizar horarios
  if (operatingHours) {
    business.operatingHours = {
      ...business.operatingHours,
      ...operatingHours
    };
  }

  // Actualizar configuraciones
  if (settings) {
    business.settings = {
      ...business.settings,
      ...settings
    };
  }

  // Actualizar configuración visual
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

// ============== SUBIR LOGO ==============
export const uploadLogo = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  throwIf(!req.file, 'No se proporcionó archivo de logo');

  // Eliminar logo anterior si existe
  if (business.logo && business.logo.filename) {
    await deleteFromCloudinary(business.logo.filename);
  }

  // Actualizar logo
  business.logo = {
    url: req.file.path || req.file.url,
    filename: req.file.filename,
    uploadedAt: new Date()
  };

  await business.save();

  logger.info('Logo subido', { 
    businessId: business._id, 
    ownerId: req.user.id,
    filename: req.file.filename,
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Logo subido exitosamente',
    data: {
      logo: business.logo
    }
  });
});

// ============== SUBIR IMAGEN DE PORTADA ==============
export const uploadCoverImage = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  throwIf(!req.file, 'No se proporcionó archivo de imagen');

  // Eliminar imagen anterior si existe
  if (business.coverImage && business.coverImage.filename) {
    await deleteFromCloudinary(business.coverImage.filename);
  }

  // Actualizar imagen de portada
  business.coverImage = {
    url: req.file.path || req.file.url,
    filename: req.file.filename,
    uploadedAt: new Date()
  };

  await business.save();

  logger.info('Imagen de portada subida', { 
    businessId: business._id, 
    ownerId: req.user.id,
    filename: req.file.filename,
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Imagen de portada subida exitosamente',
    data: {
      coverImage: business.coverImage
    }
  });
});

// ============== SUBIR IMÁGENES A GALERÍA ==============
export const uploadGalleryImages = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  throwIf(!req.files || req.files.length === 0, 'No se proporcionaron archivos');
  throwIf(
    business.gallery.length + req.files.length > APP_LIMITS.MAX_GALLERY_IMAGES,
    `Máximo ${APP_LIMITS.MAX_GALLERY_IMAGES} imágenes permitidas en la galería`
  );

  // Agregar nuevas imágenes
  const newImages = req.files.map(file => ({
    url: file.path || file.url,
    filename: file.filename,
    caption: '',
    uploadedAt: new Date()
  }));

  business.gallery.push(...newImages);
  await business.save();

  logger.info('Imágenes de galería subidas', { 
    businessId: business._id, 
    ownerId: req.user.id,
    count: req.files.length,
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

  // Eliminar de Cloudinary si existe
  if (image.filename) {
    await deleteFromCloudinary(image.filename);
  }

  // Eliminar de la galería
  business.gallery.pull(imageId);
  await business.save();

  logger.info('Imagen de galería eliminada', { 
    businessId: business._id, 
    ownerId: req.user.id,
    imageId,
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

  // Validar transición de estado
  if (status === BUSINESS_STATUS.ACTIVE) {
    throwIf(!business.name, 'El negocio debe tener nombre para activarse');
    throwIf(!business.category, 'El negocio debe tener categoría para activarse');
  }

  const oldStatus = business.status;
  business.status = status;

  // Establecer publishedAt si se publica por primera vez
  if (status === BUSINESS_STATUS.ACTIVE && !business.publishedAt) {
    business.publishedAt = new Date();
  }

  await business.save();

  logger.info('Estado de negocio cambiado', { 
    businessId: business._id, 
    ownerId: req.user.id,
    oldStatus,
    newStatus: status,
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

  // Eliminar imágenes de Cloudinary
  const imagesToDelete = [];
  if (business.logo?.filename) imagesToDelete.push(business.logo.filename);
  if (business.coverImage?.filename) imagesToDelete.push(business.coverImage.filename);
  business.gallery.forEach(img => {
    if (img.filename) imagesToDelete.push(img.filename);
  });

  // Eliminar imágenes en paralelo
  await Promise.allSettled(
    imagesToDelete.map(filename => deleteFromCloudinary(filename))
  );

  // Eliminar servicios asociados
  await Service.deleteMany({ business: business._id });

  // Eliminar el negocio
  await business.deleteOne();

  // Actualizar el usuario
  await User.findByIdAndUpdate(req.user.id, { $unset: { business: 1 } });

  logger.info('Negocio eliminado', { 
    businessId: business._id, 
    ownerId: req.user.id,
    businessName: business.name,
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