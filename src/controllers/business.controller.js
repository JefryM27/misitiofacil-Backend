// src/controllers/business.controller.js
// CRUD multi-negocio (owner/admin) + compatible con Vercel

import mongoose from 'mongoose';
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
  throwIf,
} from '../middleware/errorHandler.js';

import { constants, logger } from '../config/index.js';
import { deleteFromCloudinary } from '../config/storage/cloudinary.js';

const isVercel =
  process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.VERCEL_URL;

const {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  APP_LIMITS,
  BUSINESS_STATUS,
  BUSINESS_TYPES,
  VALIDATION_PATTERNS,
  USER_ROLES,
} = constants;

/* ──────────────────────────────────────────────────────────────
 * Helpers de archivos (logo/cover/gallery) — cloud/local
 * ────────────────────────────────────────────────────────────── */
const processUploadedFile = (file) => {
  if (!file) return null;

  if (isVercel || file.buffer) {
    return {
      url: null,
      filename: file.filename || `${Date.now()}-${file.originalname}`,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      needsCloudinaryUpload: true,
      isVercel: true,
    };
  }

  return {
    url: file.path || `/uploads/${file.filename}`,
    filename: file.filename,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path,
    needsCloudinaryUpload: false,
    isVercel: false,
  };
};

// Stub de subida (conéctalo a Cloudinary si tienes CLOUDINARY_URL)
const uploadToCloudinary = async (fileData) => {
  if (!fileData.needsCloudinaryUpload) return fileData.url;
  if (process.env.CLOUDINARY_URL) {
    // TODO: implementar subida real
    return `https://res.cloudinary.com/temp/${fileData.filename}`;
  }
  return `https://temp-storage.misitofacil.com/${fileData.filename}`;
};

