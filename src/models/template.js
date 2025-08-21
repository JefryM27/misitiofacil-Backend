import mongoose from 'mongoose';
import { constants } from '../config/index.js';

const {
  TEMPLATE_CATEGORIES,
  THEME_COLORS,
  BUSINESS_TYPES,
  VALIDATION_PATTERNS,
  USER_ROLES
} = constants;

// Schema para configuración de colores del template
const colorConfigSchema = new mongoose.Schema({
  primary: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color primario debe ser hexadecimal válido'],
    default: '#3B82F6'
  },
  secondary: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color secundario debe ser hexadecimal válido'],
    default: '#64748B'
  },
  accent: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color de acento debe ser hexadecimal válido'],
    default: '#10B981'
  },
  background: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color de fondo debe ser hexadecimal válido'],
    default: '#FFFFFF'
  },
  text: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color de texto debe ser hexadecimal válido'],
    default: '#1F2937'
  }
}, { _id: false });

// Schema para configuración tipográfica
const typographyConfigSchema = new mongoose.Schema({
  primaryFont: {
    type: String,
    enum: [
      'Inter, sans-serif',
      'Roboto, sans-serif', 
      'Open Sans, sans-serif',
      'Lato, sans-serif',
      'Montserrat, sans-serif',
      'Poppins, sans-serif',
      'Nunito, sans-serif',
      'Source Sans Pro, sans-serif'
    ],
    default: 'Inter, sans-serif'
  },
  headingFont: {
    type: String,
    enum: [
      'Inter, sans-serif',
      'Roboto, sans-serif',
      'Montserrat, sans-serif',
      'Poppins, sans-serif',
      'Playfair Display, serif',
      'Merriweather, serif',
      'Lora, serif'
    ],
    default: 'Montserrat, sans-serif'
  },
  fontSize: {
    base: { type: Number, default: 16, min: 12, max: 24 },
    heading: { type: Number, default: 32, min: 20, max: 48 }
  }
}, { _id: false });

// Schema para configuración de layout
const layoutConfigSchema = new mongoose.Schema({
  layout: {
    type: String,
    enum: ['single-page', 'multi-section', 'grid', 'carousel'],
    default: 'single-page'
  },
  headerStyle: {
    type: String,
    enum: ['centered', 'left-aligned', 'hero', 'minimal'],
    default: 'centered'
  },
  showLogo: { type: Boolean, default: true },
  showCover: { type: Boolean, default: true },
  showServices: { type: Boolean, default: true },
  showGallery: { type: Boolean, default: true },
  showContact: { type: Boolean, default: true },
  showSocialMedia: { type: Boolean, default: true },
  showReservationButton: { type: Boolean, default: true }
}, { _id: false });

// Schema para secciones personalizables
const sectionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 50 },
  type: {
    type: String,
    enum: ['header', 'services', 'gallery', 'about', 'contact', 'custom'],
    required: true
  },
  isVisible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { _id: false });

