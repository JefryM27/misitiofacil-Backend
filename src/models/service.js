import mongoose from 'mongoose';
import { constants } from '../config/index.js';

const { 
  SERVICE_TYPES,
  SERVICE_DURATIONS,
  APP_LIMITS,
  BUSINESS_TYPES,
  SUPPORTED_COUNTRIES
} = constants;


// Schema para configuración de precios
const pricingSchema = new mongoose.Schema({
  basePrice: { 
    type: Number, 
    required: [true, 'El precio base es obligatorio'],
    min: [0, 'El precio no puede ser negativo'],
    max: [1000000, 'El precio no puede exceder 1,000,000']
  },
  currency: {
    type: String,
    enum: ['CRC', 'USD'],
    default: 'CRC'
  },
  hasVariablePricing: { type: Boolean, default: false },
  priceVariations: [{
    name: { type: String, required: true, maxlength: 50 },
    description: { type: String, maxlength: 200 },
    priceAdjustment: { type: Number, default: 0 }, // Puede ser negativo (descuento)
    isPercentage: { type: Boolean, default: false }
  }],
  discounts: [{
    name: { type: String, required: true, maxlength: 50 },
    percentage: { type: Number, min: 0, max: 100 },
    validFrom: { type: Date },
    validUntil: { type: Date },
    isActive: { type: Boolean, default: true }
  }]
}, { _id: false });

// --- Subschemas de disponibilidad (JS puro con Mongoose) ---
const daySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    start:   { type: String,  default: '09:00' }, // 'HH:mm'
    end:     { type: String,  default: '17:00' }, // 'HH:mm'
    breaks:  { type: [String], default: [] },     // ej: ['12:00-12:30']
  },
  { _id: false }
);

const weeklyScheduleSchema = new mongoose.Schema(
  {
    monday:    { type: daySchema, default: () => ({}) },
    tuesday:   { type: daySchema, default: () => ({}) },
    wednesday: { type: daySchema, default: () => ({}) },
    thursday:  { type: daySchema, default: () => ({}) },
    friday:    { type: daySchema, default: () => ({}) },
    saturday:  { type: daySchema, default: () => ({ enabled: false, start: null, end: null, breaks: [] }) },
    sunday:    { type: daySchema, default: () => ({ enabled: false, start: null, end: null, breaks: [] }) },
  },
  { _id: false }
);

const availabilitySchema = new mongoose.Schema(
  {
    weeklySchedule: { type: weeklyScheduleSchema, default: () => ({}) },
    slotMinutes:    { type: Number, default: 15 },
    bufferBefore:   { type: Number, default: 0 },
    bufferAfter:    { type: Number, default: 0 },
  },
  { _id: false }
);

