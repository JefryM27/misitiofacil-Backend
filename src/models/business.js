//models//business
import mongoose from 'mongoose';
import { constants } from '../config/index.js';

const { 
  BUSINESS_TYPES, 
  BUSINESS_STATUS, 
  WEEKDAYS,
  WEEKDAYS_SPANISH,
  VALIDATION_PATTERNS, 
  APP_LIMITS,
  THEME_COLORS,
  TEMPLATE_CATEGORIES,
  SUPPORTED_COUNTRIES
} = constants;

// Schema para horarios de operación
const operatingHoursSchema = new mongoose.Schema({
  [WEEKDAYS.MONDAY]: {
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  },
  [WEEKDAYS.TUESDAY]: {
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  },
  [WEEKDAYS.WEDNESDAY]: {
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  },
  [WEEKDAYS.THURSDAY]: {
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  },
  [WEEKDAYS.FRIDAY]: {
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  },
  [WEEKDAYS.SATURDAY]: {
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  },
  [WEEKDAYS.SUNDAY]: {
    isOpen: { type: Boolean, default: false },
    openTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    closeTime: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  }
}, { _id: false });

// Schema para ubicación
const locationSchema = new mongoose.Schema({
  address: {
    type: String,
    trim: true,
    maxlength: [200, 'La dirección no puede exceder 200 caracteres']
  },
  city: {
    type: String,
    trim: true,
    maxlength: [50, 'La ciudad no puede exceder 50 caracteres']
  },
  province: {
    type: String,
    trim: true,
    maxlength: [50, 'La provincia no puede exceder 50 caracteres']
  },
  country: {
    type: String,
    enum: Object.keys(SUPPORTED_COUNTRIES),
    default: 'CR'
  },
  postalCode: {
    type: String,
    trim: true,
    maxlength: [10, 'El código postal no puede exceder 10 caracteres']
  },
  coordinates: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 }
  }
}, { _id: false });

// Schema para configuración visual
const visualConfigSchema = new mongoose.Schema({
  primaryColor: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color primario debe ser hexadecimal válido'],
    default: '#3B82F6'
  },
  secondaryColor: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color secundario debe ser hexadecimal válido'],
    default: '#64748B'
  },
  accentColor: {
    type: String,
    match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color de acento debe ser hexadecimal válido'],
    default: '#10B981'
  },
  template: {
    type: String,
    enum: Object.values(TEMPLATE_CATEGORIES),
    default: TEMPLATE_CATEGORIES.MODERN
  },
  font: {
    type: String,
    enum: ['Arial', 'Helvetica', 'Georgia', 'Times', 'Verdana', 'Open Sans', 'Roboto'],
    default: 'Open Sans'
  }
}, { _id: false });

// Schema para redes sociales
const socialMediaSchema = new mongoose.Schema({
  facebook: { type: String, trim: true },
  instagram: { type: String, trim: true },
  whatsapp: { type: String, trim: true },
  website: { type: String, trim: true },
  tiktok: { type: String, trim: true },
  twitter: { type: String, trim: true }
}, { _id: false });

