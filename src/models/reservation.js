import mongoose from 'mongoose';
import { constants } from '../config/index.js';

const { 
  RESERVATION_STATUS,
  PAYMENT_METHODS,
  NOTIFICATION_TYPES,
  TIME_CONFIG,
  USER_ROLES,
  WEEKDAYS
} = constants;



// Schema para información del cliente (cuando no está registrado)
const guestClientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del cliente es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  email: {
    type: String,
    required: [true, 'El email del cliente es requerido'],
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Email inválido']
  },
  phone: {
    type: String,
    required: [true, 'El teléfono del cliente es requerido'],
    trim: true,
    match: [/^[0-9+\-\s()]{7,20}$/, 'Teléfono inválido']
  }
}, { _id: false });

// Schema para información de pago
const paymentInfoSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: {
      values: Object.values(PAYMENT_METHODS),
      message: `Método de pago debe ser uno de: ${Object.values(PAYMENT_METHODS).join(', ')}`
    },
    default: PAYMENT_METHODS.CASH
  },
  amount: {
    type: Number,
    required: [true, 'El monto es requerido'],
    min: [0, 'El monto no puede ser negativo']
  },
  currency: {
    type: String,
    enum: ['CRC', 'USD'],
    default: 'CRC'
  },
  isPaid: { type: Boolean, default: false },
  paidAt: { type: Date },
  transactionId: { type: String, trim: true },
  notes: { type: String, maxlength: 200, trim: true }
}, { _id: false });

// Schema para notificaciones de la reserva
const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(NOTIFICATION_TYPES),
    required: true
  },
  sentAt: { type: Date, default: Date.now },
  channel: {
    type: String,
    enum: ['email', 'sms', 'push', 'whatsapp'],
    required: true
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'failed'],
    default: 'sent'
  },
  content: { type: String, maxlength: 500 }
}, { _id: false });

const reservationSchema = new mongoose.Schema({
  // Relaciones principales
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: [true, 'La reserva debe pertenecer a un negocio'],
  },
  
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: [true, 'La reserva debe especificar un servicio'],
  },
  
  // Cliente (puede ser usuario registrado o invitado)
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    validate: {
      validator: function(clientId) {
        // Si no hay clientId, debe haber guestClient
        return clientId || this.guestClient;
      },
      message: 'Debe especificar un cliente registrado o información de invitado'
    }
  },
  
  guestClient: {
    type: guestClientSchema,
    validate: {
      validator: function(guestData) {
        // Si no hay client, debe haber guestClient
        return this.client || guestData;
      },
      message: 'Debe especificar un cliente registrado o información de invitado'
    }
  },
  
  // Fecha y hora de la reserva
  dateTime: {
    type: Date,
    required: [true, 'La reserva debe tener fecha y hora'],
    validate: {
      validator: function(dateTime) {
        // Validar que la fecha esté en el futuro
        return dateTime > new Date();
      },
      message: 'La fecha de la reserva debe estar en el futuro'
    }
  },
  
  // Duración estimada (en minutos)
  duration: {
    type: Number,
    required: [true, 'La duración es requerida'],
    min: [15, 'La duración mínima es de 15 minutos'],
    max: [480, 'La duración máxima es de 8 horas']
  },
  
  // Estado de la reserva
  status: {
    type: String,
    enum: {
      values: Object.values(RESERVATION_STATUS),
      message: `Estado debe ser uno de: ${Object.values(RESERVATION_STATUS).join(', ')}`
    },
    default: RESERVATION_STATUS.PENDING,
  },
  
  // Información de pago
  payment: {
    type: paymentInfoSchema,
    required: true
  },
  
  // Notas y comentarios
  notes: {
    type: String,
    maxlength: [500, 'Las notas no pueden exceder 500 caracteres'],
    trim: true
  },
  
  clientNotes: {
    type: String,
    maxlength: [300, 'Los comentarios del cliente no pueden exceder 300 caracteres'],
    trim: true
  },
  
  internalNotes: {
    type: String,
    maxlength: [500, 'Las notas internas no pueden exceder 500 caracteres'],
    trim: true
  },
  
  // Información de confirmación/cancelación
  confirmedAt: { type: Date },
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  cancelledAt: { type: Date },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  cancellationReason: {
    type: String,
    maxlength: [200, 'La razón de cancelación no puede exceder 200 caracteres'],
    trim: true
  },
  
  // Información de completación
  completedAt: { type: Date },
  actualDuration: { type: Number }, // Duración real en minutos
  
  // Recordatorios y notificaciones
  notifications: [notificationSchema],
  
  reminderSent: { type: Boolean, default: false },
  reminderSentAt: { type: Date },
  
  // Configuraciones específicas de la reserva
  requiresApproval: { type: Boolean, default: false },
  isRecurring: { type: Boolean, default: false },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly'],
    },
    endDate: { type: Date },
    occurrences: { type: Number, min: 1, max: 52 }
  },
  
  // Variaciones del servicio seleccionadas
  serviceVariations: [{
    variationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    name: { type: String, required: true },
    priceAdjustment: { type: Number, default: 0 }
  }],
  
  // Metadatos
  source: {
    type: String,
    enum: ['web', 'mobile', 'phone', 'walk_in', 'admin'],
    default: 'web'
  },
  
  ipAddress: { type: String },
  userAgent: { type: String },
  
  // Para reservas no presenciales
  isVirtual: { type: Boolean, default: false },
  meetingLink: { type: String, trim: true },
  
  // Rating y review (después de completar)
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  
  review: {
    type: String,
    maxlength: [500, 'La reseña no puede exceder 500 caracteres'],
    trim: true
  },
  
  reviewedAt: { type: Date }
  
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