const serviceSchema = new mongoose.Schema({
  // Relación con el negocio
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: [true, 'Cada servicio debe pertenecer a un negocio'],
    index: true
  },
  
  // Información básica
  name: {
    type: String,
    required: [true, 'El nombre del servicio es obligatorio'],
    trim: true,
    maxlength: [APP_LIMITS.MAX_SERVICE_NAME_LENGTH, `El nombre no puede exceder ${APP_LIMITS.MAX_SERVICE_NAME_LENGTH} caracteres`],
    minlength: [2, 'El nombre debe tener al menos 2 caracteres']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [APP_LIMITS.MAX_SERVICE_DESCRIPTION_LENGTH, `La descripción no puede exceder ${APP_LIMITS.MAX_SERVICE_DESCRIPTION_LENGTH} caracteres`],
    default: ''
  },
  
  category: {
    type: String,
    required: [true, 'La categoría del servicio es requerida'],
    trim: true,
    maxlength: [50, 'La categoría no puede exceder 50 caracteres'],
    index: true
  },
  
  // Tipo de servicio
  serviceType: {
    type: String,
    enum: {
      values: Object.values(SERVICE_TYPES),
      message: `Tipo de servicio debe ser uno de: ${Object.values(SERVICE_TYPES).join(', ')}`
    },
    default: SERVICE_TYPES.INDIVIDUAL
  },
  
  // Duración del servicio
  duration: {
    type: Number,
    required: [true, 'La duración es obligatoria'],
    min: [APP_LIMITS.MIN_SERVICE_DURATION, `La duración mínima es de ${APP_LIMITS.MIN_SERVICE_DURATION} minutos`],
    max: [APP_LIMITS.MAX_SERVICE_DURATION, `La duración máxima es de ${APP_LIMITS.MAX_SERVICE_DURATION} minutos`],
    validate: {
      validator: function(duration) {
        // Validar que la duración sea múltiplo de 15 minutos
        return duration % 15 === 0;
      },
      message: 'La duración debe ser múltiplo de 15 minutos'
    }
  },
  
  // Configuración de precios
  pricing: {
    type: pricingSchema,
    required: true,
    default: () => ({
      basePrice: 0,
      currency: 'CRC'
    })
  },
  
  // Configuración de disponibilidad
  availability: {
    type: availabilitySchema,
    default: () => ({})
  },
  
  // Estado del servicio
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  isPublic: {
    type: Boolean,
    default: true
  },
  
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Imagen del servicio
  image: {
    url: { type: String, trim: true },
    filename: { type: String, trim: true },
    uploadedAt: { type: Date }
  },
  
  // Configuraciones adicionales
  settings: {
    allowOnlineBooking: { type: Boolean, default: true },
    showPrice: { type: Boolean, default: true },
    showDuration: { type: Boolean, default: true },
    maxConcurrentBookings: { type: Number, default: 1, min: 1, max: 10 },
    autoConfirm: { type: Boolean, default: true }
  },

  availability: { type: availabilitySchema, default: () => ({}) },

  
  // Estadísticas del servicio
  stats: {
    totalBookings: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    popularityScore: { type: Number, default: 0 },
    lastBooking: { type: Date }
  },
  
  // Tags para búsqueda y categorización
  tags: [{
    type: String,
    trim: true,
    maxlength: 30
  }],
  
  // Información adicional
  instructions: {
    type: String,
    maxlength: [300, 'Las instrucciones no pueden exceder 300 caracteres'],
    trim: true
  },
  
  requirements: [{
    type: String,
    maxlength: 100,
    trim: true
  }],
  
  // Orden de visualización
  sortOrder: {
    type: Number,
    default: 0,
    index: true
  },
  
  // Metadatos
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

// Virtual para el precio final considerando descuentos
serviceSchema.virtual('finalPrice').get(function() {
  let price = this.pricing.basePrice;
  
  // Aplicar descuentos activos
  if (this.pricing.discounts && this.pricing.discounts.length > 0) {
    const activeDiscounts = this.pricing.discounts.filter(discount => {
      const now = new Date();
      return discount.isActive && 
             (!discount.validFrom || discount.validFrom <= now) &&
             (!discount.validUntil || discount.validUntil >= now);
    });
    
    // Aplicar el mayor descuento
    const maxDiscount = Math.max(...activeDiscounts.map(d => d.percentage), 0);
    if (maxDiscount > 0) {
      price = price * (1 - maxDiscount / 100);
    }
  }
  
  return Math.round(price);
});

// Virtual para duración formateada
serviceSchema.virtual('formattedDuration').get(function() {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  
  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}min`;
  }
});

// Virtual para verificar si está disponible para reserva
serviceSchema.virtual('isBookable').get(function() {
  return this.isActive && 
         this.isPublic && 
         this.availability.isAvailable && 
         this.settings.allowOnlineBooking;
});

// Virtual para obtener reservas del servicio (referencia virtual)
serviceSchema.virtual('reservations', {
  ref: 'Reservation',
  localField: '_id',
  foreignField: 'service'
});

// ============== ÍNDICES ==============

// Índices para mejorar rendimiento
serviceSchema.index({ business: 1, name: 1 }, { unique: true });
serviceSchema.index({ business: 1, isActive: 1 });
serviceSchema.index({ business: 1, category: 1 });
serviceSchema.index({ business: 1, sortOrder: 1 });
serviceSchema.index({ category: 1, isActive: 1 });
serviceSchema.index({ isFeatured: 1, isActive: 1 });
serviceSchema.index({ 'pricing.basePrice': 1 });
serviceSchema.index({ duration: 1 });
serviceSchema.index({ createdAt: -1 });

// Índice de texto para búsquedas
serviceSchema.index({ 
  name: 'text', 
  description: 'text',
  category: 'text',
  tags: 'text'
}, { 
  weights: { 
    name: 10, 
    category: 5,
    description: 3,
    tags: 1 
  },
  name: 'service_search_index'
});

// ============== MIDDLEWARE ==============

// Actualizar estadísticas del negocio cuando se modifica un servicio
serviceSchema.post('save', async function() {
  if (this.business) {
    const Business = mongoose.model('Business');
    await Business.findByIdAndUpdate(this.business, {
      'stats.lastActivity': new Date()
    });
  }
});

// Validar que el negocio existe (ya sin forzar que esté "active")
serviceSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('business')) {
    const Business = mongoose.model('Business');
    const business = await Business.findById(this.business);

    if (!business) {
      return next(new Error('El negocio especificado no existe'));
    }

    // ❌ Se elimina la verificación de "status !== 'active'"
  }
  next();
});


// Validar límite de servicios por negocio
serviceSchema.pre('save', async function(next) {
  if (this.isNew) {
    const serviceCount = await this.constructor.countDocuments({ 
      business: this.business 
    });
    
    if (serviceCount >= APP_LIMITS.MAX_SERVICES_PER_BUSINESS) {
      return next(new Error(`Máximo ${APP_LIMITS.MAX_SERVICES_PER_BUSINESS} servicios permitidos por negocio`));
    }
  }
  next();
});

// ============== MÉTODOS DE INSTANCIA ==============

// Método para formatear el precio
serviceSchema.methods.getFormattedPrice = function(locale = 'es-CR') {
  const currency = this.pricing.currency || 'CRC';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(this.finalPrice);
};

// Método para calcular precio con variaciones
serviceSchema.methods.calculatePrice = function(variationIds = []) {
  let price = this.pricing.basePrice;
  
  if (this.pricing.hasVariablePricing && variationIds.length > 0) {
    for (const variationId of variationIds) {
      const variation = this.pricing.priceVariations.id(variationId);
      if (variation) {
        if (variation.isPercentage) {
          price += (price * variation.priceAdjustment / 100);
        } else {
          price += variation.priceAdjustment;
        }
      }
    }
  }
  
  return Math.max(0, Math.round(price));
};

// Método para verificar disponibilidad en una fecha
serviceSchema.methods.isAvailableOnDate = function(date) {
  const bookingDate = new Date(date);
  const now = new Date();
  
  // Verificar si está dentro del rango de reserva anticipada
  const maxAdvanceMs = this.availability.maxAdvanceBookingDays * 24 * 60 * 60 * 1000;
  const minAdvanceMs = this.availability.minAdvanceHours * 60 * 60 * 1000;
  
  const timeDiff = bookingDate.getTime() - now.getTime();
  
  return timeDiff >= minAdvanceMs && timeDiff <= maxAdvanceMs;
};

// Método para agregar estadísticas de reserva
serviceSchema.methods.recordBooking = async function(amount = null) {
  this.stats.totalBookings += 1;
  this.stats.lastBooking = new Date();
  
  if (amount) {
    this.stats.totalRevenue += amount;
  }
  
  // Calcular score de popularidad
  this.stats.popularityScore = this.stats.totalBookings * 0.7 + 
                               this.stats.averageRating * 0.3;
  
  return this.save();
};

// Método para actualizar rating
serviceSchema.methods.updateRating = async function(newRating) {
  const currentTotal = this.stats.averageRating * this.stats.reviewCount;
  this.stats.reviewCount += 1;
  this.stats.averageRating = (currentTotal + newRating) / this.stats.reviewCount;
  
  return this.save();
};

// ============== MÉTODOS ESTÁTICOS ==============

// Método para buscar servicios de un negocio
serviceSchema.statics.findByBusiness = function(businessId, activeOnly = true) {
  const query = { business: businessId };
  if (activeOnly) {
    query.isActive = true;
  }
  return this.find(query).sort({ sortOrder: 1, name: 1 });
};

// Método para buscar servicios por categoría
serviceSchema.statics.findByCategory = function(category, businessId = null) {
  const query = { 
    category: new RegExp(category, 'i'),
    isActive: true,
    isPublic: true
  };
  
  if (businessId) {
    query.business = businessId;
  }
  
  return this.find(query).sort({ isFeatured: -1, name: 1 });
};

// Método para buscar servicios en un rango de precios
serviceSchema.statics.findByPriceRange = function(minPrice, maxPrice, businessId = null) {
  const query = {
    'pricing.basePrice': { $gte: minPrice, $lte: maxPrice },
    isActive: true,
    isPublic: true
  };
  
  if (businessId) {
    query.business = businessId;
  }
  
  return this.find(query).sort({ 'pricing.basePrice': 1 });
};

// Método para obtener servicios populares
serviceSchema.statics.findPopular = function(limit = 10, businessId = null) {
  const query = { 
    isActive: true, 
    isPublic: true 
  };
  
  if (businessId) {
    query.business = businessId;
  }
  
  return this.find(query)
    .sort({ 'stats.popularityScore': -1, 'stats.totalBookings': -1 })
    .limit(limit);
};

// Método para estadísticas por negocio
serviceSchema.statics.getBusinessStats = async function(businessId) {
  const stats = await this.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(businessId) } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        avgPrice: { $avg: '$pricing.basePrice' },
        totalRevenue: { $sum: '$stats.totalRevenue' },
        totalBookings: { $sum: '$stats.totalBookings' }
      }
    }
  ]);
  
  return stats;
};

export default mongoose.model('Service', serviceSchema);