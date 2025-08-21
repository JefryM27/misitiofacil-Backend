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
    templateId,
    location = {},
    socialMedia = {},
    operatingHours,
    settings = {}
  } = req.body;

  // Validaciones básicas
  throwIf(!name?.trim(), 'El nombre del negocio es requerido');
  throwIf(!category, 'La categoría del negocio es requerida');

  // Verificar que el usuario es owner
  throwIf(req.user.role !== 'owner', 'Solo los owners pueden crear negocios');

  // Verificar que el usuario no tenga ya un negocio
  const existingBusiness = await Business.findOne({ owner: req.user.id });
  throwIf(existingBusiness, 'Ya tienes un negocio registrado');

  // Validar template si se proporciona
  let template = null;
  if (templateId) {
    template = await Template.findById(templateId);
    throwIfNotFound(template, 'Plantilla no encontrada');
    throwIf(!template.isActive || !template.isPublic, 'Plantilla no disponible');
  }

  // Validar categoría
  throwIf(
    !Object.values(BUSINESS_TYPES).includes(category),
    `Categoría inválida. Debe ser: ${Object.values(BUSINESS_TYPES).join(', ')}`
  );

  // Validar email si se proporciona
  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  // Validar teléfono si se proporciona
  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  // Crear el negocio
  const businessData = {
    owner: req.user.id,
    name: name.trim(),
    description: description?.trim() || '',
    category,
    phone: phone?.trim(),
    email: email?.toLowerCase().trim(),
    location: {
      address: location.address?.trim(),
      city: location.city?.trim(),
      province: location.province?.trim(),
      country: location.country || 'CR'
    },
    socialMedia: {
      facebook: socialMedia.facebook?.trim(),
      instagram: socialMedia.instagram?.trim(),
      whatsapp: socialMedia.whatsapp?.trim(),
      website: socialMedia.website?.trim()
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

  // Asignar template si se proporcionó
  if (template) {
    businessData.templateId = template._id;
  }

  // Configurar horarios por defecto si no se proporcionaron
  if (!operatingHours) {
    businessData.operatingHours = {
      monday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      tuesday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      wednesday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      thursday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      friday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      saturday: { isOpen: true, openTime: '09:00', closeTime: '16:00' },
      sunday: { isOpen: false }
    };
  } else {
    businessData.operatingHours = operatingHours;
  }

  const business = new Business(businessData);
  await business.save();

  // Actualizar el usuario para incluir referencia al negocio
  await User.findByIdAndUpdate(req.user.id, { business: business._id });

  // Marcar template como usado si se usó
  if (template) {
    await template.markAsUsed();
  }

  logger.info('Negocio creado', { 
    businessId: business._id, 
    ownerId: req.user.id, 
    name: business.name,
    category: business.category,
    ip: req.ip 
  });

  // Poblar datos para respuesta
  await business.populate('owner', 'fullName email');

  res.status(201).json({
    success: true,
    message: SUCCESS_MESSAGES.BUSINESS_CREATED || 'Negocio creado exitosamente',
    data: {
      business: business.toJSON()
    }
  });
});

// ============== OBTENER MI NEGOCIO ==============
export const getMyBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id })
    .populate('owner', 'fullName email')
    .populate('services', 'name description price duration isActive')
    .populate('templateId', 'name category previewUrl');

  throwIfNotFound(business, ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado');

  // Agregar estadísticas actualizadas
  await business.updateStats();

  res.json({
    success: true,
    data: {
      business: business.toJSON()
    }
  });
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