/* ──────────────────────────────────────────────────────────────
 * Crear negocio
 * ────────────────────────────────────────────────────────────── */
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
    operatingHours, // puede venir
    settings = {},
  } = req.body;

  // también aceptamos openingHours del builder
  const openingHours = req.body.openingHours;

  throwIf(!name?.trim(), 'El nombre del negocio es requerido');

  const normalizedCategory = (category ?? '').toString().trim();
  throwIf(!normalizedCategory, 'La categoría del negocio es requerida');

  // Si manejas enum en Atlas, mantenemos esta validación
  throwIf(
    !Object.values(BUSINESS_TYPES).includes(normalizedCategory),
    `Categoría inválida. Debe ser: ${Object.values(BUSINESS_TYPES).join(', ')}`
  );

  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }
  if (
    phone &&
    !VALIDATION_PATTERNS.PHONE_CR.test(phone) &&
    !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)
  ) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  // ── Resolver template ─────────────────────────────
  let finalTemplateId = null;

  logger.info(
    `[BUSINESS][${isVercel ? 'VERCEL' : 'LOCAL'}] Creating business with templateId: ${templateId}`
  );

  if (templateId) {
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      throw new ValidationError('templateId inválido');
    }
    const tpl = await Template.findById(templateId);
    if (tpl && tpl.isActive) {
      const isOwner = tpl.owner?.toString() === req.user.id;
      const isPublic = tpl.isPublic === true;
      const isDefault = tpl.isDefault === true;
      const isAdmin = req.user?.role === (USER_ROLES?.ADMIN || 'admin');
      if (isOwner || isPublic || isDefault || isAdmin) {
        finalTemplateId = tpl._id;
        await tpl.markAsUsed?.();
      }
    }
  }

  if (!finalTemplateId) {
    // fallback a default público
    const def = await Template.findOne({ isActive: true, isPublic: true })
      .sort({ isDefault: -1, 'usage.rating': -1 })
      .lean();
    throwIfNotFound(def, 'No hay templates disponibles');
    finalTemplateId = def._id;
  }

  // ── Slug ──────────────────────────────────────────
  const toSlug = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const requestedSlug = toSlug(req.body.slug || name);
  let finalSlug = requestedSlug || `negocio-${Date.now()}`;
  if (await Business.exists({ slug: finalSlug })) {
    finalSlug = `${finalSlug}-${Math.floor(Math.random() * 1000)}`;
  }

  // ── Payload ───────────────────────────────────────
  const businessData = {
    owner: req.user.id,
    templateId: finalTemplateId,
    name: name.trim(),
    description: description?.trim() || '',
    category: normalizedCategory,
    slug: finalSlug,
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
          lng: parseFloat(location.coordinates.lng),
        },
      }),
    },

    socialMedia: {
      facebook: socialMedia.facebook?.trim() || '',
      instagram: socialMedia.instagram?.trim() || '',
      whatsapp: socialMedia.whatsapp?.trim() || '',
      website: socialMedia.website?.trim() || '',
      tiktok: socialMedia.tiktok?.trim() || '',
      twitter: socialMedia.twitter?.trim() || '',
    },

    settings: {
      allowOnlineBooking: settings.allowOnlineBooking !== false,
      requireBookingApproval: settings.requireBookingApproval || false,
      showPrices: settings.showPrices !== false,
      currency: settings.currency || 'CRC',
      ...settings,
    },

    status: BUSINESS_STATUS.DRAFT,
  };

  // horario por defecto o lo que venga del builder
  businessData.operatingHours =
    operatingHours ||
    openingHours || {
      monday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      tuesday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      wednesday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      thursday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      friday: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      saturday: { isOpen: true, openTime: '09:00', closeTime: '16:00' },
      sunday: { isOpen: false },
    };

  try {
    const business = await Business.create(businessData);

    // Si guardas referencia directa en User (único negocio), esto la mantiene.
    await User.findByIdAndUpdate(
      req.user.id,
      { business: business._id },
      { new: true }
    );

    logger.info('Negocio creado exitosamente', {
      businessId: business._id,
      ownerId: req.user.id,
      businessName: business.name,
      category: business.category,
      templateId: finalTemplateId,
      platform: isVercel ? 'vercel' : 'local',
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      message:
        SUCCESS_MESSAGES?.BUSINESS_CREATED || 'Negocio creado exitosamente',
      data: {
        business: {
          id: business._id,
          name: business.name,
          slug: business.slug,
          category: business.category,
          status: business.status,
          templateId: finalTemplateId,
        },
      },
    });
  } catch (error) {
    if (error.code === 121) {
      throw new ValidationError('Error de validación en la base de datos', {
        mongoError: error.errmsg,
        details: error.errInfo?.details,
        code: error.code,
      });
    }
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map((key) => ({
        field: key,
        message: error.errors[key].message,
        value: error.errors[key].value,
      }));
      throw new ValidationError('Error de validación de Mongoose', validationErrors);
    }
    if (error.code === 11000) {
      throw new ValidationError('Ya existe un negocio con estos datos', {
        duplicateField: Object.keys(error.keyPattern)[0],
        duplicateValue: Object.values(error.keyValue)[0],
      });
    }
    throw error;
  }
});

/* ──────────────────────────────────────────────────────────────
 * Listar negocios (owner o admin ?all=1)
 * ────────────────────────────────────────────────────────────── */
export const listBusinesses = asyncHandler(async (req, res) => {
  const isAdmin = String(req.user?.role) === String(USER_ROLES?.ADMIN || 'admin');
  const listAll = isAdmin && String(req.query.all) === '1';
  const filter = listAll ? {} : { owner: req.user.id };

  const items = await Business.find(filter)
    .select('name slug category status templateId publishedAt owner createdAt')
    .sort({ createdAt: -1 })
    .lean();

  // Devolvemos ambas claves por compatibilidad con el FE
  res.json({ success: true, items, data: items });
});

/* ──────────────────────────────────────────────────────────────
 * Obtener mi negocio (compatibilidad)
 * ────────────────────────────────────────────────────────────── */
