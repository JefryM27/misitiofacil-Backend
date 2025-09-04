// src/models/business.js
import mongoose from 'mongoose';
import { constants } from '../config/index.js';

const {
  BUSINESS_TYPES,
  BUSINESS_STATUS,
  WEEKDAYS,
  WEEKDAYS_SPANISH,
  VALIDATION_PATTERNS,
  APP_LIMITS,
  TEMPLATE_CATEGORIES,
  SUPPORTED_COUNTRIES
} = constants;

const { Schema } = mongoose;

/* =========================
 *  Subschemas de Horario
 * ========================= */

// Horario de un día
const dayHoursSchema = new Schema({
  isOpen:   { type: Boolean, default: true },
  openTime: { type: String,  default: '09:00' }, // 'HH:mm'
  closeTime:{ type: String,  default: '17:00' }, // 'HH:mm'
  breaks:   { type: [String], default: [] },     // ej: ['12:00-12:30']
}, { _id: false });

// Horario semanal con claves por día (coinciden con WEEKDAYS)
const operatingHoursSchema = new Schema({
  [WEEKDAYS.MONDAY]:    { type: dayHoursSchema, default: () => ({ isOpen: true,  openTime: '09:00', closeTime: '18:00', breaks: [] }) },
  [WEEKDAYS.TUESDAY]:   { type: dayHoursSchema, default: () => ({ isOpen: true,  openTime: '09:00', closeTime: '18:00', breaks: [] }) },
  [WEEKDAYS.WEDNESDAY]: { type: dayHoursSchema, default: () => ({ isOpen: true,  openTime: '09:00', closeTime: '18:00', breaks: [] }) },
  [WEEKDAYS.THURSDAY]:  { type: dayHoursSchema, default: () => ({ isOpen: true,  openTime: '09:00', closeTime: '18:00', breaks: [] }) },
  [WEEKDAYS.FRIDAY]:    { type: dayHoursSchema, default: () => ({ isOpen: true,  openTime: '09:00', closeTime: '18:00', breaks: [] }) },
  [WEEKDAYS.SATURDAY]:  { type: dayHoursSchema, default: () => ({ isOpen: true,  openTime: '09:00', closeTime: '16:00', breaks: [] }) },
  [WEEKDAYS.SUNDAY]:    { type: dayHoursSchema, default: () => ({ isOpen: false, openTime: null,   closeTime: null,   breaks: [] }) },
}, { _id: false });

/* =========================
 *  Otros Subschemas
 * ========================= */

const locationSchema = new Schema({
  address:     { type: String, trim: true, maxlength: [200, 'La dirección no puede exceder 200 caracteres'] },
  city:        { type: String, trim: true, maxlength: [50, 'La ciudad no puede exceder 50 caracteres'] },
  province:    { type: String, trim: true, maxlength: [50, 'La provincia no puede exceder 50 caracteres'] },
  country:     { type: String, enum: Object.keys(SUPPORTED_COUNTRIES), default: 'CR' },
  postalCode:  { type: String, trim: true, maxlength: [10, 'El código postal no puede exceder 10 caracteres'] },
  coordinates: { lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } }
}, { _id: false });

