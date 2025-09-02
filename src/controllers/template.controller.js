// src/controllers/template.controller.js
import Template from '../models/template.js';
import Business from '../models/business.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  throwIfNotFound,
  throwIf
} from '../middleware/errorHandler.js';
import { constants, logger } from '../config/index.js';

const { 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES, 
  TEMPLATE_CATEGORIES,
  BUSINESS_TYPES,
  VALIDATION_PATTERNS 
} = constants;

// ============== CREAR TEMPLATE ==============
export const createTemplate = asyncHandler(async (req, res) => {
  const { 
    name, 
    description, 
    category,
    businessType,
    colors = {},
    typography = {},
    layout = {},
    sections = [],
    isPublic = false,
    isPremium = false,
    tags = []
  } = req.body;

  // Validaciones básicas
  throwIf(!name?.trim(), 'El nombre del template es requerido');
  throwIf(!category, 'La categoría del template es requerida');

  // Verificar que la categoría sea válida
  throwIf(
    !Object.values(TEMPLATE_CATEGORIES).includes(category),
    `Categoría inválida. Debe ser: ${Object.values(TEMPLATE_CATEGORIES).join(', ')}`
  );

  // Verificar que el businessType sea válido si se proporciona
  if (businessType && !Object.values(BUSINESS_TYPES).includes(businessType)) {
    throw new ValidationError(`Tipo de negocio inválido. Debe ser: ${Object.values(BUSINESS_TYPES).join(', ')}`);
  }

  // Verificar que no exista un template con el mismo nombre para este usuario
  const existingTemplate = await Template.findOne({ 
    owner: req.user.id, 
    name: name.trim() 
  });
  throwIf(existingTemplate, 'Ya tienes un template con este nombre');

  // Configuraciones por defecto
  const defaultColors = {
    primary: '#3B82F6',
    secondary: '#64748B',
    accent: '#10B981',
    background: '#FFFFFF',
    text: '#1F2937',
    ...colors
  };

  const defaultTypography = {
    primaryFont: 'Inter, sans-serif',
    headingFont: 'Montserrat, sans-serif',
    fontSize: {
      base: '16px',
      heading: '24px',
      small: '14px'
    },
    ...typography
  };

  const defaultLayout = {
    container: 'full-width',
    header: 'centered',
    navigation: 'horizontal',
    footer: 'simple',
    ...layout
  };

  // Secciones por defecto si no se proporcionan
  const defaultSections = sections.length > 0 ? sections : [
    { id: 'header', name: 'Encabezado', type: 'header', isVisible: true, order: 1, config: {} },
    { id: 'hero', name: 'Sección Principal', type: 'hero', isVisible: true, order: 2, config: {} },
    { id: 'services', name: 'Servicios', type: 'services', isVisible: true, order: 3, config: {} },
    { id: 'about', name: 'Acerca de', type: 'about', isVisible: true, order: 4, config: {} },
    { id: 'contact', name: 'Contacto', type: 'contact', isVisible: true, order: 5, config: {} },
    { id: 'footer', name: 'Pie de página', type: 'footer', isVisible: true, order: 6, config: {} }
  ];

  const templateData = {
    name: name.trim(),
    description: description?.trim() || '',
    category,
    businessType,
    owner: req.user.id,
    colors: defaultColors,
    typography: defaultTypography,
    layout: defaultLayout,
    sections: defaultSections,
    isPublic: isPublic && req.user.role === 'admin', // Solo admins pueden crear templates públicos
    isPremium,
    tags: tags.filter(tag => tag && tag.trim()).map(tag => tag.trim()),
    usage: {
      timesUsed: 0,
      rating: 0,
      reviewCount: 0
    }
  };

  const template = new Template(templateData);
  await template.save();

  logger.info('Template creado', { 
    templateId: template._id, 
    ownerId: req.user.id,
    templateName: template.name,
    category: template.category,
    ip: req.ip 
  });

  res.status(201).json({
    success: true,
    message: 'Template creado exitosamente',
    data: {
      template: {
        id: template._id,
        name: template.name,
        category: template.category,
        isPublic: template.isPublic,
        isPremium: template.isPremium
      }
    }
  });
});