export const getMyBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id })
    .populate('owner', 'fullName email')
    .populate({
      path: 'services',
      // importante: seleccionar pricing.* y duration
      select:
        'name description pricing.basePrice pricing.currency duration isActive sortOrder',
      options: { sort: { sortOrder: 1, createdAt: -1 } },
    })
    .populate('templateId', 'name category previewUrl sections')
    .lean();

  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

  business.services = Array.isArray(business.services) ? business.services : [];
  business.gallery = Array.isArray(business.gallery) ? business.gallery : [];
  business.operatingHours = business.operatingHours || {};
  business.socialMedia = business.socialMedia || {};
  business.location = business.location || {};
  if (business.templateId && !Array.isArray(business.templateId.sections)) {
    business.templateId.sections = [];
  }

  try {
    await Business.updateOne(
      { _id: business._id },
      { $set: { 'stats.lastAccessAt': new Date() } }
    );
  } catch (_) {}

  res.json({ success: true, data: { business } });
});

/* ──────────────────────────────────────────────────────────────
 * Obtener por ID
 * ────────────────────────────────────────────────────────────── */
export const getBusinessById = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  const business = await Business.findById(businessId)
    .populate('owner', 'fullName')
    .populate(
      'services',
      'name description pricing.basePrice pricing.currency duration isActive sortOrder'
    )
    .populate('templateId', 'name category');

  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

  if (
    req.user?.id !== business.owner._id.toString() &&
    business.status !== BUSINESS_STATUS.ACTIVE
  ) {
    throw new NotFoundError('Negocio no encontrado');
  }

  if (req.user?.id !== business.owner._id.toString()) {
    await Business.findByIdAndUpdate(businessId, { $inc: { 'stats.views': 1 } });
  }

  res.json({ success: true, data: { business: business.toJSON() } });
});

/* ──────────────────────────────────────────────────────────────
 * Obtener por slug (público)
 * ────────────────────────────────────────────────────────────── */
export const getBusinessBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const business = await Business.findOne({ slug })
    .populate('owner', 'fullName')
    .populate(
      'services',
      'name description pricing.basePrice pricing.currency duration isActive sortOrder'
    )
    .populate('templateId', 'name category');

  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );
  throwIf(business.status !== BUSINESS_STATUS.ACTIVE, 'Negocio no disponible');

  await Business.findByIdAndUpdate(business._id, {
    $inc: { 'stats.views': 1 },
  });

  res.json({ success: true, data: { business: business.toJSON() } });
});

/* ──────────────────────────────────────────────────────────────
 * Listado público (búsqueda/filtros)
 * ────────────────────────────────────────────────────────────── */
export const listPublicBusinesses = asyncHandler(async (req, res) => {
  const { category, city, province, featured, search, sortBy = 'rating' } =
    req.query;

  const filters = { status: BUSINESS_STATUS.ACTIVE };
  if (category) filters.category = category;
  if (city) filters['location.city'] = new RegExp(city, 'i');
  if (province) filters['location.province'] = new RegExp(province, 'i');
  if (featured === 'true') filters.featured = true;
  if (search) filters.$text = { $search: search };

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

  const query = Business.find(filters)
    .populate('owner', 'fullName')
    .select('name description category location logo stats featured slug createdAt')
    .sort(sortOptions);

  const businesses =
    typeof req.applyPagination === 'function'
      ? await req.applyPagination(query)
      : await query.lean();

  const total = await Business.countDocuments(filters);
  const response =
    typeof req.createPaginatedResponse === 'function'
      ? req.createPaginatedResponse(businesses, total)
      : { success: true, data: businesses, total };

  res.json(response);
});

/* ──────────────────────────────────────────────────────────────
 * Actualizar (owner o admin)
 * ────────────────────────────────────────────────────────────── */
