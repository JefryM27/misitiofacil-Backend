// src/controllers/auth.controller.js
import User from '../models/user.js';
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth.js';

import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  ValidationError,
  AuthenticationError,
  ConflictError,
  throwIfNotFound,
} from '../middleware/errorHandler.js';

import { constants, logger } from '../config/index.js';

const {
  SUCCESS_MESSAGES,
  APP_LIMITS,
  VALIDATION_PATTERNS,
  USER_ROLES,
} = constants;

/* ─────────────────────────────────────────────────────────────
 * REGISTRO
 * ────────────────────────────────────────────────────────────*/
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body || {};

  if (!fullName || !email || !password) {
    throw new ValidationError('Todos los campos son requeridos');
  }
  if (!VALIDATION_PATTERNS.EMAIL.test(String(email))) {
    throw new ValidationError('Formato de email inválido');
  }
  if (String(password).length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`La contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (VALIDATION_PATTERNS.PASSWORD && !VALIDATION_PATTERNS.PASSWORD.test(String(password))) {
    // Solo si definiste un patrón fuerte en constants
    throw new ValidationError('La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial');
  }

  const exists = await User.exists({ email: String(email).toLowerCase().trim() });
  if (exists) throw new ConflictError('El email ya está registrado');

  // ✅ Como pediste: rol OWNER y virtual password
  const user = new User({
    fullName: String(fullName).trim(),
    email: String(email).toLowerCase().trim(),
    role: USER_ROLES.OWNER,
  });
  user.password = String(password); // Virtual que setea passwordHash

  try {
    await user.save();
  } catch (e) {
    if (e?.code === 11000) {
      throw new ConflictError('El email ya está registrado');
    }
    throw e;
  }

  logger.info('Usuario registrado', {
    userId: user._id,
    email: user.email,
    role: user.role,
    ip: req.ip,
  });

  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Respuesta compatible con tu FE
  res.status(201).json({
    success: true,
    message: SUCCESS_MESSAGES?.USER_CREATED || 'Usuario creado exitosamente',
    user: user.toJSON(),
    token,
    refreshToken,
    data: {
      user: user.toJSON(),
      token,
      refreshToken,
    },
  });
});

/* ─────────────────────────────────────────────────────────────
 * LOGIN
 * ────────────────────────────────────────────────────────────*/
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ValidationError('Email y contraseña son requeridos');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+passwordHash');
  throwIfNotFound(user, 'Credenciales inválidas');

  if (user.isLocked) {
    await user.incLoginAttempts();
    logger.warn('Intento de login en cuenta bloqueada', { email, ip: req.ip, lockUntil: user.lockUntil });
    throw new AuthenticationError('Cuenta bloqueada temporalmente por múltiples intentos fallidos');
  }

  const ok = await user.validatePassword(String(password));
  if (!ok) {
    await user.incLoginAttempts();
    logger.warn('Intento de login fallido', { email, ip: req.ip, attempts: user.loginAttempts + 1 });
    throw new AuthenticationError('Credenciales inválidas');
  }

  if (!user.isActive) {
    logger.warn('Intento de login en cuenta inactiva', { email, ip: req.ip });
    throw new AuthenticationError('Cuenta desactivada');
  }

  await user.resetLoginAttempts();
  await user.recordLogin(req.ip);

  logger.info('Login exitoso', { userId: user._id, email: user.email, ip: req.ip });

  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  res.json({
    success: true,
    message: SUCCESS_MESSAGES?.LOGIN_SUCCESS || 'Login exitoso',
    user: user.toJSON(),
    token,
    refreshToken,
    data: {
      user: user.toJSON(),
      token,
      refreshToken,
    },
  });
});

/* ─────────────────────────────────────────────────────────────
 * QUIÉN SOY (sesión actual)
 * ────────────────────────────────────────────────────────────*/
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('_id fullName email role isActive');
  if (!user) {
    return res.status(401).json({ success: false, error: 'Sesión inválida' });
  }
  res.json({
    success: true,
    user: {
      id: String(user._id),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

/* ─────────────────────────────────────────────────────────────
 * REQUEST PASSWORD RESET
 * ────────────────────────────────────────────────────────────*/
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email) throw new ValidationError('El email es requerido');
  if (!VALIDATION_PATTERNS.EMAIL.test(String(email))) throw new ValidationError('Formato de email inválido');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });

  const successResponse = {
    success: true,
    message: 'Si el email existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña',
  };

  if (!user) {
    logger.info('Reset solicitado para email inexistente', { email, ip: req.ip });
    return res.json(successResponse);
  }

  if (user.passwordResetExpires && user.passwordResetExpires > new Date()) {
    const mins = Math.ceil((user.passwordResetExpires - new Date()) / 60000);
    logger.warn('Reset duplicado solicitado', { email, ip: req.ip, mins });
    throw new ValidationError(`Ya solicitaste un reset reciente. Intenta de nuevo en ${mins} minutos`);
  }

  const resetToken = user.generatePasswordResetToken();
  await user.save();

  try {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // TODO: enviar email con resetUrl
    logger.info('Reset password solicitado', { userId: user._id, email: user.email, ip: req.ip, resetUrl });

    return res.json(successResponse);
  } catch (e) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    logger.error('Error enviando email de reset', { email, ip: req.ip, error: e.message });
    throw new Error('Error interno del servidor');
  }
});

/* ─────────────────────────────────────────────────────────────
 * RESET PASSWORD
 * ────────────────────────────────────────────────────────────*/
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, email, newPassword } = req.body || {};

  if (!token || !email || !newPassword) {
    throw new ValidationError('Token, email y nueva contraseña son requeridos');
  }

  if (String(newPassword).length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`La contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (VALIDATION_PATTERNS.PASSWORD && !VALIDATION_PATTERNS.PASSWORD.test(String(newPassword))) {
    throw new ValidationError('La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial');
  }

  const user = await User.findOne({
    email: String(email).toLowerCase().trim(),
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() },
  });

  throwIfNotFound(user, 'Token inválido o expirado');

  user.password = String(newPassword);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.resetLoginAttempts();
  await user.save();

  logger.info('Contraseña restablecida exitosamente', { userId: user._id, email: user.email, ip: req.ip });

  res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
});