const visualConfigSchema = new Schema({
  primaryColor:   { type: String, match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color primario debe ser hexadecimal válido'],   default: '#3B82F6' },
  secondaryColor: { type: String, match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color secundario debe ser hexadecimal válido'], default: '#64748B' },
  accentColor:    { type: String, match: [VALIDATION_PATTERNS.COLOR_HEX, 'Color de acento debe ser hexadecimal válido'],  default: '#10B981' },
  template:       { type: String, enum: Object.values(TEMPLATE_CATEGORIES), default: TEMPLATE_CATEGORIES.MODERN },
  font:           { type: String, enum: ['Arial','Helvetica','Georgia','Times','Verdana','Open Sans','Roboto'], default: 'Open Sans' }
}, { _id: false });

const socialMediaSchema = new Schema({
  facebook: { type: String, trim: true },
  instagram:{ type: String, trim: true },
  whatsapp: { type: String, trim: true },
  website:  { type: String, trim: true },
  tiktok:   { type: String, trim: true },
  twitter:  { type: String, trim: true }
}, { _id: false });

/* =========================
 *  Schema principal
 * ========================= */

const businessSchema = new Schema({
  // Propietario
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'El negocio debe tener un propietario'] },

  // Básicos
  name: {
    type: String,
    required: [true, 'El nombre del negocio es obligatorio'],
    trim: true,
    maxlength: [APP_LIMITS.MAX_BUSINESS_NAME_LENGTH, `El nombre no puede exceder ${APP_LIMITS.MAX_BUSINESS_NAME_LENGTH} caracteres`],
    minlength: [2, 'El nombre debe tener al menos 2 caracteres']
  },

  slug: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
    validate: { validator: s => !s || VALIDATION_PATTERNS.BUSINESS_SLUG.test(s), message: 'El slug solo puede contener letras, números y guiones' }
  },

  description: {
    type: String,
    trim: true,
    maxlength: [APP_LIMITS.MAX_BUSINESS_DESCRIPTION_LENGTH, `La descripción no puede exceder ${APP_LIMITS.MAX_BUSINESS_DESCRIPTION_LENGTH} caracteres`],
    default: ''
  },

  category: {
    type: String,
    enum: { values: Object.values(BUSINESS_TYPES), message: `Categoría debe ser una de: ${Object.values(BUSINESS_TYPES).join(', ')}` },
    required: [true, 'La categoría del negocio es requerida'],
    index: true
  },

  // Template asociado (NO obligatorio para no bloquear la creación)
  templateId: { type: Schema.Types.ObjectId, ref: 'Template' },

  // Estado
  status: {
    type: String,
    enum: { values: Object.values(BUSINESS_STATUS), message: `Estado debe ser uno de: ${Object.values(BUSINESS_STATUS).join(', ')}` },
    default: BUSINESS_STATUS.DRAFT,
    index: true
  },

  // Contacto
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: { validator: e => !e || VALIDATION_PATTERNS.EMAIL.test(e), message: 'Formato de email inválido' }
  },

  phone: {
    type: String,
    trim: true,
    validate: {
      validator: p => !p || VALIDATION_PATTERNS.PHONE_CR.test(p) || VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(p),
      message: 'Formato de teléfono inválido'
    }
  },

  // Ubicación
  location: { type: locationSchema, default: () => ({}) },

  // Horarios de operación
  operatingHours: { type: operatingHoursSchema, default: () => ({}) },

  // Imágenes
  logo:       { url: { type: String, trim: true }, filename: { type: String, trim: true }, uploadedAt: { type: Date } },
  coverImage: { url: { type: String, trim: true }, filename: { type: String, trim: true }, uploadedAt: { type: Date } },

  gallery: [{
    url: { type: String, required: true, trim: true },
    filename: { type: String, required: true, trim: true },
    caption: { type: String, maxlength: 100 },
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Configuración visual
  visualConfig: { type: visualConfigSchema, default: () => ({}) },

  // Redes sociales
  socialMedia: { type: socialMediaSchema, default: () => ({}) },

  // Configuraciones
  settings: {
    allowOnlineBooking:   { type: Boolean, default: true },
    requireBookingApproval:{ type: Boolean, default: false },
    bookingAdvanceHours:  { type: Number,  default: 2,   min: 0, max: 168 },
    maxAdvanceBookingDays:{ type: Number,  default: 30,  min: 1, max: 365 },
    cancellationHours:    { type: Number,  default: 24,  min: 0, max: 168 },
    showPrices:           { type: Boolean, default: true },
    currency:             { type: String,  default: 'CRC', enum: ['CRC', 'USD'] },
    timezone:             { type: String,  default: 'America/Costa_Rica' }
  },

  // Stats
  stats: {
    totalReservations: { type: Number, default: 0 },
    totalServices:     { type: Number, default: 0 },
    rating:            { type: Number, default: 0, min: 0, max: 5 },
    reviewCount:       { type: Number, default: 0 },
    views:             { type: Number, default: 0 },
    lastActivity:      { type: Date,   default: Date.now }
  },

  // Metadatos
  featured:   { type: Boolean, default: false, index: true },
  verified:   { type: Boolean, default: false, index: true },
  publishedAt:{ type: Date },

  tags:  [{ type: String, trim: true, maxlength: 50 }],
  notes: { type: String, maxlength: [500, 'Las notas no pueden exceder 500 caracteres'] }

}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

/* =========================
 *  Virtuals y helpers
 * ========================= */

businessSchema.virtual('siteUrl').get(function () {
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  return `${baseUrl}/public/${this.slug}`;
});

businessSchema.virtual('categoryName').get(function () {
  const categoryNames = {
    [BUSINESS_TYPES.BARBERIA]: 'Barbería',
    [BUSINESS_TYPES.SALON]:    'Salón de Belleza',
    [BUSINESS_TYPES.SPA]:      'Spa'
  };
  return categoryNames[this.category] || this.category;
});

businessSchema.virtual('isOpenNow').get(function () {
  const now = new Date();
  const idx = now.getDay(); // 0=Dom ... 6=Sáb
  const dayKey = Object.values(WEEKDAYS)[idx === 0 ? 6 : idx - 1];
  const today = this.operatingHours?.[dayKey];
  if (!today || !today.isOpen || !today.openTime || !today.closeTime) return false;

  const hhmm = now.toTimeString().slice(0, 5); // HH:MM
  return hhmm >= today.openTime && hhmm <= today.closeTime;
});

// Compatibilidad FE: permitir setear openingHours y guardarlo en operatingHours
businessSchema.virtual('openingHours')
  .get(function () { return this.operatingHours; })
  .set(function (v) { this.operatingHours = v; });

/* =========================
 *  Índices
 * ========================= */

// ¡OJO! Index compuesto para que el mismo slug pueda repetirse por owner
businessSchema.index({ owner: 1, slug: 1 }, { unique: true });
businessSchema.index({ category: 1, status: 1 });
businessSchema.index({ 'location.city': 1, 'location.province': 1 });
businessSchema.index({ featured: 1, verified: 1 });
businessSchema.index({ 'stats.rating': -1 });
businessSchema.index({ createdAt: -1 });
businessSchema.index({ publishedAt: -1 });
businessSchema.index({ templateId: 1 });

businessSchema.index({
  name: 'text',
  description: 'text',
  'location.city': 'text',
  'location.address': 'text',
  tags: 'text'
}, {
  weights: { name: 10, description: 5, 'location.city': 3, 'location.address': 2, tags: 1 },
  name: 'business_search_index'
});

/* =========================
 *  Middlewares
 * ========================= */

businessSchema.pre('save', function (next) {
  // Solo generar slug si NO viene; no lo mutamos si ya existe (evita desincronización con FE)
  if ((this.isNew || this.isModified('name')) && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  next();
});

businessSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === BUSINESS_STATUS.ACTIVE && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

businessSchema.pre('save', function (next) {
  // valida coherencia de horarios (usa las mismas claves que WEEKDAYS)
  for (const day of Object.values(WEEKDAYS)) {
    const hours = this.operatingHours?.[day];
    if (hours?.isOpen && hours.openTime && hours.closeTime) {
      if (hours.openTime >= hours.closeTime) {
        return next(new Error(`Horario inválido para ${WEEKDAYS_SPANISH[day]}: la hora de apertura debe ser menor que la de cierre`));
      }
    }
  }
  next();
});

/* =========================
 *  Métodos
 * ========================= */

businessSchema.methods.isOpenOnDay = function (dayKey) {
  const hours = this.operatingHours?.[dayKey];
  return !!(hours && hours.isOpen);
};

businessSchema.methods.getFormattedHours = function () {
  const formatted = {};
  for (const [day, hours] of Object.entries(this.operatingHours || {})) {
    formatted[day] = {
      day: WEEKDAYS_SPANISH[day],
      isOpen: !!hours.isOpen,
      hours: hours.isOpen && hours.openTime && hours.closeTime
        ? `${hours.openTime} - ${hours.closeTime}`
        : 'Cerrado'
    };
  }
  return formatted;
};

businessSchema.methods.addGalleryImage = function (imageData) {
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

businessSchema.methods.removeGalleryImage = function (imageId) {
  this.gallery.id(imageId).remove();
  return this.save();
};

businessSchema.methods.updateStats = async function () {
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

/* =========================
 *  Estáticos
 * ========================= */

businessSchema.statics.findPublic = function (filters = {}) {
  return this.find({ status: BUSINESS_STATUS.ACTIVE, ...filters }).populate('owner', 'fullName email');
};

businessSchema.statics.findByCategory = function (category) {
  return this.findPublic({ category });
};

businessSchema.statics.findByLocation = function (city, province) {
  const query = {};
  if (city) query['location.city'] = new RegExp(city, 'i');
  if (province) query['location.province'] = new RegExp(province, 'i');
  return this.findPublic(query);
};

businessSchema.statics.getStats = async function () {
  return this.aggregate([{
    $group: {
      _id: '$category',
      total: { $sum: 1 },
      active: { $sum: { $cond: [{ $eq: ['$status', BUSINESS_STATUS.ACTIVE] }, 1, 0] } },
      avgRating: { $avg: '$stats.rating' }
    }
  }]);
};

export default mongoose.model('Business', businessSchema);