// Schema principal del negocio
const businessSchema = new mongoose.Schema({
  // Información del propietario
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El negocio debe tener un propietario'],
  },
  
  // Información básica
  name: {
    type: String,
    required: [true, 'El nombre del negocio es obligatorio'],
    trim: true,
    maxlength: [APP_LIMITS.MAX_BUSINESS_NAME_LENGTH, `El nombre no puede exceder ${APP_LIMITS.MAX_BUSINESS_NAME_LENGTH} caracteres`],
    minlength: [2, 'El nombre debe tener al menos 2 caracteres']
  },
  
  slug: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(slug) {
        return VALIDATION_PATTERNS.BUSINESS_SLUG.test(slug);
      },
      message: 'El slug solo puede contener letras, números y guiones'
    }
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [APP_LIMITS.MAX_BUSINESS_DESCRIPTION_LENGTH, `La descripción no puede exceder ${APP_LIMITS.MAX_BUSINESS_DESCRIPTION_LENGTH} caracteres`],
    default: ''
  },
  
  category: {
    type: String,
    enum: {
      values: Object.values(BUSINESS_TYPES),
      message: `Categoría debe ser una de: ${Object.values(BUSINESS_TYPES).join(', ')}`
    },
    required: [true, 'La categoría del negocio es requerida'],
    index: true
  },
  
  // Estado del negocio
  status: {
    type: String,
    enum: {
      values: Object.values(BUSINESS_STATUS),
      message: `Estado debe ser uno de: ${Object.values(BUSINESS_STATUS).join(', ')}`
    },
    default: BUSINESS_STATUS.DRAFT,
    index: true
  },
  
  // Información de contacto
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(email) {
        if (!email) return true; // Opcional
        return VALIDATION_PATTERNS.EMAIL.test(email);
      },
      message: 'Formato de email inválido'
    }
  },
  
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(phone) {
        if (!phone) return true; // Opcional
        return VALIDATION_PATTERNS.PHONE_CR.test(phone) || 
               VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone);
      },
      message: 'Formato de teléfono inválido'
    }
  },
  
  // Ubicación
  location: {
    type: locationSchema,
    default: () => ({})
  },
  
  // Horarios de operación
  operatingHours: {
    type: operatingHoursSchema,
    default: () => ({
      [WEEKDAYS.MONDAY]: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      [WEEKDAYS.TUESDAY]: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      [WEEKDAYS.WEDNESDAY]: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      [WEEKDAYS.THURSDAY]: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      [WEEKDAYS.FRIDAY]: { isOpen: true, openTime: '09:00', closeTime: '18:00' },
      [WEEKDAYS.SATURDAY]: { isOpen: true, openTime: '09:00', closeTime: '16:00' },
      [WEEKDAYS.SUNDAY]: { isOpen: false }
    })
  },
  
  // Imágenes
  logo: {
    url: { type: String, trim: true },
    filename: { type: String, trim: true },
    uploadedAt: { type: Date }
  },
  
  coverImage: {
    url: { type: String, trim: true },
    filename: { type: String, trim: true },
    uploadedAt: { type: Date }
  },
  
  gallery: [{
    url: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    caption: { type: String, maxlength: 100 },
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Configuración visual
  visualConfig: {
    type: visualConfigSchema,
    default: () => ({})
  },
  
  // Redes sociales
  socialMedia: {
    type: socialMediaSchema,
    default: () => ({})
  },
  
  // Configuraciones del negocio
  settings: {
    allowOnlineBooking: { type: Boolean, default: true },
    requireBookingApproval: { type: Boolean, default: false },
    bookingAdvanceHours: { type: Number, default: 2, min: 0, max: 168 }, // Máximo 1 semana
    maxAdvanceBookingDays: { type: Number, default: 30, min: 1, max: 365 },
    cancellationHours: { type: Number, default: 24, min: 0, max: 168 },
    showPrices: { type: Boolean, default: true },
    currency: { type: String, default: 'CRC', enum: ['CRC', 'USD'] },
    timezone: { type: String, default: 'America/Costa_Rica' }
  },
  
  // Estadísticas
  stats: {
    totalReservations: { type: Number, default: 0 },
    totalServices: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now }
  },
  
  // Metadatos
  featured: { type: Boolean, default: false, index: true },
  verified: { type: Boolean, default: false, index: true },
  
  publishedAt: { type: Date },
  
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  
  notes: {
    type: String,
    maxlength: [500, 'Las notas no pueden exceder 500 caracteres']
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

// Virtual para obtener la URL completa del sitio web
businessSchema.virtual('siteUrl').get(function() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  return `${baseUrl}/public/${this.slug}`;
});

// Virtual para obtener el nombre de la categoría
businessSchema.virtual('categoryName').get(function() {
  const categoryNames = {
    [BUSINESS_TYPES.BARBERIA]: 'Barbería',
    [BUSINESS_TYPES.SALON]: 'Salón de Belleza',
    [BUSINESS_TYPES.SPA]: 'Spa'
  };
  return categoryNames[this.category] || this.category;
});

// Virtual para verificar si está abierto ahora
businessSchema.virtual('isOpenNow').get(function() {
  const now = new Date();
  const dayOfWeek = Object.values(WEEKDAYS)[now.getDay() === 0 ? 6 : now.getDay() - 1]; // Ajustar domingo
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM
  
  const todayHours = this.operatingHours[dayOfWeek];
  if (!todayHours || !todayHours.isOpen) return false;
  
  return currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime;
});

// Virtual para obtener servicios (referencia virtual)
businessSchema.virtual('services', {
  ref: 'Service',
  localField: '_id',
  foreignField: 'business'
});

// Virtual para obtener reservas (referencia virtual)
businessSchema.virtual('reservations', {
  ref: 'Reservation',
  localField: '_id',
  foreignField: 'business'
});

// ============== ÍNDICES ==============

// Índices para mejorar rendimiento
businessSchema.index({ owner: 1 });
businessSchema.index({ category: 1, status: 1 });
businessSchema.index({ 'location.city': 1, 'location.province': 1 });
businessSchema.index({ featured: 1, verified: 1 });
businessSchema.index({ 'stats.rating': -1 });
businessSchema.index({ createdAt: -1 });
businessSchema.index({ publishedAt: -1 });

// Índice compuesto único owner+name
businessSchema.index(
  { owner: 1, name: 1 },
  { unique: true }
);

// Índice de texto para búsquedas
businessSchema.index({ 
  name: 'text', 
  description: 'text',
  'location.city': 'text',
  'location.address': 'text',
  tags: 'text'
}, { 
  weights: { 
    name: 10, 
    description: 5, 
    'location.city': 3,
    'location.address': 2,
    tags: 1 
  },
  name: 'business_search_index'
});

// ============== MIDDLEWARE ==============

// Generar slug automáticamente antes de guardar
businessSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remover caracteres especiales
      .replace(/\s+/g, '-') // Espacios a guiones
      .replace(/-+/g, '-') // Múltiples guiones a uno
      .trim();
    
    // Agregar ID del owner para garantizar unicidad
    this.slug = `${this.slug}-${this.owner.toString().slice(-6)}`;
  }
  next();
});