/* ─────────────────────────────────────────────────────────────
 * REFRESH TOKEN
 * ────────────────────────────────────────────────────────────*/
export const refreshToken = asyncHandler(async (req, res) => {
  // evitar sombra de nombres
  const { refreshToken: providedRefresh } = req.body || {};
  if (!providedRefresh) throw new ValidationError('Refresh token requerido');

  try {
    const payload = verifyRefreshToken(providedRefresh);
    const user = await User.findById(payload.id);
    throwIfNotFound(user, 'Usuario no encontrado');
    if (!user.isActive) throw new AuthenticationError('Cuenta desactivada');

    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    logger.info('Token renovado', { userId: user._id, ip: req.ip });

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
      data: { token: newToken, refreshToken: newRefreshToken },
    });
  } catch (error) {
    logger.warn('Refresh token inválido', { ip: req.ip, error: error.message });
    throw new AuthenticationError('Refresh token inválido');
  }
});

/* ─────────────────────────────────────────────────────────────
 * LOGOUT
 * ────────────────────────────────────────────────────────────*/
export const logout = asyncHandler(async (req, res) => {
  if (req.user) logger.info('Usuario cerró sesión', { userId: req.user.id, ip: req.ip });
  res.json({ success: true, message: 'Sesión cerrada exitosamente' });
});

/* ─────────────────────────────────────────────────────────────
 * PERFIL
 * ────────────────────────────────────────────────────────────*/
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate('business', 'name slug status');
  throwIfNotFound(user, 'Usuario no encontrado');
  res.json({ success: true, data: { user } });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, dateOfBirth, preferences } = req.body || {};

  const user = await User.findById(req.user.id);
  throwIfNotFound(user, 'Usuario no encontrado');

  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  if (fullName) user.fullName = String(fullName).trim();
  if (phone !== undefined) user.phone = phone;

  if (dateOfBirth) {
    const birthDate = new Date(dateOfBirth);
    const age = (new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 13 || age > 120) throw new ValidationError('Fecha de nacimiento inválida');
    user.dateOfBirth = birthDate;
  }

  if (preferences) user.preferences = { ...user.preferences, ...preferences };

  await user.save();

  logger.info('Perfil actualizado', { userId: user._id, ip: req.ip });
  res.json({ success: true, message: 'Perfil actualizado exitosamente', data: { user } });
});

/* ─────────────────────────────────────────────────────────────
 * CAMBIAR CONTRASEÑA
 * ────────────────────────────────────────────────────────────*/
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    throw new ValidationError('Contraseña actual y nueva contraseña son requeridas');
  }

  const user = await User.findById(req.user.id).select('+passwordHash');
  throwIfNotFound(user, 'Usuario no encontrado');

  const ok = await user.validatePassword(String(currentPassword));
  if (!ok) {
    logger.warn('Cambio de contraseña con contraseña actual incorrecta', { userId: user._id, ip: req.ip });
    throw new AuthenticationError('Contraseña actual incorrecta');
  }

  if (String(newPassword).length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`La nueva contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (VALIDATION_PATTERNS.PASSWORD && !VALIDATION_PATTERNS.PASSWORD.test(String(newPassword))) {
    throw new ValidationError('La nueva contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial');
  }

  const same = await user.validatePassword(String(newPassword));
  if (same) throw new ValidationError('La nueva contraseña debe ser diferente a la actual');

  user.password = String(newPassword);
  await user.save();

  logger.info('Contraseña cambiada', { userId: user._id, ip: req.ip });
  res.json({ success: true, message: 'Contraseña cambiada exitosamente' });
});

/* ─────────────────────────────────────────────────────────────
 * STUBS
 * ────────────────────────────────────────────────────────────*/
export const verifyEmail = asyncHandler(async (_req, res) => {
  res.status(501).json({ success: false, error: 'No implementado aún' });
});

export const resendVerification = asyncHandler(async (_req, res) => {
  res.status(501).json({ success: false, error: 'No implementado aún' });
});

export default {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  me,
  verifyEmail,
  resendVerification,
};