// ============== OBTENER TEMPLATES PÚBLICOS ==============
export const getPublicTemplates = asyncHandler(async (req, res) => {
  const { 
    category, 
    businessType, 
    search,
    sort = 'popular',
    page = 1, 
    limit = 20 
  } = req.query;

  const filters = {
    isPublic: true,
    isActive: true
  };

  if (category) filters.category = category;
  if (businessType) filters.businessType = businessType;
  if (search) {
    filters.$text = { $search: search };
  }

  let sortOptions = {};
  switch (sort) {
    case 'popular':
      sortOptions = { 'usage.timesUsed': -1, 'usage.rating': -1 };
      break;
    case 'rating':
      sortOptions = { 'usage.rating': -1, 'usage.reviewCount': -1 };
      break;
    case 'newest':
      sortOptions = { createdAt: -1 };
      break;
    case 'name':
      sortOptions = { name: 1 };
      break;
    default:
      sortOptions = { 'usage.timesUsed': -1 };
  }

  const skip = (page - 1) * limit;
  
  const [templates, total] = await Promise.all([
    Template.find(filters)
      .select('name description category businessType colors previewImage usage tags createdAt')
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit)),
    Template.countDocuments(filters)
  ]);

  res.json({
    success: true,
    data: {
      templates,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// ============== OBTENER MIS TEMPLATES ==============
export const getMyTemplates = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const [templates, total] = await Promise.all([
    Template.find({ owner: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Template.countDocuments({ owner: req.user.id })
  ]);

  res.json({
    success: true,
    data: {
      templates,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// ============== OBTENER TEMPLATE POR ID ==============
export const getTemplateById = asyncHandler(async (req, res) => {
  const template = await Template.findById(req.params.templateId)
    .populate('owner', 'fullName email');

  throwIfNotFound(template, 'Template no encontrado');

  // Verificar permisos: debe ser público o del usuario actual
  const canView = template.isPublic || 
                  template.owner._id.toString() === req.user?.id ||
                  req.user?.role === 'admin';

  throwIf(!canView, 'No tienes permisos para ver este template');

  res.json({
    success: true,
    data: { template }
  });
});

// ============== ACTUALIZAR TEMPLATE ==============
export const updateTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findById(req.params.templateId);
  throwIfNotFound(template, 'Template no encontrado');

  // Verificar permisos
  const canEdit = template.owner.toString() === req.user.id || req.user.role === 'admin';
  throwIf(!canEdit, 'No tienes permisos para editar este template');

  const {
    name,
    description,
    colors,
    typography,
    layout,
    sections,
    tags,
    isPublic,
    isPremium
  } = req.body;

  // Actualizar campos permitidos
  if (name && name.trim() !== template.name) {
    // Verificar que no exista otro template con este nombre
    const existingTemplate = await Template.findOne({ 
      owner: req.user.id, 
      name: name.trim(),
      _id: { $ne: template._id }
    });
    throwIf(existingTemplate, 'Ya tienes un template con este nombre');
    
    template.name = name.trim();
  }

  if (description !== undefined) template.description = description.trim();
  if (colors) template.colors = { ...template.colors, ...colors };
  if (typography) template.typography = { ...template.typography, ...typography };
  if (layout) template.layout = { ...template.layout, ...layout };
  if (sections) template.sections = sections;
  if (tags) template.tags = tags.filter(tag => tag && tag.trim()).map(tag => tag.trim());

  // Solo admins pueden cambiar isPublic
  if (isPublic !== undefined && req.user.role === 'admin') {
    template.isPublic = isPublic;
  }

  if (isPremium !== undefined) template.isPremium = isPremium;

  await template.save();

  logger.info('Template actualizado', { 
    templateId: template._id, 
    ownerId: req.user.id,
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Template actualizado exitosamente',
    data: { template }
  });
});

// ============== ELIMINAR TEMPLATE ==============
export const deleteTemplate = asyncHandler(async (req, res) => {
  const template = await Template.findById(req.params.templateId);
  throwIfNotFound(template, 'Template no encontrado');

  // Verificar permisos
  const canDelete = template.owner.toString() === req.user.id || req.user.role === 'admin';
  throwIf(!canDelete, 'No tienes permisos para eliminar este template');

  // No permitir eliminar templates que están siendo usados
  const businessesUsingTemplate = await Business.countDocuments({ templateId: template._id });
  
  throwIf(businessesUsingTemplate > 0, 
    `No se puede eliminar el template porque está siendo usado por ${businessesUsingTemplate} negocio(s)`);

  await template.deleteOne();

  logger.info('Template eliminado', { 
    templateId: template._id, 
    ownerId: req.user.id,
    templateName: template.name,
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Template eliminado exitosamente'
  });
});

// ============== DUPLICAR TEMPLATE ==============
export const duplicateTemplate = asyncHandler(async (req, res) => {
  const sourceTemplate = await Template.findById(req.params.templateId);
  throwIfNotFound(sourceTemplate, 'Template no encontrado');

  // Verificar que el template sea público o del usuario
  const canDuplicate = sourceTemplate.isPublic || 
                      sourceTemplate.owner.toString() === req.user.id ||
                      req.user.role === 'admin';

  throwIf(!canDuplicate, 'No tienes permisos para duplicar este template');

  const { name } = req.body;
  const newName = name?.trim() || `${sourceTemplate.name} (Copia)`;

  // Verificar que no exista un template con este nombre
  const existingTemplate = await Template.findOne({ 
    owner: req.user.id, 
    name: newName 
  });
  throwIf(existingTemplate, 'Ya tienes un template con este nombre');

  const duplicatedTemplate = await sourceTemplate.duplicate(newName, req.user.id);

  logger.info('Template duplicado', { 
    sourceTemplateId: sourceTemplate._id,
    newTemplateId: duplicatedTemplate._id,
    ownerId: req.user.id,
    ip: req.ip 
  });

  res.status(201).json({
    success: true,
    message: 'Template duplicado exitosamente',
    data: { template: duplicatedTemplate }
  });
});

// ============== CREAR TEMPLATE POR DEFECTO DEL SISTEMA ==============
export const createSystemDefaultTemplate = asyncHandler(async (req, res) => {
  // Solo admins pueden crear templates del sistema
  throwIf(req.user.role !== 'admin', 'Solo administradores pueden crear templates del sistema');

  const { businessType } = req.body;

  // Verificar si ya existe un template por defecto para este tipo de negocio
  const existingDefault = await Template.findOne({
    isDefault: true,
    businessType: businessType || { $exists: false }
  });

  if (existingDefault) {
    return res.json({
      success: true,
      message: 'Template por defecto ya existe',
      data: { template: existingDefault }
    });
  }

  const defaultTemplate = new Template({
    name: businessType ? `Template ${businessType.charAt(0).toUpperCase() + businessType.slice(1)}` : 'Template Universal',
    description: `Template por defecto del sistema${businessType ? ` para ${businessType}s` : ''}`,
    category: 'modern',
    businessType: businessType || null,
    owner: req.user.id,
    isPublic: true,
    isActive: true,
    isDefault: true,
    colors: {
      primary: '#3B82F6',
      secondary: '#64748B',
      accent: '#10B981',
      background: '#FFFFFF',
      text: '#1F2937'
    },
    typography: {
      primaryFont: 'Inter, sans-serif',
      headingFont: 'Montserrat, sans-serif'
    },
    layout: {
      container: 'full-width',
      header: 'centered',
      navigation: 'horizontal',
      footer: 'simple'
    },
    sections: [
      { id: 'header', name: 'Encabezado', type: 'header', isVisible: true, order: 1, config: {} },
      { id: 'hero', name: 'Sección Principal', type: 'hero', isVisible: true, order: 2, config: {} },
      { id: 'services', name: 'Servicios', type: 'services', isVisible: true, order: 3, config: {} },
      { id: 'about', name: 'Acerca de', type: 'about', isVisible: true, order: 4, config: {} },
      { id: 'contact', name: 'Contacto', type: 'contact', isVisible: true, order: 5, config: {} },
      { id: 'footer', name: 'Pie de página', type: 'footer', isVisible: true, order: 6, config: {} }
    ]
  });

  await defaultTemplate.save();

  logger.info('Template del sistema creado', { 
    templateId: defaultTemplate._id,
    businessType,
    adminId: req.user.id,
    ip: req.ip 
  });

  res.status(201).json({
    success: true,
    message: 'Template del sistema creado exitosamente',
    data: { template: defaultTemplate }
  });
});

// ============== OBTENER TEMPLATE POR DEFECTO ==============
export const getDefaultTemplate = asyncHandler(async (req, res) => {
  const { businessType } = req.query;

  let filter = {
    isDefault: true,
    isActive: true,
    isPublic: true
  };

  // Si se especifica un tipo de negocio, buscar template específico primero
  if (businessType) {
    filter.businessType = businessType;
  }

  let template = await Template.findOne(filter);

  // Si no hay template específico para el tipo de negocio, buscar el universal
  if (!template && businessType) {
    template = await Template.findOne({
      isDefault: true,
      isActive: true,
      isPublic: true,
      businessType: null // Template universal
    });
  }

  throwIfNotFound(template, 'No hay template por defecto disponible');

  res.json({
    success: true,
    data: { template }
  });
});

// ============== MARCAR TEMPLATE COMO USADO ==============
export const markTemplateAsUsed = asyncHandler(async (req, res) => {
  const template = await Template.findById(req.params.templateId);
  throwIfNotFound(template, 'Template no encontrado');

  await template.markAsUsed();

  res.json({
    success: true,
    message: 'Template marcado como usado',
    data: {
      timesUsed: template.usage.timesUsed,
      lastUsed: template.usage.lastUsed
    }
  });
});

export default {
  createTemplate,
  getPublicTemplates,
  getMyTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  createSystemDefaultTemplate,
  getDefaultTemplate,
  markTemplateAsUsed
};