const Reservation = mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema);

// ============== VIRTUALS ==============

// Virtual para obtener información del cliente (registrado o invitado)
reservationSchema.virtual('clientInfo').get(function() {
  if (this.client) {
    return {
      type: 'registered',
      id: this.client._id || this.client,
      name: this.client.fullName,
      email: this.client.email,
      phone: this.client.phone
    };
  } else if (this.guestClient) {
    return {
      type: 'guest',
      name: this.guestClient.name,
      email: this.guestClient.email,
      phone: this.guestClient.phone
    };
  }
  return null;
});

// Virtual para calcular fecha y hora de fin
reservationSchema.virtual('endDateTime').get(function() {
  if (this.dateTime && this.duration) {
    return new Date(this.dateTime.getTime() + (this.duration * 60 * 1000));
  }
  return null;
});

// Virtual para verificar si se puede cancelar
reservationSchema.virtual('canBeCancelled').get(function() {
  if (this.status === RESERVATION_STATUS.CANCELLED || 
      this.status === RESERVATION_STATUS.COMPLETED) {
    return false;
  }
  
  const now = new Date();
  const hoursUntilReservation = (this.dateTime - now) / (1000 * 60 * 60);
  
  return hoursUntilReservation >= TIME_CONFIG.CANCELLATION_WINDOW.MIN_HOURS;
});

// Virtual para verificar si está en el pasado
reservationSchema.virtual('isPast').get(function() {
  return this.dateTime < new Date();
});

// Virtual para calcular el precio total
reservationSchema.virtual('totalPrice').get(function() {
  let total = this.payment.amount;
  
  // Agregar variaciones
  if (this.serviceVariations && this.serviceVariations.length > 0) {
    total += this.serviceVariations.reduce((sum, variation) => {
      return sum + (variation.priceAdjustment || 0);
    }, 0);
  }
  
  return Math.max(0, total);
});

// ============== ÍNDICES ==============

// Índices para mejorar rendimiento
reservationSchema.index({ business: 1, dateTime: 1 });
reservationSchema.index({ business: 1, status: 1 });
reservationSchema.index({ client: 1, dateTime: -1 });
reservationSchema.index({ service: 1, dateTime: 1 });
reservationSchema.index({ status: 1, dateTime: 1 });
reservationSchema.index({ dateTime: 1, status: 1 });
reservationSchema.index({ 'guestClient.email': 1 });
reservationSchema.index({ createdAt: -1 });

// Índice para buscar por fecha de reserva
reservationSchema.index({ 
  dateTime: 1 
}, { 
  partialFilterExpression: { 
    status: { $in: [RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.PENDING] } 
  }
});

// Índice TTL para auto-eliminar reservas muy antiguas (opcional)
reservationSchema.index(
  { createdAt: 1 },
  { 
    expireAfterSeconds: 60 * 60 * 24 * 365, // 1 año
    partialFilterExpression: { 
      status: RESERVATION_STATUS.CANCELLED 
    }
  }
);

