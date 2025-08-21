// controllers/template.controller.js
import Template from '../models/template.js';
import Business from '../models/business.js';
import { controllerHandler } from '../middleware/asyncHandler.js';
import { logger } from '../middleware/logger.js';

export const templateController = {
  // ============== OBTENER TEMPLATES ==============
  
  // Obtener todos los templates públicos/disponibles
  getAllTemplates: controllerHandler(async (req, res) => {
    const {
      category,
      businessType,
      isPremium,
      search,
      page = 1,
      limit = 10,
      sortBy = 'usage.timesUsed',
      sortOrder = 'desc'
    } = req.query;

    // Construir filtros
    const filters = {
      isActive: true,
      $or: [
        { isPublic: true },
        { owner: req.user?.id } // Templates propios del usuario autenticado
      ]
    };

    if (category) filters.category = category;
    if (businessType) filters.businessType = businessType;
    if (isPremium !== undefined) filters.isPremium = isPremium === 'true';

    // Filtro de búsqueda por texto
    if (search) {
      filters.$text = { $search: search };
    }

    // Configurar ordenamiento
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Ejecutar consulta con paginación
    const skip = (page - 1) * limit;
    const [templates, total] = await Promise.all([
      Template.find(filters)
        .sort(sortConfig)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('owner', 'username fullName')
        .lean(),
      Template.countDocuments(filters)
    ]);

    logger.info('Templates obtenidos', {
      count: templates.length,
      total,
      filters,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      }
    });
  }, 'Get All Templates'),

  // Obtener template por ID
  getTemplateById: controllerHandler(async (req, res) => {
    const { id } = req.params;
    
    const template = await Template.findById(id)
      .populate('owner', 'username fullName')
      .lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado'
      });
    }

    // Verificar permisos de acceso
    if (!template.isPublic && 
        template.owner._id.toString() !== req.user?.id && 
        req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para acceder a este template'
      });
    }

    logger.info('Template obtenido por ID', {
      templateId: id,
      templateName: template.name,
      userId: req.user?.id
    });

    res.json({
      success: true,
      data: { template }
    });
  }, 'Get Template By ID'),

  // Obtener templates por categoría
  getTemplatesByCategory: controllerHandler(async (req, res) => {
    const { category } = req.params;
    const { limit = 12 } = req.query;

    const templates = await Template.find({
      category,
      isActive: true,
      isPublic: true
    })
    .sort({ 'usage.timesUsed': -1, 'usage.rating': -1 })
    .limit(parseInt(limit))
    .populate('owner', 'username fullName')
    .lean();

    res.json({
      success: true,
      data: { 
        templates,
        category,
        count: templates.length
      }
    });
  }, 'Get Templates By Category'),

  // Obtener templates populares/destacados
  getFeaturedTemplates: controllerHandler(async (req, res) => {
    const { limit = 6 } = req.query;

    const templates = await Template.find({
      isActive: true,
      isPublic: true,
      'usage.timesUsed': { $gte: 5 }, // Al menos 5 usos
      'usage.rating': { $gte: 4.0 }   // Rating >= 4.0
    })
    .sort({ 
      'usage.rating': -1, 
      'usage.timesUsed': -1 
    })
    .limit(parseInt(limit))
    .populate('owner', 'username fullName')
    .lean();

    res.json({
      success: true,
      data: { templates }
    });
  }, 'Get Featured Templates'),

  // ============== CREAR TEMPLATES ==============
  
  // Crear nuevo template
  createTemplate: controllerHandler(async (req, res) => {
    const {
      name,
      description,
      category,
      businessType,
      isPublic = false,
      isPremium = false,
      colors,
      typography,
      layout,
      sections,
      customCSS,
      tags
    } = req.body;

    // Verificar que el usuario puede crear templates
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para crear templates'
      });
    }

    // Verificar si ya existe un template con el mismo nombre para este usuario
    const existingTemplate = await Template.findOne({
      name,
      owner: req.user.id
    });

    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        error: 'Ya tienes un template con este nombre'
      });
    }

    // Crear el template
    const template = await Template.create({
      name,
      description,
      category,
      businessType,
      owner: req.user.id,
      isPublic: req.user.role === 'admin' ? isPublic : false, // Solo admins pueden hacer templates públicos
      isPremium: req.user.role === 'admin' ? isPremium : false,
      colors,
      typography,
      layout,
      sections,
      customCSS,
      tags: tags || []
    });

    await template.populate('owner', 'username fullName');

    logger.success('Template creado exitosamente', {
      templateId: template._id,
      templateName: template.name,
      ownerId: req.user.id,
      category: template.category
    });

    res.status(201).json({
      success: true,
      data: { template }
    });
  }, 'Create Template'),

  // ============== ACTUALIZAR TEMPLATES ==============
  
  // Actualizar template
  updateTemplate: controllerHandler(async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    // Buscar el template
    const template = await Template.findById(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado'
      });
    }

    // Verificar permisos
    if (template.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este template'
      });
    }

    // Campos que solo pueden modificar los admins
    if (req.user.role !== 'admin') {
      delete updateData.isPublic;
      delete updateData.isPremium;
      delete updateData.owner;
    }

    // Actualizar el template
    const updatedTemplate = await Template.findByIdAndUpdate(
      id,
      { 
        ...updateData,
        updatedAt: new Date()
      },
      { 
        new: true, 
        runValidators: true 
      }
    ).populate('owner', 'username fullName');

    logger.info('Template actualizado', {
      templateId: id,
      templateName: updatedTemplate.name,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: { template: updatedTemplate }
    });
  }, 'Update Template'),

  // ============== USAR TEMPLATE ==============
  
  // Aplicar template a un negocio
  applyTemplateTousiness: controllerHandler(async (req, res) => {
    const { templateId, businessId } = req.params;
    const { customizations = {} } = req.body;

    // Verificar que el template existe y es accesible
    const template = await Template.findById(templateId);
    if (!template || !template.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado o inactivo'
      });
    }

    // Verificar acceso al template
    if (!template.isPublic && 
        template.owner.toString() !== req.user.id && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este template'
      });
    }

    // Verificar que el negocio existe y pertenece al usuario
    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'Negocio no encontrado'
      });
    }

    if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para modificar este negocio'
      });
    }

    // Aplicar el template al negocio
    const templateConfig = {
      templateId: template._id,
      colors: { ...template.colors, ...customizations.colors },
      typography: { ...template.typography, ...customizations.typography },
      layout: { ...template.layout, ...customizations.layout },
      sections: customizations.sections || template.sections,
      customCSS: customizations.customCSS || template.customCSS,
      appliedAt: new Date()
    };

    business.design = templateConfig;
    await business.save();

    // Marcar el template como usado
    await template.markAsUsed();

    logger.success('Template aplicado al negocio', {
      templateId,
      templateName: template.name,
      businessId,
      businessName: business.name,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        business,
        template: {
          id: template._id,
          name: template.name,
          category: template.category
        }
      }
    });
  }, 'Apply Template To Business'),

  // ============== GESTIÓN DE TEMPLATES ==============
  
  // Duplicar template
  duplicateTemplate: controllerHandler(async (req, res) => {
    const { id } = req.params;
    const { newName } = req.body;

    // Buscar el template original
    const originalTemplate = await Template.findById(id);
    if (!originalTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado'
      });
    }

    // Verificar acceso
    if (!originalTemplate.isPublic && 
        originalTemplate.owner.toString() !== req.user.id && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes acceso a este template'
      });
    }

    // Crear una copia
    const templateData = originalTemplate.toObject();
    delete templateData._id;
    delete templateData.createdAt;
    delete templateData.updatedAt;
    delete templateData.usage;

    const duplicatedTemplate = await Template.create({
      ...templateData,
      name: newName || `${originalTemplate.name} - Copia`,
      owner: req.user.id,
      isPublic: false, // Las copias no son públicas por defecto
      isPremium: false
    });

    await duplicatedTemplate.populate('owner', 'username fullName');

    logger.success('Template duplicado', {
      originalId: id,
      newId: duplicatedTemplate._id,
      newName: duplicatedTemplate.name,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: { template: duplicatedTemplate }
    });
  }, 'Duplicate Template'),

  // Eliminar template
  deleteTemplate: controllerHandler(async (req, res) => {
    const { id } = req.params;

    const template = await Template.findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado'
      });
    }

    // Verificar permisos
    if (template.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para eliminar este template'
      });
    }

    // Verificar si el template está siendo usado
    const businessesUsingTemplate = await Business.countDocuments({
      'design.templateId': id
    });

    if (businessesUsingTemplate > 0) {
      // Soft delete - marcar como inactivo en lugar de eliminar
      await Template.findByIdAndUpdate(id, { isActive: false });
      
      logger.warn('Template marcado como inactivo (en uso)', {
        templateId: id,
        businessesUsing: businessesUsingTemplate,
        userId: req.user.id
      });

      return res.json({
        success: true,
        message: 'Template marcado como inactivo debido a que está en uso',
        data: { businessesAffected: businessesUsingTemplate }
      });
    }

    // Eliminación permanente si no está en uso
    await Template.findByIdAndDelete(id);

    logger.success('Template eliminado permanentemente', {
      templateId: id,
      userId: req.user.id
    });

    res.json({
      success: true,
      message: 'Template eliminado exitosamente'
    });
  }, 'Delete Template'),

  // ============== RATING Y FEEDBACK ==============
  
  // Calificar template
  rateTemplate: controllerHandler(async (req, res) => {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'La calificación debe estar entre 1 y 5'
      });
    }

    const template = await Template.findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado'
      });
    }

    // Verificar que el usuario haya usado el template
    const hasUsedTemplate = await Business.findOne({
      owner: req.user.id,
      'design.templateId': id
    });

    if (!hasUsedTemplate) {
      return res.status(403).json({
        success: false,
        error: 'Solo puedes calificar templates que hayas usado'
      });
    }

    // Verificar si ya calificó
    const existingRatingIndex = template.usage.ratings.findIndex(
      r => r.user.toString() === req.user.id
    );

    if (existingRatingIndex !== -1) {
      // Actualizar calificación existente
      template.usage.ratings[existingRatingIndex] = {
        user: req.user.id,
        rating,
        feedback,
        createdAt: new Date()
      };
    } else {
      // Agregar nueva calificación
      template.usage.ratings.push({
        user: req.user.id,
        rating,
        feedback,
        createdAt: new Date()
      });
    }

    // Recalcular rating promedio
    const totalRatings = template.usage.ratings.length;
    const sumRatings = template.usage.ratings.reduce((sum, r) => sum + r.rating, 0);
    template.usage.rating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    await template.save();

    logger.success('Template calificado', {
      templateId: id,
      rating,
      newAverage: template.usage.rating,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        rating: template.usage.rating,
        totalRatings: totalRatings,
        userRating: rating
      }
    });
  }, 'Rate Template'),

  // ============== ESTADÍSTICAS ==============
  
  // Obtener estadísticas de templates
  getTemplateStats: controllerHandler(async (req, res) => {
    const { id } = req.params;

    const template = await Template.findById(id);
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template no encontrado'
      });
    }

    // Verificar permisos
    if (template.owner.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para ver estas estadísticas'
      });
    }

    // Obtener estadísticas de uso
    const businessesUsing = await Business.countDocuments({
      'design.templateId': id
    });

    const recentUsage = await Business.aggregate([
      { $match: { 'design.templateId': mongoose.Types.ObjectId(id) } },
      { 
        $group: {
          _id: {
            year: { $year: '$design.appliedAt' },
            month: { $month: '$design.appliedAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.json({
      success: true,
      data: {
        template: {
          id: template._id,
          name: template.name,
          category: template.category
        },
        stats: {
          timesUsed: template.usage.timesUsed,
          currentlyUsing: businessesUsing,
          rating: template.usage.rating,
          totalRatings: template.usage.ratings.length,
          lastUsed: template.usage.lastUsed,
          recentUsageByMonth: recentUsage
        }
      }
    });
  }, 'Get Template Stats')
};

export default templateController;