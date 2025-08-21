import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { constants } from '../config/index.js';

const { 
  USER_ROLES, 
  VALIDATION_PATTERNS, 
  APP_LIMITS,
  ERROR_MESSAGES,
  SUPPORTED_COUNTRIES 
} = constants;

const userSchema = new mongoose.Schema({
  // Información personal
  fullName: {
    type: String,
    required: [true, 'El nombre completo es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres'],
    minlength: [2, 'El nombre debe tener al menos 2 caracteres']
  },
  
  email: {
    type: String,
    required: [true, 'El email es requerido'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [100, 'El email no puede exceder 100 caracteres'],
    validate: {
      validator: function(email) {
        return VALIDATION_PATTERNS.EMAIL.test(email);
      },
      message: 'Formato de email inválido'
    }
  },
  
  // Información de contacto
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
  
  country: {
    type: String,
    enum: Object.keys(SUPPORTED_COUNTRIES),
    default: 'CR'
  },
  
  // Autenticación
  passwordHash: {
    type: String,
    required: [true, 'La contraseña es requerida'],
    minlength: [60, 'Hash de contraseña inválido'],
    select: false // No incluir por defecto en consultas
  },
  
  role: {
    type: String,
    enum: {
      values: Object.values(USER_ROLES),
      message: `Rol debe ser uno de: ${Object.values(USER_ROLES).join(', ')}`
    },
    default: USER_ROLES.CLIENT
  },
  
  // Estado del usuario
  isActive: {
    type: Boolean,
    default: true
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  
  // Información adicional
  avatar: {
    type: String, // URL de la imagen
    trim: true
  },
  
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(date) {
        if (!date) return true; // Opcional
        const age = (new Date() - date) / (365.25 * 24 * 60 * 60 * 1000);
        return age >= 13 && age <= 120; // Entre 13 y 120 años
      },
      message: 'Fecha de nacimiento inválida'
    }
  },
  
  // Para owners: referencia al negocio
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: function() {
      return this.role === USER_ROLES.OWNER;
    },
    validate: {
      validator: function(businessId) {
        // Solo owners pueden tener business
        if (this.role === USER_ROLES.OWNER) {
          return businessId != null;
        }
        return businessId == null;
      },
      message: 'Solo los owners pueden tener un negocio asociado'
    }
  },
  
  // Tokens de verificación y recuperación
  emailVerificationToken: {
    type: String,
    select: false
  },
  
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  
  passwordResetToken: {
    type: String,
    select: false
  },
  
  passwordResetExpires: {
    type: Date,
    select: false
  },
  
  // Configuraciones del usuario
  preferences: {
    language: {
      type: String,
      enum: ['es', 'en'],
      default: 'es'
    },
    timezone: {
      type: String,
      default: 'America/Costa_Rica'
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    }
  },
  
  // Información de sesión
  lastLogin: {
    type: Date
  },
  
  lastLoginIP: {
    type: String
  },
  
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lockUntil: {
    type: Date
  },
  
  // Metadatos
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  notes: {
    type: String,
    maxlength: [500, 'Las notas no pueden exceder 500 caracteres']
  }
  
}, { 
  timestamps: true,
  // Configuración de toJSON para respuestas de API
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Remover campos sensibles
      delete ret.passwordHash;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      delete ret.__v;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// ============== VIRTUALS ==============

// Virtual para la contraseña en claro (temporal)
userSchema.virtual('password')
  .set(function(password) {
    this._plainPassword = password;
  })
  .get(function() {
    return this._plainPassword;
  });

// Virtual para obtener el nombre del rol
userSchema.virtual('roleName').get(function() {
  const roleNames = {
    [USER_ROLES.OWNER]: 'Dueño de Negocio',
    [USER_ROLES.CLIENT]: 'Cliente',
    [USER_ROLES.ADMIN]: 'Administrador'
  };
  return roleNames[this.role] || this.role;
});

// Virtual para verificar si la cuenta está bloqueada
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Virtual para obtener la edad
userSchema.virtual('age').get(function() {
  if (!this.dateOfBirth) return null;
  return Math.floor((new Date() - this.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000));
});

// ============== INDICES ==============

// Índices para mejorar rendimiento
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ business: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });
userSchema.index({ 
  fullName: 'text', 
  email: 'text' 
}, { 
  weights: { fullName: 2, email: 1 },
  name: 'user_search_index'
});