// ============== MIDDLEWARE ==============

// NUEVO: Validar que la reserva esté dentro del horario del negocio
reservationSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('dateTime') || this.isModified('duration')) {
    try {
      // Obtener el negocio
      const Business = mongoose.model('Business');
      const business = await Business.findById(this.business);
      
      if (!business) {
        return next(new Error('Negocio no encontrado'));
      }
      
      const reservationDate = new Date(this.dateTime);
      const dayOfWeek = reservationDate.getDay(); // 0 = Domingo, 1 = Lunes, etc.
      
      // Mapear día de JS (0-6, Dom-Sab) a nuestro formato (lunes-domingo)
      const dayMapping = {
        0: WEEKDAYS.SUNDAY,
        1: WEEKDAYS.MONDAY,
        2: WEEKDAYS.TUESDAY,
        3: WEEKDAYS.WEDNESDAY,
        4: WEEKDAYS.THURSDAY,
        5: WEEKDAYS.FRIDAY,
        6: WEEKDAYS.SATURDAY
      };
      
      const dayName = dayMapping[dayOfWeek];
      const businessHours = business.operatingHours[dayName];
      
      if (!businessHours || !businessHours.isOpen) {
        return next(new Error(`El negocio está cerrado los ${dayName}`));
      }
      
      const reservationTime = reservationDate.toTimeString().slice(0, 5); // HH:MM format
      
      if (reservationTime < businessHours.openTime || reservationTime >= businessHours.closeTime) {
        return next(new Error(`La reserva está fuera del horario de atención (${businessHours.openTime} - ${businessHours.closeTime})`));
      }
      
      // Validar que la reserva + duración no se extienda más allá del cierre
      if (this.duration) {
        const endTime = new Date(reservationDate.getTime() + (this.duration * 60 * 1000));
        const endTimeString = endTime.toTimeString().slice(0, 5);
        
        if (endTimeString > businessHours.closeTime) {
          return next(new Error(`La reserva se extiende más allá del horario de cierre (${businessHours.closeTime})`));
        }
      }
      
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Validar que no haya conflictos de horario antes de guardar
reservationSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('dateTime') || this.isModified('duration')) {
    // Solo validar para reservas activas
    if (this.status === RESERVATION_STATUS.CONFIRMED || 
        this.status === RESERVATION_STATUS.PENDING) {
      
      const startTime = this.dateTime;
      const endTime = new Date(startTime.getTime() + (this.duration * 60 * 1000));
      
      // Buscar conflictos
      const conflicts = await this.constructor.find({
        _id: { $ne: this._id },
        business: this.business,
        status: { $in: [RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.PENDING] },
        $or: [
          {
            dateTime: { $lt: endTime },
            $expr: {
              $gt: [
                { $add: ['$dateTime', { $multiply: ['$duration', 60000] }] },
                startTime
              ]
            }
          }
        ]
      });
      
      if (conflicts.length > 0) {
        return next(new Error('Ya existe una reserva en ese horario'));
      }
    }
  }
  next();
});

// Actualizar estadísticas del servicio y negocio
reservationSchema.post('save', async function() {
  if (this.wasNew) {
    // Actualizar estadísticas del servicio
    const Service = mongoose.model('Service');
    await Service.findByIdAndUpdate(this.service, {
      $inc: { 'stats.totalBookings': 1 }
    });
    
    // Actualizar estadísticas del negocio
    const Business = mongoose.model('Business');
    await Business.findByIdAndUpdate(this.business, {
      $inc: { 'stats.totalReservations': 1 },
      'stats.lastActivity': new Date()
    });
  }
});

// ============== MÉTODOS DE INSTANCIA ==============

