// controllers/service.controller.js
import Service from '../models/service.js';
import Business from '../models/business.js';
import Reservation from '../models/reservation.js';
import { controllerHandler } from '../middleware/asyncHandler.js';
import { throwIf, throwIfNotFound } from '../middleware/index.js';
import { logger } from '../middleware/logger.js';
import { constants } from '../config/index.js';

const {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  APP_LIMITS,
  SERVICE_TYPES,
} = constants;

/* ─────────────────────────────────────────────────────────────
   Defaults
───────────────────────────────────────────────────────────── */
const DEFAULT_WEEKLY_SCHEDULE = {
  monday:    { enabled: true,  start: '09:00', end: '17:00', breaks: [] },
  tuesday:   { enabled: true,  start: '09:00', end: '17:00', breaks: [] },
  wednesday: { enabled: true,  start: '09:00', end: '17:00', breaks: [] },
  thursday:  { enabled: true,  start: '09:00', end: '17:00', breaks: [] },
  friday:    { enabled: true,  start: '09:00', end: '17:00', breaks: [] },
  saturday:  { enabled: false, start: null,   end: null,   breaks: [] },
  sunday:    { enabled: false, start: null,   end: null,   breaks: [] },
};

export const serviceController = {
  /* ============================================================
     OBTENER SERVICIOS POR NEGOCIO
  ============================================================ */
  getServicesByBusiness: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const {
      category,
      isActive,
      minPrice,
      maxPrice,
      maxDuration,
      sortBy = 'sortOrder',
      page = 1,
      limit = 10,
    } = req.query;

    const business = await Business.findById(businessId);
    throwIfNotFound(business, 'Negocio no encontrado');

    // Si no es owner: negocio debe estar activo
    if (!req.user || business.owner.toString() !== String(req.user.id)) {
      throwIf(business.status !== 'active', 'Negocio no disponible');
    }

    // Filtros base
    const filters = { business: business._id };

    // Público vs owner
    const isOwner = !!req.user && business.owner.toString() === String(req.user.id);
    if (!isOwner) {
      filters.isActive = true;
      filters.isPublic = true;
    } else if (typeof isActive !== 'undefined') {
      filters.isActive = isActive === 'true' || isActive === true;
    }

    if (category) {
      filters.category = new RegExp(String(category), 'i');
    }

    if (minPrice || maxPrice) {
      filters['pricing.basePrice'] = {};
      if (minPrice) filters['pricing.basePrice'].$gte = Number(minPrice);
      if (maxPrice) filters['pricing.basePrice'].$lte = Number(maxPrice);
    }

    if (maxDuration) {
      filters.duration = { $lte: Number(maxDuration) };
    }

    // Orden
    let sortOptions = {};
    switch (sortBy) {
      case 'name':
        sortOptions = { name: 1 };
        break;
      case 'price':
        sortOptions = { 'pricing.basePrice': 1 };
        break;
      case 'duration':
        sortOptions = { duration: 1 };
        break;
      case 'popularity':
        sortOptions = { 'stats.totalBookings': -1 };
        break;
      case 'rating':
        sortOptions = { 'stats.averageRating': -1 };
        break;
      default:
        sortOptions = { sortOrder: 1, name: 1 };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [services, total] = await Promise.all([
      Service.find(filters)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('business', 'name slug owner')
        .lean(),
      Service.countDocuments(filters),
    ]);

    logger.info('Servicios obtenidos por negocio', {
      businessId,
      count: services.length,
      total,
      filters,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      data: {
        services,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: Number(page) * Number(limit) < total,
          hasPrevPage: Number(page) > 1,
        },
        business: {
          id: business._id,
          name: business.name,
          slug: business.slug,
        },
      },
    });
  }, 'Get Services By Business'),

  /* ============================================================
     CREAR SERVICIO
  ============================================================ */
  createService: controllerHandler(async (req, res) => {
    // Permitir que venga por params o body (ruta '/services' mapea en el router)
    const businessIdParam = req.params.businessId || req.body?.business || req.body?.businessId;

    const {
      title,                // alias aceptado
      name: nameBody,       // preferido
      description,
      category,
      price,                // puede venir string -> se castea
      duration: durationBody,
      durationMin,          // alias
      serviceType = SERVICE_TYPES.INDIVIDUAL,
      tags = [],
      requirements = [],
      isActive = true,
      isPublic = true,
    } = req.body;

    const name = (nameBody ?? title)?.toString().trim();
    const duration = Number(durationBody ?? durationMin);
    const priceNum = Number(price);
    const categoryTrim = String(category || '').trim();
    const serviceTypeVal = serviceType ?? SERVICE_TYPES.INDIVIDUAL;

    // Validaciones
    throwIf(!name, 'El nombre del servicio es obligatorio');
    // 👉 Permitir precio mínimo 0 (como indicaste)
    throwIf(!Number.isFinite(priceNum) || priceNum < 0, 'El precio del servicio es requerido y debe ser ≥ 0');
    throwIf(!Number.isFinite(duration) || duration < APP_LIMITS.MIN_SERVICE_DURATION,
      `La duración mínima es ${APP_LIMITS.MIN_SERVICE_DURATION} minutos`);
    throwIf(duration > APP_LIMITS.MAX_SERVICE_DURATION,
      `La duración máxima es ${APP_LIMITS.MAX_SERVICE_DURATION} minutos`);
    throwIf(duration % 15 !== 0, 'La duración debe ser múltiplo de 15 minutos');
    throwIf(!categoryTrim, 'La categoría del servicio es requerida');

    // Verificar negocio y ownership
    const business = await Business.findById(businessIdParam);
    throwIfNotFound(business, 'Negocio no encontrado');
    throwIf(String(business.owner) !== String(req.user.id), 'No tienes permisos para este negocio');

    // Límite por negocio
    const serviceCount = await Service.countDocuments({ business: business._id });
    throwIf(serviceCount >= APP_LIMITS.MAX_SERVICES_PER_BUSINESS,
      `Máximo ${APP_LIMITS.MAX_SERVICES_PER_BUSINESS} servicios permitidos por negocio`);

    // Duplicados (nombre por negocio)
    const existingService = await Service.findOne({ business: business._id, name });
    throwIf(!!existingService, 'Ya existe un servicio con ese nombre en tu negocio');

    // Datos
    const serviceData = {
      business: business._id,
      name,
      description: description?.toString().trim() || '',
      category: categoryTrim,
      duration,
      pricing: {
        basePrice: priceNum,
        currency: business?.settings?.currency || 'CRC',
      },
      serviceType: serviceTypeVal,
      tags: Array.isArray(tags) ? tags.filter(t => t && t.toString().trim()).slice(0, 10) : [],
      requirements: Array.isArray(requirements) ? requirements.filter(r => r && r.toString().trim()).slice(0, 5) : [],
      isActive,
      isPublic,
      createdBy: req.user.id,
      availability: {
        weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
        slotMinutes: 15,
        bufferBefore: 0,
        bufferAfter: 0,
      },
    };

    // sortOrder incremental
    const maxOrder = await Service.findOne({ business: business._id })
      .sort({ sortOrder: -1 })
      .select('sortOrder');
    serviceData.sortOrder = (maxOrder?.sortOrder || 0) + 1;

    const service = await Service.create(serviceData);
    await service.populate('business', 'name slug');

    logger.success('Servicio creado exitosamente', {
      serviceId: service._id,
      businessId: business._id,
      ownerId: req.user.id,
      serviceName: service.name,
      price: service.pricing?.basePrice,
      duration: service.duration,
    });

    res.status(201).json({
      success: true,
      message: 'Servicio creado exitosamente',
      data: { service },
    });
  }, 'Create Service'),

  /* ============================================================
     OBTENER SERVICIO POR ID
  ============================================================ */
  getServiceById: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;

    const service = await Service.findById(serviceId)
      .populate('business', 'name slug owner status');

    throwIfNotFound(service, 'Servicio no encontrado');

    const isOwner = req.user?.id === service.business.owner.toString();
    const isPublic = service.isActive && service.isPublic && service.business.status === 'active';
    throwIf(!isOwner && !isPublic, 'Servicio no disponible');

    logger.info('Servicio obtenido por ID', {
      serviceId,
      serviceName: service.name,
      userId: req.user?.id,
      isOwner,
    });

    res.json({
      success: true,
      data: { service },
    });
  }, 'Get Service By ID'),

  /* ============================================================
     ACTUALIZAR SERVICIO
  ============================================================ */
  updateService: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;

    const service = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(service, 'Servicio no encontrado');
    throwIf(service.business.owner.toString() !== String(req.user.id),
      'No tienes permisos para modificar este servicio');

    const {
      title,
      name: nameBody,
      description,
      category,
      price,
      duration: durationBody,
      durationMin,
      tags,
      requirements,
      isActive,
      isPublic,
    } = req.body;

    const newNameRaw = (nameBody ?? title);
    const newName = typeof newNameRaw === 'string' ? newNameRaw.trim() : undefined;
    const duration = (durationBody ?? durationMin);
    const durationNum = duration !== undefined ? Number(duration) : undefined;

    // Validaciones de cambios
    if (newName && newName !== service.name) {
      const exists = await Service.findOne({
        business: service.business._id,
        name: newName,
        _id: { $ne: serviceId },
      });
      throwIf(!!exists, 'Ya existe un servicio con ese nombre en tu negocio');
    }

    if (price !== undefined) {
      const priceNum = Number(price);
      throwIf(!Number.isFinite(priceNum) || priceNum < 0, 'El precio debe ser ≥ 0');
    }

    if (durationNum !== undefined) {
      throwIf(!Number.isFinite(durationNum), 'La duración debe ser numérica');
      throwIf(durationNum < APP_LIMITS.MIN_SERVICE_DURATION,
        `La duración mínima es ${APP_LIMITS.MIN_SERVICE_DURATION} minutos`);
      throwIf(durationNum > APP_LIMITS.MAX_SERVICE_DURATION,
        `La duración máxima es ${APP_LIMITS.MAX_SERVICE_DURATION} minutos`);
      throwIf(durationNum % 15 !== 0, 'La duración debe ser múltiplo de 15 minutos');
    }

    // Construir updateData
    const updateData = {};
    if (newName != null) updateData.name = newName;
    if (typeof description === 'string') updateData.description = description.trim();
    if (typeof category === 'string' && category.trim()) updateData.category = category.trim();
    if (price !== undefined) updateData['pricing.basePrice'] = Number(price);
    if (durationNum !== undefined) updateData.duration = durationNum;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (typeof isPublic === 'boolean') updateData.isPublic = isPublic;

    if (Array.isArray(tags)) {
      updateData.tags = tags
        .map(t => (t ?? '').toString().trim())
        .filter(Boolean)
        .slice(0, 10);
    }

    if (Array.isArray(requirements)) {
      updateData.requirements = requirements
        .map(r => (r ?? '').toString().trim())
        .filter(Boolean)
        .slice(0, 5);
    }

    const updatedService = await Service.findByIdAndUpdate(
      serviceId,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('business', 'name slug');

    logger.success('Servicio actualizado exitosamente', {
      serviceId: service._id,
      businessId: service.business._id,
      ownerId: req.user.id,
      changes: Object.keys(updateData),
    });

    res.json({
      success: true,
      message: 'Servicio actualizado exitosamente',
      data: { service: updatedService },
    });
  }, 'Update Service'),

  /* ============================================================
     ELIMINAR SERVICIO
  ============================================================ */
  deleteService: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;

    const service = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(service, 'Servicio no encontrado');
    throwIf(service.business.owner.toString() !== String(req.user.id),
      'No tienes permisos para eliminar este servicio');

    const activeReservations = await Reservation.countDocuments({
      service: serviceId,
      status: { $in: ['pending', 'confirmed'] },
    });

    if (activeReservations > 0) {
      await Service.findByIdAndUpdate(serviceId, {
        isActive: false,
        deletedAt: new Date(),
      });

      logger.warn('Servicio marcado como inactivo (tiene reservas activas)', {
        serviceId,
        activeReservations,
        userId: req.user.id,
      });

      return res.json({
        success: true,
        message: 'Servicio desactivado debido a reservas activas',
        data: { activeReservations },
      });
    }

    await Service.findByIdAndDelete(serviceId);

    logger.success('Servicio eliminado permanentemente', {
      serviceId: service._id,
      businessId: service.business._id,
      ownerId: req.user.id,
      serviceName: service.name,
    });

    res.json({
      success: true,
      message: 'Servicio eliminado exitosamente',
    });
  }, 'Delete Service'),

  /* ============================================================
     ACTIVAR/DESACTIVAR SERVICIO
  ============================================================ */
  toggleServiceStatus: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;
    const { isActive } = req.body;

    const service = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(service, 'Servicio no encontrado');
    throwIf(service.business.owner.toString() !== String(req.user.id),
      'No tienes permisos para modificar este servicio');

    service.isActive = !!isActive;
    await service.save();

    logger.info('Estado de servicio actualizado', {
      serviceId,
      newStatus: service.isActive ? 'activo' : 'inactivo',
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: `Servicio ${service.isActive ? 'activado' : 'desactivado'} exitosamente`,
      data: {
        service: {
          id: service._id,
          name: service.name,
          isActive: service.isActive,
        },
      },
    });
    }, 'Toggle Service Status'),

  /* ============================================================
     DUPLICAR SERVICIO
  ============================================================ */
  duplicateService: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;
    const { newName: newNameBody, newTitle, targetBusinessId, adjustPrice, adjustDuration } = req.body;

    const originalService = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(originalService, 'Servicio no encontrado');
    throwIf(originalService.business.owner.toString() !== String(req.user.id),
      'No tienes permisos para duplicar este servicio');

    const targetBusiness = targetBusinessId
      ? await Business.findById(targetBusinessId)
      : originalService.business;
    throwIfNotFound(targetBusiness, 'Negocio destino no encontrado');
    throwIf(targetBusiness.owner.toString() !== String(req.user.id),
      'No tienes permisos para agregar servicios a este negocio');

    const newName = (newNameBody ?? newTitle)?.toString().trim();
    throwIf(!newName, 'Debes indicar un nombre para el servicio duplicado');

    const exists = await Service.findOne({ business: targetBusiness._id, name: newName });
    throwIf(!!exists, 'Ya existe un servicio con ese nombre en el negocio destino');

    const basePrice = originalService.pricing?.basePrice ?? 0;
    const newPrice = Number(basePrice) + Number(adjustPrice || 0);
    const newDuration = Number(originalService.duration) + Number(adjustDuration || 0);

    throwIf(newPrice < 0, 'El precio resultante no puede ser negativo');
    throwIf(newDuration < APP_LIMITS.MIN_SERVICE_DURATION
      || newDuration > APP_LIMITS.MAX_SERVICE_DURATION
      || newDuration % 15 !== 0, 'La duración resultante es inválida');

    const copy = originalService.toObject();
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.__v;

    const duplicatedService = await Service.create({
      ...copy,
      business: targetBusiness._id,
      name: newName,
      pricing: { ...(copy.pricing || {}), basePrice: newPrice },
      duration: newDuration,
      createdBy: req.user.id,
    });

    await duplicatedService.populate('business', 'name slug');

    logger.success('Servicio duplicado exitosamente', {
      originalId: serviceId,
      newId: duplicatedService._id,
      newName,
      targetBusinessId: targetBusiness._id,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Servicio duplicado exitosamente',
      data: {
        service: duplicatedService,
        originalService: {
          id: originalService._id,
          name: originalService.name,
        },
      },
    });
  }, 'Duplicate Service'),

  /* ============================================================
     BUSCAR SERVICIOS (PÚBLICO)
  ============================================================ */
  searchServices: controllerHandler(async (req, res) => {
    const {
      q: searchTerm,
      category,
      businessType,
      city,
      minPrice,
      maxPrice,
      maxDuration,
      sortBy = 'relevance',
      page = 1,
      limit = 10,
    } = req.query;

    throwIf(!searchTerm || String(searchTerm).trim().length < 2,
      'El término de búsqueda debe tener al menos 2 caracteres');

    const pipeline = [];

    // Match inicial: solo activos y públicos
    const matchStage = {
      isActive: true,
      isPublic: true,
      $text: { $search: String(searchTerm).trim() },
    };

    if (category) {
      matchStage.category = new RegExp(String(category), 'i');
    }

    if (minPrice || maxPrice) {
      matchStage['pricing.basePrice'] = {};
      if (minPrice) matchStage['pricing.basePrice'].$gte = Number(minPrice);
      if (maxPrice) matchStage['pricing.basePrice'].$lte = Number(maxPrice);
    }

    if (maxDuration) {
      matchStage.duration = { $lte: Number(maxDuration) };
    }

    pipeline.push({ $match: matchStage });

    // Lookup business
    pipeline.push({
      $lookup: {
        from: 'businesses',
        localField: 'business',
        foreignField: '_id',
        as: 'businessInfo',
      },
    });
    pipeline.push({ $unwind: '$businessInfo' });

    // Filtros de negocio
    const businessMatch = { 'businessInfo.status': 'active' };
    if (businessType) businessMatch['businessInfo.businessType'] = businessType;
    if (city) businessMatch['businessInfo.contact.city'] = new RegExp(String(city), 'i');
    pipeline.push({ $match: businessMatch });

    // Relevance
    pipeline.push({ $addFields: { relevanceScore: { $meta: 'textScore' } } });

    // Orden
    let sortStage = {};
    switch (sortBy) {
      case 'price':
        sortStage = { 'pricing.basePrice': 1 };
        break;
      case 'duration':
        sortStage = { duration: 1 };
        break;
      case 'popularity':
        sortStage = { 'stats.totalBookings': -1 };
        break;
      case 'rating':
        sortStage = { 'stats.averageRating': -1 };
        break;
      case 'relevance':
      default:
        sortStage = { relevanceScore: -1 };
    }
    pipeline.push({ $sort: sortStage });

    // Proyección final (mapear price → pricing.basePrice para salida)
    pipeline.push({
      $project: {
        name: 1,
        description: 1,
        category: 1,
        price: '$pricing.basePrice',
        duration: 1,
        tags: 1,
        images: 1,
        relevanceScore: 1,
        business: {
          id: '$businessInfo._id',
          name: '$businessInfo.name',
          slug: '$businessInfo.slug',
          city: '$businessInfo.contact.city',
          businessType: '$businessInfo.businessType',
        },
      },
    });

    // Paginación
    const skip = (Number(page) - 1) * Number(limit);
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    const services = await Service.aggregate(pipeline);

    // Conteo total
    const countPipeline = pipeline.slice(0, -2);
    countPipeline.push({ $count: 'total' });
    const totalResult = await Service.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    logger.info('Búsqueda de servicios realizada', {
      searchTerm,
      filters: { category, businessType, city, minPrice, maxPrice, maxDuration },
      resultsFound: services.length,
      totalResults: total,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      data: {
        services,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: Number(page) * Number(limit) < total,
          hasPrevPage: Number(page) > 1,
        },
        searchInfo: {
          query: searchTerm,
          totalResults: total,
          appliedFilters: {
            category,
            businessType,
            city,
            priceRange: minPrice || maxPrice ? { min: Number(minPrice || 0), max: Number(maxPrice || 0) } : null,
          },
        },
      },
    });
  }, 'Search Services'),

  /* ============================================================
     SERVICIOS POPULARES (PÚBLICO)
  ============================================================ */
  getPopularServices: controllerHandler(async (req, res) => {
    const {
      limit = 12,
      category,
      businessType,
      timeframe = 'month',
      city,
    } = req.query;

    const now = new Date();
    let dateFilter;
    switch (timeframe) {
      case 'week':
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        dateFilter = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case 'year':
        dateFilter = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case 'month':
      default:
        dateFilter = new Date(now.setMonth(now.getMonth() - 1));
    }

    const pipeline = [];

    const matchStage = {
      isActive: true,
      isPublic: true,
    };
    if (category) matchStage.category = new RegExp(String(category), 'i');
    pipeline.push({ $match: matchStage });

    pipeline.push({
      $lookup: {
        from: 'businesses',
        localField: 'business',
        foreignField: '_id',
        as: 'businessInfo',
      },
    });
    pipeline.push({ $unwind: '$businessInfo' });

    const businessMatch = { 'businessInfo.status': 'active' };
    if (businessType) businessMatch['businessInfo.businessType'] = businessType;
    if (city) businessMatch['businessInfo.contact.city'] = new RegExp(String(city), 'i');
    pipeline.push({ $match: businessMatch });

    // Métrica de popularidad (proxy)
    pipeline.push({
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: [{ $ifNull: ['$stats.totalBookings', 0] }, 0.4] },
            { $multiply: [{ $ifNull: ['$stats.averageRating', 0] }, 0.3] },
            // reciente
            {
              $multiply: [
                {
                  $cond: [{ $gte: ['$createdAt', dateFilter] }, 10, 0],
                },
                0.3,
              ],
            },
          ],
        },
      },
    });

    pipeline.push({
      $sort: { popularityScore: -1, 'stats.averageRating': -1, 'stats.totalBookings': -1 },
    });

    pipeline.push({ $limit: parseInt(limit) });

    pipeline.push({
      $project: {
        name: 1,
        description: 1,
        category: 1,
        price: '$pricing.basePrice',
        duration: 1,
        tags: 1,
        images: 1,
        popularityScore: 1,
        business: {
          id: '$businessInfo._id',
          name: '$businessInfo.name',
          slug: '$businessInfo.slug',
          businessType: '$businessInfo.businessType',
          city: '$businessInfo.contact.city',
        },
        popularityMetrics: {
          totalReservations: { $ifNull: ['$stats.totalBookings', 0] },
          averageRating: { $ifNull: ['$stats.averageRating', 0] },
          trendingScore: '$popularityScore',
        },
      },
    });

    const services = await Service.aggregate(pipeline);

    logger.info('Servicios populares obtenidos', {
      count: services.length,
      timeframe,
      filters: { category, businessType, city },
      userId: req.user?.id,
    });

    res.json({
      success: true,
      data: {
        services,
        metadata: {
          timeframe,
          criteriaUsed: ['reservations', 'ratings', 'recent_activity'],
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  }, 'Get Popular Services'),

  /* ============================================================
     CATEGORÍAS DE SERVICIOS (PÚBLICO)
  ============================================================ */
  getServiceCategories: controllerHandler(async (req, res) => {
    const {
      businessType,
      includeCount = true,
      onlyActive = true,
    } = req.query;

    const pipeline = [];

    const matchStage = {};
    if (onlyActive === 'true' || onlyActive === true) {
      matchStage.isActive = true;
      matchStage.isPublic = true;
    }

    if (Object.keys(matchStage).length) {
      pipeline.push({ $match: matchStage });

      pipeline.push({
        $lookup: {
          from: 'businesses',
          localField: 'business',
          foreignField: '_id',
          as: 'businessInfo',
        },
      });
      pipeline.push({ $unwind: '$businessInfo' });

      const businessMatch = { 'businessInfo.status': 'active' };
      if (businessType) businessMatch['businessInfo.businessType'] = businessType;
      pipeline.push({ $match: businessMatch });
    }

    pipeline.push({
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        averagePrice: { $avg: '$pricing.basePrice' },
        averageDuration: { $avg: '$duration' },
        services: includeCount === 'true' ? { $push: '$$ROOT' } : null,
      },
    });

    pipeline.push({ $match: { _id: { $ne: null, $ne: '' } } });

    pipeline.push({
      $project: {
        name: '$_id',
        // slug sencillito; (si necesitas mejor slug, hazlo en BE fuera de agregación)
        slug: {
          $toLower: {
            $replaceAll: { input: '$_id', find: ' ', replacement: '-' },
          },
        },
        count: includeCount === 'true' ? '$count' : { $literal: null },
        averagePrice: { $round: ['$averagePrice', 0] },
        averageDuration: { $round: ['$averageDuration', 0] },
        popularity: { $divide: ['$count', 100] },
      },
    });

    pipeline.push({ $sort: { count: -1, name: 1 } });

    const categories = await Service.aggregate(pipeline);

    const enrichedCategories = categories.map((cat) => ({
      ...cat,
      description: getCategoryDescription(cat.name),
      icon: getCategoryIcon(cat.name),
      businessTypes: getBusinessTypesForCategory(cat.name),
    }));

    const summary = {
      totalCategories: categories.length,
      totalServices: categories.reduce((sum, c) => sum + (c.count || 0), 0),
      mostPopularCategory: categories[0]?.name || null,
      priceRange: categories.length
        ? {
            min: Math.min(...categories.map((c) => c.averagePrice)),
            max: Math.max(...categories.map((c) => c.averagePrice)),
            average: Math.round(
              categories.reduce((sum, c) => sum + c.averagePrice, 0) / categories.length
            ),
          }
        : { min: 0, max: 0, average: 0 },
    };

    logger.info('Categorías de servicios obtenidas', {
      categoriesFound: categories.length,
      businessType,
      includeCount,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      data: {
        categories: enrichedCategories,
        summary,
      },
    });
  }, 'Get Service Categories'),
};