// ============== MIDDLEWARE ==============

// Hash de contraseña en pre-save
userSchema.pre('save', async function(next) {
  try {
    // Solo hashear si la contraseña ha cambiado o es nueva
    if (this._plainPassword) {
      // Validar longitud mínima
      if (this._plainPassword.length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
        throw new Error(`La contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`);
      }
      
      // Validar complejidad
      if (!VALIDATION_PATTERNS.PASSWORD.test(this._plainPassword)) {
        throw new Error('La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial');
      }
      
      // Hashear contraseña
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      this.passwordHash = await bcrypt.hash(this._plainPassword, saltRounds);
      
      // Limpiar contraseña en claro
      this._plainPassword = undefined;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware para manejar el role y business
userSchema.pre('save', function(next) {
  // Si el usuario no es owner, no debe tener business
  if (this.role !== USER_ROLES.OWNER) {
    this.business = undefined;
  }
  
  next();
});

// Middleware para actualizar timestamps personalizados
userSchema.pre('save', function(next) {
  if (this.isNew) {
    this.createdAt = new Date();
  }
  this.updatedAt = new Date();
  next();
});

// ============== MÉTODOS DE INSTANCIA ==============

// Método para validar contraseña
userSchema.methods.validatePassword = async function(plainPassword) {
  if (!this.passwordHash) {
    return false;
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Método para incrementar intentos de login
userSchema.methods.incLoginAttempts = async function() {
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 horas
  
  // Si ya está bloqueado y el tiempo expiró, resetear
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1, loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Si alcanzó el máximo de intentos, bloquear cuenta
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  
  return this.updateOne(updates);
};

// Método para resetear intentos de login
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { lockUntil: 1, loginAttempts: 1 }
  });
};

// Método para registrar login exitoso
userSchema.methods.recordLogin = async function(ip) {
  const updates = {
    lastLogin: new Date(),
    lastLoginIP: ip,
    $unset: { lockUntil: 1, loginAttempts: 1 }
  };
  
  return this.updateOne(updates);
};

// Método para generar token de verificación de email
userSchema.methods.generateEmailVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = token;
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
  
  return token;
};

// Método para generar token de reset de contraseña
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = token;
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
  
  return token;
};

// Método para verificar si puede realizar acciones
userSchema.methods.canPerformActions = function() {
  return this.isActive && !this.isLocked && this.isEmailVerified;
};

// ============== MÉTODOS ESTÁTICOS ==============

// Método para buscar por email sin considerar case
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ 
    email: email.toLowerCase().trim() 
  });
};

// Método para obtener usuarios por rol
userSchema.statics.findByRole = function(role) {
  return this.find({ role, isActive: true });
};

// Método para estadísticas básicas
userSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        verified: { $sum: { $cond: ['$isEmailVerified', 1, 0] } }
      }
    }
  ]);
  
  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      total: stat.count,
      active: stat.active,
      verified: stat.verified
    };
    return acc;
  }, {});
};

// ============== VALIDACIONES PERSONALIZADAS ==============

// Validación para email único
userSchema.path('email').validate(async function(email) {
  const emailCount = await mongoose.models.User.countDocuments({ 
    email,
    _id: { $ne: this._id }
  });
  return !emailCount;
}, 'El email ya está registrado');

// ============== CONFIGURACIÓN DEL MODELO ==============

// Configurar el modelo antes de exportar
userSchema.set('collection', 'users');

export default mongoose.model('User', userSchema);