export const updateBusiness = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const isAdmin = String(req.user?.role) === String(USER_ROLES?.ADMIN || 'admin');

  const business = businessId
    ? await Business.findById(businessId)
    : await Business.findOne({ owner: req.user.id });

  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

  if (!isAdmin && String(business.owner) !== String(req.user.id)) {
    throw new AuthenticationError('No autorizado');
  }

  const {
    name,
    description,
    category,
    phone,
    email,
    location,
    socialMedia,
    operatingHours,
    openingHours, // por compatibilidad
    settings,
    visualConfig,
  } = req.body;

  if (email && !VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }
  if (
    phone &&
    !VALIDATION_PATTERNS.PHONE_CR.test(phone) &&
    !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)
  ) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  if (name) business.name = name.trim();
  if (description !== undefined) business.description = description?.trim() || '';
  if (phone !== undefined) business.phone = phone?.trim();
  if (email !== undefined) business.email = email?.toLowerCase().trim();
  if (category !== undefined) business.category = String(category).trim();

  if (location) {
    business.location = {
      ...business.location,
      ...location,
      address: location.address?.trim(),
      city: location.city?.trim(),
      province: location.province?.trim(),
    };
  }

  if (socialMedia) {
    business.socialMedia = {
      ...business.socialMedia,
      ...socialMedia,
    };
  }

  const hours = operatingHours || openingHours;
  if (hours) {
    business.operatingHours = {
      ...business.operatingHours,
      ...hours,
    };
  }

  if (settings) {
    business.settings = {
      ...business.settings,
      ...settings,
    };
  }

  if (visualConfig) {
    business.visualConfig = {
      ...business.visualConfig,
      ...visualConfig,
    };
  }

  await business.save();

  logger.info('Negocio actualizado', {
    businessId: business._id,
    ownerId: req.user.id,
    changes: Object.keys(req.body),
    platform: isVercel ? 'vercel' : 'local',
    ip: req.ip,
  });

  res.json({
    success: true,
    message: 'Negocio actualizado exitosamente',
    data: { business: business.toJSON() },
  });
});

/* ──────────────────────────────────────────────────────────────
 * Uploads — logo
 * ────────────────────────────────────────────────────────────── */
export const uploadLogo = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );
  throwIf(!req.file, 'No se proporcionó archivo de logo');

  const fileData = processUploadedFile(req.file);
  if (fileData.needsCloudinaryUpload) {
    fileData.url = await uploadToCloudinary(fileData);
  }

  if (business.logo?.filename) {
    await deleteFromCloudinary(business.logo.filename);
  }

  business.logo = {
    url: fileData.url,
    filename: fileData.filename,
    uploadedAt: new Date(),
  };

  await business.save();

  res.json({
    success: true,
    message: 'Logo subido exitosamente',
    data: { logo: business.logo },
  });
});

/* ──────────────────────────────────────────────────────────────
 * Uploads — cover
 * ────────────────────────────────────────────────────────────── */
export const uploadCoverImage = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );
  throwIf(!req.file, 'No se proporcionó archivo de imagen');

  const fileData = processUploadedFile(req.file);
  if (fileData.needsCloudinaryUpload) {
    fileData.url = await uploadToCloudinary(fileData);
  }

  if (business.coverImage?.filename) {
    await deleteFromCloudinary(business.coverImage.filename);
  }

  business.coverImage = {
    url: fileData.url,
    filename: fileData.filename,
    uploadedAt: new Date(),
  };

  await business.save();

  res.json({
    success: true,
    message: 'Imagen de portada subida exitosamente',
    data: { coverImage: business.coverImage },
  });
});

/* ──────────────────────────────────────────────────────────────
 * Uploads — galería
 * ────────────────────────────────────────────────────────────── */
export const uploadGalleryImages = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );
  throwIf(!req.files || req.files.length === 0, 'No se proporcionaron archivos');
  throwIf(
    business.gallery.length + req.files.length > APP_LIMITS.MAX_GALLERY_IMAGES,
    `Máximo ${APP_LIMITS.MAX_GALLERY_IMAGES} imágenes permitidas en la galería`
  );

  const newImages = await Promise.all(
    req.files.map(async (file) => {
      const fd = processUploadedFile(file);
      if (fd.needsCloudinaryUpload) {
        fd.url = await uploadToCloudinary(fd);
      }
      return {
        url: fd.url,
        filename: fd.filename,
        caption: '',
        uploadedAt: new Date(),
      };
    })
  );

  business.gallery.push(...newImages);
  await business.save();

  res.json({
    success: true,
    message: `${req.files.length} imágenes subidas exitosamente`,
    data: { gallery: business.gallery, newImages },
  });
});