// Método para cambiar el estado
reservationSchema.methods.updateStatus = async function(newStatus, userId = null, reason = null) {
  const validTransitions = {
    [RESERVATION_STATUS.PENDING]: [RESERVATION_STATUS.CONFIRMED, RESERVATION_STATUS.CANCELLED],
    [RESERVATION_STATUS.CONFIRMED]: [RESERVATION_STATUS.COMPLETED, RESERVATION_STATUS.CANCELLED, RESERVATION_STATUS.NO_SHOW],
    [RESERVATION_STATUS.CANCELLED]: [], // No se puede cambiar desde cancelado
    [RESERVATION_STATUS.COMPLETED]: [], // No se puede cambiar desde completado
    [RESERVATION_STATUS.NO_SHOW]: []
  };
  
  if (!validTransitions[this.status].includes(newStatus)) {
    throw new Error(`No se puede cambiar el estado de ${this.status} a ${newStatus}`);
  }
  
  const oldStatus = this.status;
  this.status = newStatus;
  
  // Actualizar campos específicos según el nuevo estado
  switch (newStatus) {
    case RESERVATION_STATUS.CONFIRMED:
      this.confirmedAt = new Date();
      this.confirmedBy = userId;
      break;
      
    case RESERVATION_STATUS.CANCELLED:
      this.cancelledAt = new Date();
      this.cancelledBy = userId;
      if (reason) this.cancellationReason = reason;
      break;
      
    case RESERVATION_STATUS.COMPLETED:
      this.completedAt = new Date();
      break;
  }
  
  await this.save();
  
  // Registrar notificación del cambio de estado
  await this.addNotification(
    NOTIFICATION_TYPES.RESERVATION_CONFIRMED, // Ajustar según el estado
    'email',
    `Estado cambiado de ${oldStatus} a ${newStatus}`
  );
  
  return this;
};

// Método para agregar notificación
reservationSchema.methods.addNotification = function(type, channel, content) {
  this.notifications.push({
    type,
    channel,
    content,
    sentAt: new Date()
  });
  
  return this.save();
};

// Método para enviar recordatorio
reservationSchema.methods.sendReminder = async function() {
  if (this.reminderSent) return false;
  
  const hoursUntil = (this.dateTime - new Date()) / (1000 * 60 * 60);
  
  // Solo enviar si falta entre 2 y 24 horas
  if (hoursUntil >= 2 && hoursUntil <= 24) {
    await this.addNotification(
      NOTIFICATION_TYPES.RESERVATION_REMINDER,
      'email',
      `Recordatorio: tienes una reserva mañana a las ${this.dateTime.toLocaleTimeString()}`
    );
    
    this.reminderSent = true;
    this.reminderSentAt = new Date();
    
    return this.save();
  }
  
  return false;
};

// Método para calcular tiempo restante
reservationSchema.methods.getTimeUntilReservation = function() {
  const now = new Date();
  const diff = this.dateTime - now;
  
  if (diff <= 0) return null;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { days, hours, minutes };
};

// ============== MÉTODOS ESTÁTICOS ==============

// Método para obtener reservas de un usuario
reservationSchema.statics.findByUser = function(userId, status = null) {
  const query = { client: userId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('business', 'name location')
    .populate('service', 'name duration')
    .sort({ dateTime: -1 });
};

// Método para obtener reservas de un negocio
reservationSchema.statics.findByBusiness = function(businessId, dateFrom = null, dateTo = null) {
  const query = { business: businessId };
  
  if (dateFrom || dateTo) {
    query.dateTime = {};
    if (dateFrom) query.dateTime.$gte = new Date(dateFrom);
    if (dateTo) query.dateTime.$lte = new Date(dateTo);
  }
  
  return this.find(query)
    .populate('client', 'fullName email phone')
    .populate('service', 'name duration')
    .sort({ dateTime: 1 });
};

// Método para obtener reservas por email (invitados)
reservationSchema.statics.findByGuestEmail = function(email) {
  return this.find({ 'guestClient.email': email.toLowerCase() })
    .populate('business', 'name location')
    .populate('service', 'name duration')
    .sort({ dateTime: -1 });
};

// Método para estadísticas de reservas
reservationSchema.statics.getStats = async function(businessId = null, dateFrom = null, dateTo = null) {
  const matchStage = {};
  
  if (businessId) matchStage.business = new mongoose.Types.ObjectId(businessId);
  if (dateFrom || dateTo) {
    matchStage.dateTime = {};
    if (dateFrom) matchStage.dateTime.$gte = new Date(dateFrom);
    if (dateTo) matchStage.dateTime.$lte = new Date(dateTo);
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$payment.amount' },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);
  
  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      totalRevenue: stat.totalRevenue,
      avgDuration: Math.round(stat.avgDuration)
    };
    return acc;
  }, {});
};

export default mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema);