// controllers/service.controller.js
import Service from '../models/service.js';
import Business from '../models/business.js';
import Reservation from '../models/Reservation.js';
import {
  controllerHandler,
} from '../middleware/asyncHandler.js';
import { logger } from '../middleware/logger.js';
import { deleteFromCloudinary } from '../config/storage/cloudinary.js';
import { constants } from '../config/index.js';

const { 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES, 
  APP_LIMITS, 
  SERVICE_TYPES,
  SERVICE_DURATIONS
} = constants;

export const serviceController = {

  // ============== OBTENER SERVICIOS POR NEGOCIO ==============
  getServicesByBusiness: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const { 
      category, 
      isActive = true, 
      minPrice, 
      maxPrice, 
      maxDuration,
      sortBy = 'sortOrder',
      page = 1,
      limit = 10
    } = req.query;

    const business = await Business.findById(businessId);
    throwIfNotFound(business, 'Negocio no encontrado');

    // Solo mostrar servicios de negocios activos (para públicos)
    if (!req.user || business.owner.toString() !== req.user.id) {
      throwIf(business.status !== 'active', 'Negocio no disponible');
    }

    // Construir filtros
    const filters = { business: business._id };
    
    // Si no es el owner, solo mostrar servicios públicos y activos
    if (!req.user || business.owner.toString() !== req.user.id) {
      filters.isActive = true;
      filters.isPublic = true;
    } else if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    if (category) {
      filters.category = new RegExp(category, 'i');
    }
    
    if (minPrice || maxPrice) {
      filters['pricing.basePrice'] = {};
      if (minPrice) filters['pricing.basePrice'].$gte = Number(minPrice);
      if (maxPrice) filters['pricing.basePrice'].$lte = Number(maxPrice);
    }

    if (maxDuration) {
      filters.duration = { $lte: Number(maxDuration) };
    }

    // Configurar ordenamiento
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

    // Ejecutar consulta con paginación
    const skip = (page - 1) * limit;
    const [services, total] = await Promise.all([
      Service.find(filters)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('business', 'name slug owner')
        .lean(),
      Service.countDocuments(filters)
    ]);

    logger.info('Servicios obtenidos por negocio', {
      businessId,
      count: services.length,
      total,
      filters,
      userId: req.user?.id
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
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        },
        business: {
          id: business._id,
          name: business.name,
          slug: business.slug
        }
      }
    });
  }, 'Get Services By Business'),

  // ============== CREAR SERVICIO ==============
  createService: controllerHandler(async (req, res) => {
    const { businessId } = req.params;
    const { 
      title, 
      description, 
      category,
      price, 
      duration, 
      serviceType = SERVICE_TYPES.INDIVIDUAL,
      tags = [],
      requirements = [],
      isActive = true,
      isPublic = true
    } = req.body;

    // Validaciones básicas
    throwIf(!title?.trim(), 'El título del servicio es requerido');
    throwIf(!price || price < 0, 'El precio del servicio es requerido y debe ser mayor a 0');
    throwIf(!duration || duration < APP_LIMITS.MIN_SERVICE_DURATION, `La duración mínima es ${APP_LIMITS.MIN_SERVICE_DURATION} minutos`);
    throwIf(duration > APP_LIMITS.MAX_SERVICE_DURATION, `La duración máxima es ${APP_LIMITS.MAX_SERVICE_DURATION} minutos`);
    throwIf(duration % 15 !== 0, 'La duración debe ser múltiplo de 15 minutos');

    // Verificar que el negocio existe y pertenece al usuario
    const business = await Business.findById(businessId);
    throwIfNotFound(business, 'Negocio no encontrado');
    throwIf(business.owner.toString() !== req.user.id, 'No tienes permisos para este negocio');

    // Verificar límite de servicios por negocio
    const serviceCount = await Service.countDocuments({ business: business._id });
    throwIf(
      serviceCount >= APP_LIMITS.MAX_SERVICES_PER_BUSINESS,
      `Máximo ${APP_LIMITS.MAX_SERVICES_PER_BUSINESS} servicios permitidos por negocio`
    );

    // Verificar que no existe un servicio con el mismo título en el negocio
    const existingService = await Service.findOne({ 
      business: business._id, 
      title: title.trim() 
    });
    throwIf(existingService, 'Ya existe un servicio con ese título en tu negocio');

    // Validar categoría
    throwIf(!category?.trim(), 'La categoría del servicio es requerida');

    // Preparar datos del servicio
    const serviceData = {
      business: business._id,
      title: title.trim(),
      description: description?.trim() || '',
      category: category.trim(),
      price: Number(price),
      duration,
      serviceType,
      tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()).slice(0, 10) : [],
      requirements: Array.isArray(requirements) ? requirements.filter(req => req.trim()).slice(0, 5) : [],
      isActive,
      isPublic,
      createdBy: req.user.id
    };

    // Obtener el orden siguiente para el servicio
    const maxOrder = await Service.findOne({ business: business._id })
      .sort({ order: -1 })
      .select('order');
    
    serviceData.order = (maxOrder?.order || 0) + 1;

    // Crear el servicio
    const service = await Service.create(serviceData);

    logger.success('Servicio creado exitosamente', { 
      serviceId: service._id,
      businessId: business._id, 
      ownerId: req.user.id, 
      serviceTitle: service.title,
      price: service.price,
      duration: service.duration
    });

    // Poblar datos para respuesta
    await service.populate('business', 'name slug');

    res.status(201).json({
      success: true,
      message: 'Servicio creado exitosamente',
      data: {
        service
      }
    });
  }, 'Create Service'),

  // ============== OBTENER SERVICIO POR ID ==============
  getServiceById: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;

    const service = await Service.findById(serviceId)
      .populate('business', 'name slug owner status');

    throwIfNotFound(service, 'Servicio no encontrado');

    // Verificar permisos: owner del negocio o servicio público
    const isOwner = req.user?.id === service.business.owner.toString();
    const isPublic = service.isActive && service.isPublic && service.business.status === 'active';

    throwIf(!isOwner && !isPublic, 'Servicio no disponible');

    logger.info('Servicio obtenido por ID', {
      serviceId,
      serviceTitle: service.title,
      userId: req.user?.id,
      isOwner
    });

    res.json({
      success: true,
      data: {
        service
      }
    });
  }, 'Get Service By ID'),

  // ============== ACTUALIZAR SERVICIO ==============
  updateService: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;
    
    const service = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(service, 'Servicio no encontrado');

    // Verificar ownership
    throwIf(
      service.business.owner.toString() !== req.user.id,
      'No tienes permisos para modificar este servicio'
    );

    const {
      title,
      description,
      category,
      price,
      duration,
      tags,
      requirements,
      isActive,
      isPublic
    } = req.body;

    // Validaciones si se cambian valores críticos
    if (title && title.trim() !== service.title) {
      const existingService = await Service.findOne({ 
        business: service.business._id, 
        title: title.trim(),
        _id: { $ne: serviceId }
      });
      throwIf(existingService, 'Ya existe un servicio con ese título en tu negocio');
    }

    if (price !== undefined) {
      throwIf(price < 0, 'El precio debe ser mayor o igual a 0');
    }

    if (duration !== undefined) {
      throwIf(duration < APP_LIMITS.MIN_SERVICE_DURATION, `La duración mínima es ${APP_LIMITS.MIN_SERVICE_DURATION} minutos`);
      throwIf(duration > APP_LIMITS.MAX_SERVICE_DURATION, `La duración máxima es ${APP_LIMITS.MAX_SERVICE_DURATION} minutos`);
      throwIf(duration % 15 !== 0, 'La duración debe ser múltiplo de 15 minutos');
    }

    // Actualizar campos permitidos
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (category) updateData.category = category.trim();
    if (price !== undefined) updateData.price = Number(price);
    if (duration !== undefined) updateData.duration = duration;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isPublic !== undefined) updateData.isPublic = isPublic;

    // Actualizar arrays
    if (Array.isArray(tags)) {
      updateData.tags = tags.filter(tag => tag.trim()).slice(0, 10);
    }
    
    if (Array.isArray(requirements)) {
      updateData.requirements = requirements.filter(req => req.trim()).slice(0, 5);
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
      changes: Object.keys(updateData)
    });

    res.json({
      success: true,
      message: 'Servicio actualizado exitosamente',
      data: {
        service: updatedService
      }
    });
  }, 'Update Service'),

  // ============== ELIMINAR SERVICIO ==============
  deleteService: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;
    
    const service = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(service, 'Servicio no encontrado');

    // Verificar ownership
    throwIf(
      service.business.owner.toString() !== req.user.id,
      'No tienes permisos para eliminar este servicio'
    );

    // Verificar si hay reservas pendientes o confirmadas
    const activeReservations = await Reservation.countDocuments({
      service: serviceId,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (activeReservations > 0) {
      // Soft delete - marcar como inactivo en lugar de eliminar
      await Service.findByIdAndUpdate(serviceId, { 
        isActive: false, 
        deletedAt: new Date() 
      });
      
      logger.warn('Servicio marcado como inactivo (tiene reservas activas)', {
        serviceId,
        activeReservations,
        userId: req.user.id
      });

      return res.json({
        success: true,
        message: 'Servicio desactivado debido a reservas activas',
        data: { activeReservations }
      });
    }

    // Eliminación permanente si no tiene reservas
    await Service.findByIdAndDelete(serviceId);

    logger.success('Servicio eliminado permanentemente', { 
      serviceId: service._id,
      businessId: service.business._id, 
      ownerId: req.user.id,
      serviceTitle: service.title
    });

    res.json({
      success: true,
      message: 'Servicio eliminado exitosamente'
    });
  }, 'Delete Service'),

  // ============== ACTIVAR/DESACTIVAR SERVICIO ==============
  toggleServiceStatus: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;
    const { isActive } = req.body;

    const service = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(service, 'Servicio no encontrado');

    // Verificar ownership
    throwIf(
      service.business.owner.toString() !== req.user.id,
      'No tienes permisos para modificar este servicio'
    );

    service.isActive = isActive;
    await service.save();

    logger.info('Estado de servicio actualizado', {
      serviceId,
      newStatus: isActive ? 'activo' : 'inactivo',
      userId: req.user.id
    });

    res.json({
      success: true,
      message: `Servicio ${isActive ? 'activado' : 'desactivado'} exitosamente`,
      data: {
        service: {
          id: service._id,
          title: service.title,
          isActive: service.isActive
        }
      }
    });
  }, 'Toggle Service Status'),

  // ============== DUPLICAR SERVICIO ==============
  duplicateService: controllerHandler(async (req, res) => {
    const { serviceId } = req.params;
    const { newTitle, targetBusinessId, adjustPrice, adjustDuration } = req.body;

    const originalService = await Service.findById(serviceId).populate('business', 'owner');
    throwIfNotFound(originalService, 'Servicio no encontrado');

    // Verificar acceso al servicio original
    throwIf(
      originalService.business.owner.toString() !== req.user.id,
      'No tienes permisos para duplicar este servicio'
    );

    // Determinar negocio destino
    const targetBusiness = targetBusinessId ? 
      await Business.findById(targetBusinessId) : 
      originalService.business;

    throwIfNotFound(targetBusiness, 'Negocio destino no encontrado');

    // Verificar ownership del negocio destino
    throwIf(
      targetBusiness.owner.toString() !== req.user.id,
      'No tienes permisos para agregar servicios a este negocio'
    );

    // Verificar que el nuevo título no exista en el negocio destino
    const existingService = await Service.findOne({
      business: targetBusiness._id,
      title: newTitle
    });
    throwIf(existingService, 'Ya existe un servicio con ese título en el negocio destino');

    // Crear servicio duplicado
    const serviceData = originalService.toObject();
    delete serviceData._id;
    delete serviceData.createdAt;
    delete serviceData.updatedAt;
    delete serviceData.__v;

    const duplicatedService = await Service.create({
      ...serviceData,
      business: targetBusiness._id,
      title: newTitle,
      price: adjustPrice ? originalService.price + adjustPrice : originalService.price,
      duration: adjustDuration ? originalService.duration + adjustDuration : originalService.duration,
      createdBy: req.user.id
    });

    await duplicatedService.populate('business', 'name slug');

    logger.success('Servicio duplicado exitosamente', {
      originalId: serviceId,
      newId: duplicatedService._id,
      newTitle,
      targetBusinessId: targetBusiness._id,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Servicio duplicado exitosamente',
      data: {
        service: duplicatedService,
        originalService: {
          id: originalService._id,
          title: originalService.title
        }
      }
    });
  }, 'Duplicate Service'),

  // ============== BUSCAR SERVICIOS ==============
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
      limit = 10
    } = req.query;

    throwIf(!searchTerm || searchTerm.trim().length < 2, 'El término de búsqueda debe tener al menos 2 caracteres');

    // Construir query de búsqueda
    const pipeline = [];

    // Match inicial - solo servicios activos y públicos
    const matchStage = {
      isActive: true,
      isPublic: true,
      $text: { $search: searchTerm.trim() }
    };

    if (category) {
      matchStage.category = new RegExp(category, 'i');
    }

    if (minPrice || maxPrice) {
      matchStage.price = {};
      if (minPrice) matchStage.price.$gte = Number(minPrice);
      if (maxPrice) matchStage.price.$lte = Number(maxPrice);
    }

    if (maxDuration) {
      matchStage.duration = { $lte: Number(maxDuration) };
    }

    pipeline.push({ $match: matchStage });

    // Lookup con business para filtrar por tipo y ciudad
    pipeline.push({
      $lookup: {
        from: 'businesses',
        localField: 'business',
        foreignField: '_id',
        as: 'businessInfo'
      }
    });

    pipeline.push({ $unwind: '$businessInfo' });

    // Filtrar por negocio activo, tipo y ciudad
    const businessMatch = { 'businessInfo.status': 'active' };
    if (businessType) {
      businessMatch['businessInfo.businessType'] = businessType;
    }
    if (city) {
      businessMatch['businessInfo.contact.city'] = new RegExp(city, 'i');
    }
    pipeline.push({ $match: businessMatch });

    // Agregar relevance score
    pipeline.push({
      $addFields: {
        relevanceScore: { $meta: 'textScore' }
      }
    });

    // Configurar ordenamiento
    let sortStage = {};
    switch (sortBy) {
      case 'price':
        sortStage = { price: 1 };
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

    // Proyección final
    pipeline.push({
      $project: {
        title: 1,
        description: 1,
        category: 1,
        price: 1,
        duration: 1,
        tags: 1,
        images: 1,
        relevanceScore: 1,
        business: {
          id: '$businessInfo._id',
          name: '$businessInfo.name',
          slug: '$businessInfo.slug',
          city: '$businessInfo.contact.city',
          businessType: '$businessInfo.businessType'
        }
      }
    });

    // Aplicar paginación
    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    // Ejecutar búsqueda
    const services = await Service.aggregate(pipeline);

    // Contar total sin paginación
    const countPipeline = pipeline.slice(0, -2); // Sin skip y limit
    countPipeline.push({ $count: 'total' });
    const totalResult = await Service.aggregate(countPipeline);
    const total = totalResult[0]?.total || 0;

    logger.info('Búsqueda de servicios realizada', {
      searchTerm,
      filters: { category, businessType, city, minPrice, maxPrice, maxDuration },
      resultsFound: services.length,
      totalResults: total,
      userId: req.user?.id
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
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        },
        searchInfo: {
          query: searchTerm,
          totalResults: total,
          appliedFilters: {
            category,
            businessType,
            city,
            priceRange: minPrice || maxPrice ? { min: minPrice, max: maxPrice } : null
          }
        }
      }
    });
  }, 'Search Services'),

  // ============== SERVICIOS POPULARES ==============
  getPopularServices: controllerHandler(async (req, res) => {
    const { 
      limit = 12, 
      category, 
      businessType,
      timeframe = 'month',
      city
    } = req.query;

    // Determinar fecha límite según timeframe
    const now = new Date();
    let dateFilter;
    switch (timeframe) {
      case 'week':
        dateFilter = new Date(now.setDate(now.getDate() - 7));
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

    // Match servicios activos y públicos
    const matchStage = {
      isActive: true,
      isPublic: true
    };

    if (category) {
      matchStage.category = new RegExp(category, 'i');
    }

    pipeline.push({ $match: matchStage });

    // Lookup con business
    pipeline.push({
      $lookup: {
        from: 'businesses',
        localField: 'business',
        foreignField: '_id',
        as: 'businessInfo'
      }
    });

    pipeline.push({ $unwind: '$businessInfo' });

    // Filtrar por negocio activo y tipo
    const businessMatch = { 'businessInfo.status': 'active' };
    if (businessType) {
      businessMatch['businessInfo.businessType'] = businessType;
    }
    if (city) {
      businessMatch['businessInfo.contact.city'] = new RegExp(city, 'i');
    }
    pipeline.push({ $match: businessMatch });

    // Agregar métricas de popularidad (simuladas por ahora)
    pipeline.push({
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: [{ $ifNull: ['$stats.totalBookings', 0] }, 0.4] },
            { $multiply: [{ $ifNull: ['$stats.averageRating', 0] }, 0.3] },
            { $multiply: [{ $size: { $ifNull: ['$tags', []] } }, 0.1] },
            { $multiply: [{ $cond: [{ $gte: ['$createdAt', dateFilter] }, 10, 0] }, 0.2] }
          ]
        }
      }
    });

    // Ordenar por popularidad
    pipeline.push({
      $sort: { 
        popularityScore: -1,
        'stats.averageRating': -1,
        'stats.totalBookings': -1
      }
    });

    // Limitar resultados
    pipeline.push({ $limit: parseInt(limit) });

    // Proyección final
    pipeline.push({
      $project: {
        title: 1,
        description: 1,
        category: 1,
        price: 1,
        duration: 1,
        tags: 1,
        images: 1,
        popularityScore: 1,
        business: {
          id: '$businessInfo._id',
          name: '$businessInfo.name',
          slug: '$businessInfo.slug',
          businessType: '$businessInfo.businessType',
          city: '$businessInfo.contact.city'
        },
        popularityMetrics: {
          totalReservations: { $ifNull: ['$stats.totalBookings', 0] },
          averageRating: { $ifNull: ['$stats.averageRating', 0] },
          trendingScore: '$popularityScore'
        }
      }
    });

    const services = await Service.aggregate(pipeline);

    logger.info('Servicios populares obtenidos', {
      count: services.length,
      timeframe,
      filters: { category, businessType, city },
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: {
        services,
        metadata: {
          timeframe,
          criteriaUsed: ['reservations', 'ratings', 'recent_activity'],
          lastUpdated: new Date().toISOString()
        }
      }
    });
  }, 'Get Popular Services'),

  // ============== CATEGORÍAS DE SERVICIOS ==============
  getServiceCategories: controllerHandler(async (req, res) => {
    const { 
      businessType, 
      includeCount = true, 
      onlyActive = true 
    } = req.query;

    const pipeline = [];

    // Match inicial
    const matchStage = {};
    if (onlyActive === 'true') {
      matchStage.isActive = true;
      matchStage.isPublic = true;
    }

    if (matchStage.isActive) {
      pipeline.push({ $match: matchStage });

      // Lookup con business para filtrar por tipo
      pipeline.push({
        $lookup: {
          from: 'businesses',
          localField: 'business',
          foreignField: '_id',
          as: 'businessInfo'
        }
      });

      pipeline.push({ $unwind: '$businessInfo' });

      // Filtrar por negocio activo y tipo
      const businessMatch = { 'businessInfo.status': 'active' };
      if (businessType) {
        businessMatch['businessInfo.businessType'] = businessType;
      }
      pipeline.push({ $match: businessMatch });
    }

    // Agrupar por categoría
    pipeline.push({
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        averagePrice: { $avg: '$price' },
        averageDuration: { $avg: '$duration' },
        services: includeCount === 'true' ? { $push: '$$ROOT' } : null
      }
    });

    // Filtrar categorías vacías
    pipeline.push({
      $match: { _id: { $ne: null, $ne: '' } }
    });

    // Proyección final
    pipeline.push({
      $project: {
        name: '$_id',
        slug: {
          $toLower: {
            $replaceAll: {
              input: { $replaceAll: { input: '$_id', find: ' ', replacement: '-' } },
              find: 'á', replacement: 'a'
            }
          }
        },
        count: includeCount === 'true' ? '$count' : { $literal: null },
        averagePrice: { $round: ['$averagePrice', 0] },
        averageDuration: { $round: ['$averageDuration', 0] },
        popularity: { $divide: ['$count', 100] } // Normalizar popularidad
      }
    });

    // Ordenar por popularidad
    pipeline.push({
      $sort: { count: -1, name: 1 }
    });

    const categories = await Service.aggregate(pipeline);

    // Agregar información adicional a las categorías
    const enrichedCategories = categories.map(category => ({
      ...category,
      description: getCategoryDescription(category.name),
      icon: getCategoryIcon(category.name),
      businessTypes: getBusinessTypesForCategory(category.name)
    }));

    // Calcular resumen
    const summary = {
      totalCategories: categories.length,
      totalServices: categories.reduce((sum, cat) => sum + (cat.count || 0), 0),
      mostPopularCategory: categories[0]?.name || null,
      priceRange: {
        min: Math.min(...categories.map(cat => cat.averagePrice)),
        max: Math.max(...categories.map(cat => cat.averagePrice)),
        average: Math.round(categories.reduce((sum, cat) => sum + cat.averagePrice, 0) / categories.length)
      }
    };

    logger.info('Categorías de servicios obtenidas', {
      categoriesFound: categories.length,
      businessType,
      includeCount,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: {
        categories: enrichedCategories,
        summary
      }
    });
  }, 'Get Service Categories')
};

// ============== FUNCIONES AUXILIARES ==============

// Función para obtener descripción de categoría
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
    'Extensiones': 'Aplicación de extensiones de cabello'
  };
  
  return descriptions[categoryName] || `Servicios de ${categoryName.toLowerCase()}`;
};

// Función para obtener icono de categoría
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
    'Extensiones': '💁'
  };
  
  return icons[categoryName] || '✨';
};

// Función para obtener tipos de negocio por categoría
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
    'Extensiones': ['salon_belleza']
  };
  
  return businessTypes[categoryName] || ['salon_belleza'];
};

export default serviceController;