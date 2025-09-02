import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { constants } from '../config/index.js';
import crypto from 'node:crypto';

const {
  USER_ROLES,
  VALIDATION_PATTERNS,
  APP_LIMITS,
  SUPPORTED_COUNTRIES,
} = constants;

const userSchema = new mongoose.Schema(
  {
    // Información personal
    fullName: {
      type: String,
      required: [true, 'El nombre completo es requerido'],
      trim: true,
      maxlength: [100, 'El nombre no puede exceder 100 caracteres'],
      minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    },

    email: {
      type: String,
      required: [true, 'El email es requerido'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [100, 'El email no puede exceder 100 caracteres'],
      validate: {
        validator(email) {
          return VALIDATION_PATTERNS.EMAIL.test(email);
        },
        message: 'Formato de email inválido',
      },
    },

    // Información de contacto
    phone: {
      type: String,
      trim: true,
      validate: {
        validator(phone) {
          if (!phone) return true; // Opcional
          return (
            VALIDATION_PATTERNS.PHONE_CR.test(phone) ||
            VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)
          );
        },
        message: 'Formato de teléfono inválido',
      },
    },

    country: {
      type: String,
      enum: Object.keys(SUPPORTED_COUNTRIES),
      default: 'CR',
    },

    // Autenticación
    passwordHash: {
      type: String,
      required: [true, 'La contraseña es requerida'],
      minlength: [60, 'Hash de contraseña inválido'],
      select: false, // No incluir por defecto en consultas
    },

    role: {
      type: String,
      enum: {
        values: Object.values(USER_ROLES),
        message: `Rol debe ser uno de: ${Object.values(USER_ROLES).join(', ')}`,
      },
      default: USER_ROLES.CLIENT,
    },

    // Estado del usuario
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },

    // Información adicional
    avatar: { type: String, trim: true },

    dateOfBirth: {
      type: Date,
      validate: {
        validator(date) {
          if (!date) return true; // Opcional
          const age = (new Date() - date) / (365.25 * 24 * 60 * 60 * 1000);
          return age >= 13 && age <= 120;
        },
        message: 'Fecha de nacimiento inválida',
      },
    },

    // Para owners: referencia al negocio
    business: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Business',
  default: null,
  validate: {
    validator: function (businessId) {
      // Usuarios que NO son owner no deben tener business
      if (this.role && this.role !== USER_ROLES.OWNER) {
        return businessId == null;
      }
      // Owner puede tenerlo o no (válido en create y updates)
      return true;
    },
    message: 'Los usuarios que no son owner no pueden tener negocio asociado',
  },
},

    // Tokens de verificación y recuperación
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Configuraciones del usuario
    preferences: {
      language: { type: String, enum: ['es', 'en'], default: 'es' },
      timezone: { type: String, default: 'America/Costa_Rica' },
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true },
      },
    },

    // Información de sesión
    lastLogin: { type: Date },
    lastLoginIP: { type: String },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    // Metadatos
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, maxlength: [500, 'Las notas no pueden exceder 500 caracteres'] },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.__v;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ======================= VIRTUALS =======================
userSchema
  .virtual('password')
  .set(function (password) {
    this._plainPassword = password;
  })
  .get(function () {
    return this._plainPassword;
  });

userSchema.virtual('roleName').get(function () {
  const roleNames = {
    [USER_ROLES.OWNER]: 'Dueño de Negocio',
    [USER_ROLES.CLIENT]: 'Cliente',
    [USER_ROLES.ADMIN]: 'Administrador',
  };
  return roleNames[this.role] || this.role;
});

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  return Math.floor((new Date() - this.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000));
});

// ======================= ÍNDICES =======================
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ business: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });
userSchema.index(
  { fullName: 'text', email: 'text' },
  { weights: { fullName: 2, email: 1 }, name: 'user_search_index' }
);

// ======================= MIDDLEWARE =======================
// Hash antes de validar (para cumplir el required de passwordHash en create)
userSchema.pre('validate', async function (next) {
  try {
    if (this._plainPassword) {
      if (this._plainPassword.length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
        throw new Error(`La contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`);
      }
      if (!VALIDATION_PATTERNS.PASSWORD.test(this._plainPassword)) {
        throw new Error('La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial');
      }
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      this.passwordHash = await bcrypt.hash(this._plainPassword, saltRounds);
      this._plainPassword = undefined;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Limpiar business si el rol no es OWNER
userSchema.pre('save', function (next) {
  if (this.role !== USER_ROLES.OWNER) {
    this.business = undefined;
  }
  next();
});

// =================== MÉTODOS DE INSTANCIA ===================
userSchema.methods.validatePassword = async function (plainPassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.incLoginAttempts = async function () {
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 horas

  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $unset: { lockUntil: 1, loginAttempts: 1 } });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({ $unset: { lockUntil: 1, loginAttempts: 1 } });
};

userSchema.methods.recordLogin = async function (ip) {
  const updates = {
    lastLogin: new Date(),
    lastLoginIP: ip,
    $unset: { lockUntil: 1, loginAttempts: 1 },
  };
  return this.updateOne(updates);
};

// ✅ ESM: usar el import de arriba, NO require()
userSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  return token;
};

userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = token;
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
  return token;
};

userSchema.methods.canPerformActions = function () {
  return this.isActive && !this.isLocked && this.isEmailVerified;
};

// =================== MÉTODOS ESTÁTICOS ===================
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.findByRole = function (role) {
  return this.find({ role, isActive: true });
};

userSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        verified: { $sum: { $cond: ['$isEmailVerified', 1, 0] } },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      total: stat.count,
      active: stat.active,
      verified: stat.verified,
    };
    return acc;
  }, {});
};

// =================== CONFIGURACIÓN DEL MODELO ===================
userSchema.set('collection', 'users');

export default mongoose.model('User', userSchema);