const templateSchema = new mongoose.Schema({
  // Información básica
  name: {
    type: String,
    required: [true, 'El nombre de la plantilla es obligatorio'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres'],
    minlength: [3, 'El nombre debe tener al menos 3 caracteres']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres'],
    default: ''
  },
  
  // Categoría del template
  category: {
    type: String,
    enum: {
      values: Object.values(TEMPLATE_CATEGORIES),
      message: `Categoría debe ser una de: ${Object.values(TEMPLATE_CATEGORIES).join(', ')}`
    },
    default: TEMPLATE_CATEGORIES.MODERN,
    index: true
  },
  
  // Tipo de negocio para el que está optimizado
  businessType: {
    type: String,
    enum: Object.values(BUSINESS_TYPES),
    index: true
  },
  
  // Propietario del template
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'La plantilla debe tener un propietario'],
    index: true
  },
  
  // Estado del template
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  isPublic: {
    type: Boolean,
    default: false // Solo templates del sistema son públicos por defecto
  },
  
  isPremium: {
    type: Boolean,
    default: false
  },
  
  // Imagen de vista previa
  previewImage: {
    url: { type: String, trim: true },
    filename: { type: String, trim: true },
    uploadedAt: { type: Date }
  },
  
  // Configuración visual del template
  colors: {
    type: colorConfigSchema,
    default: () => ({})
  },
  
  typography: {
    type: typographyConfigSchema,
    default: () => ({})
  },
  
  layout: {
    type: layoutConfigSchema,
    default: () => ({})
  },
  
  // Secciones del template
  sections: {
    type: [sectionSchema],
    default: function() {
      return [
        {
          id: 'header',
          name: 'Encabezado',
          type: 'header',
          isVisible: true,
          order: 1,
          config: {
            showLogo: true,
            showNavigation: false,
            style: 'centered'
          }
        },
        {
          id: 'services',
          name: 'Servicios',
          type: 'services',
          isVisible: true,
          order: 2,
          config: {
            displayStyle: 'grid',
            showPrices: true,
            showDuration: true
          }
        },
        {
          id: 'gallery',
          name: 'Galería',
          type: 'gallery',
          isVisible: true,
          order: 3,
          config: {
            displayStyle: 'masonry',
            maxImages: 9
          }
        },
        {
          id: 'contact',
          name: 'Contacto',
          type: 'contact',
          isVisible: true,
          order: 4,
          config: {
            showMap: false,
            showHours: true,
            showSocialMedia: true
          }
        }
      ];
    }
  },
  
  // Configuración avanzada (CSS personalizado, etc.)
  customCSS: {
    type: String,
    maxlength: [10000, 'CSS personalizado no puede exceder 10,000 caracteres'],
    trim: true
  },
  
  customJS: {
    type: String,
    maxlength: [5000, 'JavaScript personalizado no puede exceder 5,000 caracteres'],
    trim: true
  },
  
  // Metadatos y estadísticas
  usage: {
    timesUsed: { type: Number, default: 0 },
    lastUsed: { type: Date },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 }
  },
  
  // Configuración SEO por defecto
  seoDefaults: {
    metaTitle: { type: String, maxlength: 60 },
    metaDescription: { type: String, maxlength: 160 },
    keywords: [{ type: String, maxlength: 50 }]
  },
  
  // Configuración de accesibilidad
  accessibility: {
    highContrast: { type: Boolean, default: false },
    largeText: { type: Boolean, default: false },
    altTextRequired: { type: Boolean, default: true }
  },
  
  // Versión del template (para actualizaciones)
  version: {
    type: String,
    default: '1.0.0',
    match: /^\d+\.\d+\.\d+$/
  },
  
  // Tags para búsqueda y categorización
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  
  // Información del creador (para templates del sistema)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Notas internas
  notes: {
    type: String,
    maxlength: [1000, 'Las notas no pueden exceder 1000 caracteres'],
    trim: true
  }
  
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// ============== VIRTUALS ==============

// Virtual para obtener el nombre de la categoría
templateSchema.virtual('categoryName').get(function() {
  const categoryNames = {
    [TEMPLATE_CATEGORIES.MODERN]: 'Moderno',
    [TEMPLATE_CATEGORIES.CLASSIC]: 'Clásico',
    [TEMPLATE_CATEGORIES.MINIMAL]: 'Minimalista',
    [TEMPLATE_CATEGORIES.CREATIVE]: 'Creativo',
    [TEMPLATE_CATEGORIES.PROFESSIONAL]: 'Profesional'
  };
  return categoryNames[this.category] || this.category;
});

// Virtual para verificar si es template del sistema
templateSchema.virtual('isSystemTemplate').get(function() {
  // Los templates del sistema no tienen owner específico o tienen un admin como owner
  return !this.owner || this.isPublic;
});

// Virtual para obtener configuración completa
templateSchema.virtual('fullConfig').get(function() {
  return {
    colors: this.colors,
    typography: this.typography,
    layout: this.layout,
    sections: this.sections.sort((a, b) => a.order - b.order)
  };
});

// ============== ÍNDICES ==============

// Índices para mejorar rendimiento
templateSchema.index({ owner: 1, name: 1 }, { unique: true });
templateSchema.index({ category: 1, isActive: 1 });
templateSchema.index({ businessType: 1, isActive: 1 });
templateSchema.index({ isPublic: 1, isActive: 1 });
templateSchema.index({ isPremium: 1, isActive: 1 });
templateSchema.index({ 'usage.timesUsed': -1 });
templateSchema.index({ 'usage.rating': -1 });
templateSchema.index({ createdAt: -1 });

// Índice de texto para búsquedas
templateSchema.index({ 
  name: 'text', 
  description: 'text',
  tags: 'text'
}, { 
  weights: { 
    name: 10, 
    description: 5,
    tags: 3
  },
  name: 'template_search_index'
});