// Actualizar publishedAt cuando se publica
businessSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === BUSINESS_STATUS.ACTIVE && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// Validar horarios
businessSchema.pre('save', function(next) {
  for (const day of Object.values(WEEKDAYS)) {
    const hours = this.operatingHours[day];
    if (hours && hours.isOpen && hours.openTime && hours.closeTime) {
      if (hours.openTime >= hours.closeTime) {
        return next(new Error(`Horario inválido para ${WEEKDAYS_SPANISH[day]}: la hora de apertura debe ser menor que la de cierre`));
      }
    }
  }
  next();
});

// ============== MÉTODOS DE INSTANCIA ==============

// Método para verificar si el negocio está abierto en un día específico
businessSchema.methods.isOpenOnDay = function(dayOfWeek) {
  const hours = this.operatingHours[dayOfWeek];
  return hours && hours.isOpen;
};

// Método para obtener horarios formateados
businessSchema.methods.getFormattedHours = function() {
  const formatted = {};
  for (const [day, hours] of Object.entries(this.operatingHours)) {
    formatted[day] = {
      day: WEEKDAYS_SPANISH[day],
      isOpen: hours.isOpen,
      hours: hours.isOpen && hours.openTime && hours.closeTime 
        ? `${hours.openTime} - ${hours.closeTime}`
        : 'Cerrado'
    };
  }
  return formatted;
};

// Método para agregar imagen a la galería
businessSchema.methods.addGalleryImage = function(imageData) {
  if (this.gallery.length >= APP_LIMITS.MAX_GALLERY_IMAGES) {
    throw new Error(`Máximo ${APP_LIMITS.MAX_GALLERY_IMAGES} imágenes permitidas en la galería`);
  }
  
  this.gallery.push({
    url: imageData.url,
    filename: imageData.filename,
    caption: imageData.caption || '',
    uploadedAt: new Date()
  });
  
  return this.save();
};

// Método para remover imagen de la galería
businessSchema.methods.removeGalleryImage = function(imageId) {
  this.gallery.id(imageId).remove();
  return this.save();
};

// Método para actualizar estadísticas
businessSchema.methods.updateStats = async function() {
  const Service = mongoose.model('Service');
  const Reservation = mongoose.model('Reservation');
  
  const [serviceCount, reservationCount] = await Promise.all([
    Service.countDocuments({ business: this._id }),
    Reservation.countDocuments({ business: this._id })
  ]);
  
  this.stats.totalServices = serviceCount;
  this.stats.totalReservations = reservationCount;
  this.stats.lastActivity = new Date();
  
  return this.save();
};

// ============== MÉTODOS ESTÁTICOS ==============

// Método para buscar negocios públicos
businessSchema.statics.findPublic = function(filters = {}) {
  return this.find({
    status: BUSINESS_STATUS.ACTIVE,
    ...filters
  }).populate('owner', 'fullName email');
};

// Método para buscar por categoría
businessSchema.statics.findByCategory = function(category) {
  return this.findPublic({ category });
};

// Método para buscar por ubicación
businessSchema.statics.findByLocation = function(city, province) {
  const query = {};
  if (city) query['location.city'] = new RegExp(city, 'i');
  if (province) query['location.province'] = new RegExp(province, 'i');
  
  return this.findPublic(query);
};

// Método para estadísticas generales
businessSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$category',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', BUSINESS_STATUS.ACTIVE] }, 1, 0] } },
        avgRating: { $avg: '$stats.rating' }
      }
    }
  ]);
  
  return stats;
};

export default mongoose.model('Business', businessSchema);