/* ─────────────────────────────────────────────────────────────
   Auxiliares de categorías (descripciones/icónos)
───────────────────────────────────────────────────────────── */
const getCategoryDescription = (categoryName) => {
  const descriptions = {
    'Cortes de Cabello': 'Cortes tradicionales y modernos para todo tipo de cabello',
    'Tratamientos Faciales': 'Cuidado y tratamiento especializado del rostro',
    'Manicura y Pedicura': 'Cuidado profesional de manos y pies',
    'Masajes': 'Terapias de relajación y bienestar corporal',
    'Coloración': 'Servicios de tinte y coloración capilar',
    'Peinados': 'Estilos y arreglos para eventos especiales',
    'Depilación': 'Servicios de depilación con diferentes técnicas',
    'Tratamientos Corporales': 'Cuidado integral del cuerpo',
    'Barbería': 'Servicios tradicionales de barbería para hombres',
    'Extensiones': 'Aplicación de extensiones de cabello',
  };
  return descriptions[categoryName] || `Servicios de ${String(categoryName || '').toLowerCase()}`;
};

const getCategoryIcon = (categoryName) => {
  const icons = {
    'Cortes de Cabello': '✂️',
    'Tratamientos Faciales': '🧴',
    'Manicura y Pedicura': '💅',
    'Masajes': '💆',
    'Coloración': '🎨',
    'Peinados': '💇',
    'Depilación': '🪒',
    'Tratamientos Corporales': '🧘',
    'Barbería': '💈',
    'Extensiones': '💁',
  };
  return icons[categoryName] || '✨';
};

const getBusinessTypesForCategory = (categoryName) => {
  const businessTypes = {
    'Cortes de Cabello': ['barberia', 'salon_belleza'],
    'Tratamientos Faciales': ['spa', 'salon_belleza'],
    'Manicura y Pedicura': ['salon_belleza', 'spa'],
    'Masajes': ['spa'],
    'Coloración': ['salon_belleza'],
    'Peinados': ['salon_belleza'],
    'Depilación': ['spa', 'salon_belleza'],
    'Tratamientos Corporales': ['spa'],
    'Barbería': ['barberia'],
    'Extensiones': ['salon_belleza'],
  };
  return businessTypes[categoryName] || ['salon_belleza'];
};

export default serviceController;