// ============== MIDDLEWARE ==============

// Validar que las secciones tengan orden único
templateSchema.pre('save', function(next) {
  const orders = this.sections.map(section => section.order);
  const uniqueOrders = [...new Set(orders)];
  
  if (orders.length !== uniqueOrders.length) {
    return next(new Error('Las secciones deben tener orden único'));
  }
  
  next();
});

// Actualizar lastUsed cuando se incrementa timesUsed
templateSchema.pre('save', function(next) {
  if (this.isModified('usage.timesUsed')) {
    this.usage.lastUsed = new Date();
  }
  next();
});

// ============== MÉTODOS DE INSTANCIA ==============

// Método para marcar como usado
templateSchema.methods.markAsUsed = async function() {
  this.usage.timesUsed += 1;
  this.usage.lastUsed = new Date();
  return this.save();
};

// Método para agregar rating
templateSchema.methods.addRating = async function(rating) {
  const currentTotal = this.usage.rating * this.usage.reviewCount;
  this.usage.reviewCount += 1;
  this.usage.rating = (currentTotal + rating) / this.usage.reviewCount;
  
  return this.save();
};

// Método para duplicar template
templateSchema.methods.duplicate = async function(newName, newOwner) {
  const templateData = this.toObject();
  delete templateData._id;
  delete templateData.createdAt;
  delete templateData.updatedAt;
  delete templateData.__v;
  
  templateData.name = newName || `${this.name} (Copia)`;
  templateData.owner = newOwner;
  templateData.isPublic = false;
  templateData.usage = {
    timesUsed: 0,
    rating: 0,
    reviewCount: 0
  };
  
  return this.constructor.create(templateData);
};

// Método para obtener secciones ordenadas
templateSchema.methods.getOrderedSections = function() {
  return this.sections.sort((a, b) => a.order - b.order);
};

// Método para agregar sección
templateSchema.methods.addSection = function(sectionData) {
  const maxOrder = Math.max(...this.sections.map(s => s.order), 0);
  
  const newSection = {
    id: sectionData.id || `section_${Date.now()}`,
    name: sectionData.name,
    type: sectionData.type,
    isVisible: sectionData.isVisible !== false,
    order: sectionData.order || maxOrder + 1,
    config: sectionData.config || {}
  };
  
  this.sections.push(newSection);
  return this.save();
};

// Método para remover sección
templateSchema.methods.removeSection = function(sectionId) {
  this.sections = this.sections.filter(section => section.id !== sectionId);
  return this.save();
};

// ============== MÉTODOS ESTÁTICOS ==============

// Método para crear template por defecto
templateSchema.statics.createDefault = function(ownerId, businessType = null) {
  const defaultData = {
    name: 'Mi Plantilla',
    description: 'Plantilla personalizada creada automáticamente',
    owner: ownerId,
    category: TEMPLATE_CATEGORIES.MODERN,
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
    }
  };
  
  if (businessType) {
    defaultData.businessType = businessType;
  }
  
  return this.create(defaultData);
};

// Método para buscar templates públicos
templateSchema.statics.findPublic = function(filters = {}) {
  return this.find({
    isPublic: true,
    isActive: true,
    ...filters
  }).sort({ 'usage.rating': -1, 'usage.timesUsed': -1 });
};

// Método para buscar por categoría
templateSchema.statics.findByCategory = function(category, isPublicOnly = false) {
  const query = { 
    category, 
    isActive: true 
  };
  
  if (isPublicOnly) {
    query.isPublic = true;
  }
  
  return this.find(query).sort({ 'usage.rating': -1 });
};

// Método para buscar por tipo de negocio
templateSchema.statics.findByBusinessType = function(businessType) {
  return this.find({
    businessType,
    isPublic: true,
    isActive: true
  }).sort({ 'usage.rating': -1 });
};

// Método para obtener templates populares
templateSchema.statics.findPopular = function(limit = 10) {
  return this.find({
    isPublic: true,
    isActive: true
  })
    .sort({ 'usage.timesUsed': -1, 'usage.rating': -1 })
    .limit(limit);
};

// Método para estadísticas de templates
templateSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        public: { $sum: { $cond: ['$isPublic', 1, 0] } },
        avgRating: { $avg: '$usage.rating' },
        totalUsage: { $sum: '$usage.timesUsed' }
      }
    }
  ]);
  
  return stats;
};

export default mongoose.model('Template', templateSchema);