/* ──────────────────────────────────────────────────────────────
 * Eliminar imagen de galería
 * ────────────────────────────────────────────────────────────── */
export const deleteGalleryImage = asyncHandler(async (req, res) => {
  const { imageId } = req.params;

  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

  const image = business.gallery.id(imageId);
  throwIfNotFound(image, 'Imagen no encontrada');

  if (image.filename) {
    await deleteFromCloudinary(image.filename);
  }

  business.gallery.pull(imageId);
  await business.save();

  res.json({ success: true, message: 'Imagen eliminada exitosamente' });
});

/* ──────────────────────────────────────────────────────────────
 * Cambiar estado (owner)
 * ────────────────────────────────────────────────────────────── */
export const changeBusinessStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  throwIf(
    !Object.values(BUSINESS_STATUS).includes(status),
    `Estado inválido. Debe ser: ${Object.values(BUSINESS_STATUS).join(', ')}`
  );

  const business = await Business.findOne({ owner: req.user.id });
  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

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

  res.json({
    success: true,
    message: `Negocio ${
      status === BUSINESS_STATUS.ACTIVE ? 'publicado' : 'despublicado'
    } exitosamente`,
    data: {
      business: {
        id: business._id,
        status: business.status,
        publishedAt: business.publishedAt,
      },
    },
  });
});

/* ──────────────────────────────────────────────────────────────
 * Activar/Desactivar (admin)
 * ────────────────────────────────────────────────────────────── */
export const setBusinessStatus = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { enabled } = req.body;

  const isAdmin = String(req.user?.role) === String(USER_ROLES?.ADMIN || 'admin');
  throwIf(!isAdmin, 'Solo un administrador puede cambiar el estado');

  const business = await Business.findById(businessId);
  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

  const newStatus = enabled ? BUSINESS_STATUS.ACTIVE : BUSINESS_STATUS.INACTIVE;
  const oldStatus = business.status;

  business.status = newStatus;
  if (enabled && !business.publishedAt) business.publishedAt = new Date();

  await business.save();

  res.json({
    success: true,
    data: { id: business._id, status: business.status, publishedAt: business.publishedAt },
  });
});

/* ──────────────────────────────────────────────────────────────
 * Eliminar negocio (owner/admin)
 * ────────────────────────────────────────────────────────────── */
export const deleteBusiness = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const isAdmin = String(req.user?.role) === String(USER_ROLES?.ADMIN || 'admin');

  const business = businessId
    ? await Business.findById(businessId)
    : await Business.findOne({ owner: req.user.id });

  throwIfNotFound(
    business,
    ERROR_MESSAGES?.BUSINESS_NOT_FOUND || 'Negocio no encontrado'
  );

  if (!isAdmin && String(business.owner) !== String(req.user.id)) {
    throw new AuthenticationError('No autorizado');
  }

  const imagesToDelete = [];
  if (business.logo?.filename) imagesToDelete.push(business.logo.filename);
  if (business.coverImage?.filename) imagesToDelete.push(business.coverImage.filename);
  (business.gallery || []).forEach((img) => {
    if (img?.filename) imagesToDelete.push(img.filename);
  });

  await Promise.allSettled(
    imagesToDelete.map((filename) => deleteFromCloudinary(filename))
  );

  await Service.deleteMany({ business: business._id });
  await business.deleteOne();

  await User.findByIdAndUpdate(business.owner, { $unset: { business: 1 } });

  res.json({ success: true, message: 'Negocio eliminado exitosamente' });
});

export default {
  createBusiness,
  listBusinesses,
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
  setBusinessStatus,
  deleteBusiness,
};
