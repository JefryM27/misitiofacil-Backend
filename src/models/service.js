// src/models/service.js
import mongoose from 'mongoose';
import { constants } from '../config/index.js';

const { Schema } = mongoose;

// Fallbacks por si no estuvieran definidos en constants
const MIN_DURATION = constants?.APP_LIMITS?.MIN_SERVICE_DURATION ?? 15;
const MAX_DURATION = constants?.APP_LIMITS?.MAX_SERVICE_DURATION ?? 480;
const MAX_NAME = constants?.APP_LIMITS?.MAX_SERVICE_NAME_LENGTH ?? 100;
const MAX_DESC = constants?.APP_LIMITS?.MAX_SERVICE_DESCRIPTION_LENGTH ?? 1000;

// ───────────────────────────────────────────────────────────────
// Pricing (como pediste)
// ───────────────────────────────────────────────────────────────
const pricingSchema = new Schema(
  {
    basePrice: { type: Number, required: true, min: 0 },
    currency:  { type: String, required: true, default: 'CRC', enum: ['CRC', 'USD'] }
  },
  { _id: false }
);

// ───────────────────────────────────────────────────────────────
// Service
// ───────────────────────────────────────────────────────────────
const serviceSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: MAX_NAME
    },

    description: { type: String, trim: true, default: '', maxlength: MAX_DESC },

    // libre; Atlas solo valida que sea string
    category: { type: String, default: 'general', trim: true, index: true },

    duration: {
      type: Number,
      required: true,
      min: MIN_DURATION,
      max: MAX_DURATION
    },

    pricing: { type: pricingSchema, required: true },

    isActive: { type: Boolean, default: true, index: true },

    // Campos opcionales compatibles con tu validación de Atlas (additionalProperties: true)
    serviceType: { type: String, default: null },
    tags: [{ type: String, trim: true }],
    requirements: [{ type: String, trim: true }],

    image: {
      url: { type: String, trim: true, default: null },
      filename: { type: String, trim: true, default: null },
      uploadedAt: { type: Date, default: null }
    },

    settings: { type: Schema.Types.Mixed, default: {} },
    stats:    { type: Schema.Types.Mixed, default: {} },

    sortOrder: { type: Number, default: 0, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

// ───────────────────────────────────────────────────────────────
// Virtuales útiles
// ───────────────────────────────────────────────────────────────
serviceSchema.virtual('price')
  .get(function () {
    return this.pricing?.basePrice ?? 0;
  })
  .set(function (v) {
    if (!this.pricing) this.pricing = {};
    this.pricing.basePrice = Number(v) || 0;
  });

// ───────────────────────────────────────────────────────────────
// Índices
// ───────────────────────────────────────────────────────────────
serviceSchema.index({ business: 1, name: 1 }, { unique: true });
serviceSchema.index({ 'pricing.basePrice': 1 });
serviceSchema.index({ duration: 1 });
serviceSchema.index({ createdAt: -1 });

// Búsqueda de texto (coincide con tu índice Atlas `service_search_index`)
serviceSchema.index(
  { name: 'text', description: 'text', category: 'text', tags: 'text' },
  { weights: { name: 10, category: 5, description: 3, tags: 1 }, name: 'service_search_index' }
);

// ───────────────────────────────────────────────────────────────
// Middlewares seguros (opcionales pero útiles)
// ───────────────────────────────────────────────────────────────
serviceSchema.pre('save', async function (next) {
  // Validar existencia del negocio al crear/cambiar
  if (this.isNew || this.isModified('business')) {
    const Business = mongoose.model('Business');
    const exists = await Business.exists({ _id: this.business });
    if (!exists) return next(new Error('El negocio especificado no existe'));
  }

  // Límite de servicios por negocio si está definido
  const limit = constants?.APP_LIMITS?.MAX_SERVICES_PER_BUSINESS;
  if (this.isNew && Number.isInteger(limit)) {
    const count = await this.constructor.countDocuments({ business: this.business });
    if (count >= limit) {
      return next(new Error(`Máximo ${limit} servicios permitidos por negocio`));
    }
  }
  next();
});

serviceSchema.post('save', async function () {
  // Tocar lastActivity del negocio
  try {
    const Business = mongoose.model('Business');
    await Business.findByIdAndUpdate(this.business, { 'stats.lastActivity': new Date() });
  } catch (_) {}
});

// ───────────────────────────────────────────────────────────────
export default mongoose.model('Service', serviceSchema);
