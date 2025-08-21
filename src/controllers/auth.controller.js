// src/controllers/authController.js - VERSIÓN CORREGIDA
import User from '../models/user.js';
import { 
  generateToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} from '../middleware/auth.js';

// ✅ IMPORTACIONES CORREGIDAS - separar asyncHandler de errorHandler
import { asyncHandler } from '../middleware/asyncHandler.js';
import { 
  ValidationError, 
  AuthenticationError,
  NotFoundError,
  ConflictError,
  throwIfNotFound 
} from '../middleware/errorHandler.js';

// ✅ O USAR EL ÍNDICE PRINCIPAL (opción alternativa)
// import { 
//   asyncHandler,
//   ValidationError, 
//   AuthenticationError,
//   NotFoundError,
//   ConflictError,
//   throwIfNotFound 
// } from '../middleware/index.js';

import { constants, logger } from '../config/index.js';
import crypto from 'crypto';

const { ERROR_MESSAGES, SUCCESS_MESSAGES, APP_LIMITS, VALIDATION_PATTERNS } = constants;

// 🔐 REGISTRO DE USUARIO
export const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, role = 'client' } = req.body;

  // Validar campos requeridos
  if (!fullName || !email || !password) {
    throw new ValidationError('Todos los campos son requeridos');
  }

  // Verificar si el usuario ya existe
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new ConflictError('El email ya está registrado');
  }

  // Crear usuario
  const user = new User({
    fullName: fullName.trim(),
    email: email.toLowerCase().trim(),
    _plainPassword: password, // Se hashea automáticamente en el pre-save
    role
  });

  await user.save();

  // Log del registro
  logger.info('Usuario registrado', { 
    userId: user._id, 
    email: user.email, 
    role: user.role,
    ip: req.ip 
  });

  // Generar tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Respuesta sin datos sensibles
  const userData = user.toJSON();

  res.status(201).json({
    success: true,
    message: SUCCESS_MESSAGES.USER_CREATED || 'Usuario creado exitosamente',
    data: {
      user: userData,
      token,
      refreshToken
    }
  });
});

// 🔑 LOGIN
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError('Email y contraseña son requeridos');
  }

  // Buscar usuario con contraseña incluida
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordHash');

  throwIfNotFound(user, 'Credenciales inválidas');

  // Verificar si la cuenta está bloqueada
  if (user.isLocked) {
    await user.incLoginAttempts();
    logger.warn('Intento de login en cuenta bloqueada', { 
      email, 
      ip: req.ip,
      lockUntil: user.lockUntil 
    });
    throw new AuthenticationError('Cuenta bloqueada temporalmente por múltiples intentos fallidos');
  }

  // Validar contraseña
  const isValidPassword = await user.validatePassword(password);
  if (!isValidPassword) {
    await user.incLoginAttempts();
    logger.warn('Intento de login fallido', { 
      email, 
      ip: req.ip,
      attempts: user.loginAttempts + 1 
    });
    throw new AuthenticationError('Credenciales inválidas');
  }

  // Verificar si la cuenta está activa
  if (!user.isActive) {
    logger.warn('Intento de login en cuenta inactiva', { email, ip: req.ip });
    throw new AuthenticationError('Cuenta desactivada');
  }

  // Login exitoso - resetear intentos y registrar
  await user.resetLoginAttempts();
  await user.recordLogin(req.ip);

  logger.info('Login exitoso', { 
    userId: user._id, 
    email: user.email, 
    ip: req.ip 
  });

  // Generar tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Respuesta
  const userData = user.toJSON();
  
  res.json({
    success: true,
    message: SUCCESS_MESSAGES.LOGIN_SUCCESS || 'Login exitoso',
    data: {
      user: userData,
      token,
      refreshToken
    }
  });
});

// 📧 SOLICITAR RESET DE CONTRASEÑA
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ValidationError('El email es requerido');
  }

  // Validar formato de email
  if (!VALIDATION_PATTERNS.EMAIL.test(email)) {
    throw new ValidationError('Formato de email inválido');
  }

  // Buscar usuario
  const user = await User.findOne({ email: email.toLowerCase() });
  
  // Por seguridad, siempre responder exitosamente
  const successResponse = {
    success: true,
    message: 'Si el email existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña'
  };

  if (!user) {
    logger.info('Reset solicitado para email inexistente', { email, ip: req.ip });
    return res.json(successResponse);
  }

  // Verificar si ya hay un token activo reciente
  if (user.passwordResetExpires && user.passwordResetExpires > new Date()) {
    const timeRemaining = Math.ceil((user.passwordResetExpires - new Date()) / 1000 / 60);
    logger.warn('Reset duplicado solicitado', { 
      email, 
      ip: req.ip,
      timeRemaining 
    });
    throw new ValidationError(
      `Ya solicitaste un reset reciente. Intenta de nuevo en ${timeRemaining} minutos`
    );
  }

  // Generar token de reset
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  try {
    // Crear URL de reset
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // TODO: Implementar envío de email cuando tengas configurado sendEmail
    // const template = emailTemplates.passwordReset(resetUrl, user.fullName);
    // await sendEmail(user.email, template);

    logger.info('Reset password solicitado', { 
      userId: user._id, 
      email: user.email, 
      ip: req.ip 
    });

    res.json(successResponse);

  } catch (emailError) {
    // Limpiar token si falla el envío
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.error('Error enviando email de reset', { 
      email, 
      ip: req.ip,
      error: emailError.message 
    });
    
    throw new Error('Error interno del servidor');
  }
});

// 🔄 RESTABLECER CONTRASEÑA
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, email, newPassword } = req.body;

  if (!token || !email || !newPassword) {
    throw new ValidationError('Token, email y nueva contraseña son requeridos');
  }

  // Validar longitud de contraseña
  if (newPassword.length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`
    );
  }

  // Validar complejidad de contraseña
  if (!VALIDATION_PATTERNS.PASSWORD.test(newPassword)) {
    throw new ValidationError(
      'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial'
    );
  }

  // Buscar usuario con token válido
  const user = await User.findOne({
    email: email.toLowerCase(),
    passwordResetToken: token,
    passwordResetExpires: { $gt: new Date() }
  });

  throwIfNotFound(user, 'Token inválido o expirado');

  // Cambiar contraseña
  user._plainPassword = newPassword; // Se hashea automáticamente
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  
  // Resetear intentos de login por seguridad
  await user.resetLoginAttempts();
  
  await user.save();

  logger.info('Contraseña restablecida exitosamente', { 
    userId: user._id, 
    email: user.email, 
    ip: req.ip 
  });

  res.json({
    success: true,
    message: 'Contraseña actualizada exitosamente'
  });
});

// 🔄 REFRESH TOKEN
export const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new ValidationError('Refresh token requerido');
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.id);

    throwIfNotFound(user, 'Usuario no encontrado');

    if (!user.isActive) {
      throw new AuthenticationError('Cuenta desactivada');
    }

    // Generar nuevos tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    logger.info('Token renovado', { userId: user._id, ip: req.ip });

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    logger.warn('Refresh token inválido', { ip: req.ip, error: error.message });
    throw new AuthenticationError('Refresh token inválido');
  }
});

// 🚪 LOGOUT
export const logout = asyncHandler(async (req, res) => {
  // Log del logout si hay usuario autenticado
  if (req.user) {
    logger.info('Usuario cerró sesión', { 
      userId: req.user.id, 
      ip: req.ip 
    });
  }
  
  res.json({
    success: true,
    message: 'Sesión cerrada exitosamente'
  });
});

// 👤 OBTENER PERFIL ACTUAL
export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate('business', 'name slug status');

  throwIfNotFound(user, 'Usuario no encontrado');

  res.json({
    success: true,
    data: { user }
  });
});

// ✏️ ACTUALIZAR PERFIL
export const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, dateOfBirth, preferences } = req.body;
  
  const user = await User.findById(req.user.id);
  throwIfNotFound(user, 'Usuario no encontrado');

  // Validar teléfono si se proporciona
  if (phone && !VALIDATION_PATTERNS.PHONE_CR.test(phone) && !VALIDATION_PATTERNS.PHONE_INTERNATIONAL.test(phone)) {
    throw new ValidationError('Formato de teléfono inválido');
  }

  // Actualizar campos permitidos
  if (fullName) user.fullName = fullName.trim();
  if (phone !== undefined) user.phone = phone;
  if (dateOfBirth) {
    const birthDate = new Date(dateOfBirth);
    const age = (new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 13 || age > 120) {
      throw new ValidationError('Fecha de nacimiento inválida');
    }
    user.dateOfBirth = birthDate;
  }
  if (preferences) user.preferences = { ...user.preferences, ...preferences };

  await user.save();

  logger.info('Perfil actualizado', { userId: user._id, ip: req.ip });

  res.json({
    success: true,
    message: 'Perfil actualizado exitosamente',
    data: { user }
  });
});

// 🔐 CAMBIAR CONTRASEÑA (usuario autenticado)
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Contraseña actual y nueva contraseña son requeridas');
  }

  const user = await User.findById(req.user.id).select('+passwordHash');
  throwIfNotFound(user, 'Usuario no encontrado');

  // Verificar contraseña actual
  const isValid = await user.validatePassword(currentPassword);
  if (!isValid) {
    logger.warn('Cambio de contraseña con contraseña actual incorrecta', { 
      userId: user._id, 
      ip: req.ip 
    });
    throw new AuthenticationError('Contraseña actual incorrecta');
  }

  // Validar nueva contraseña
  if (newPassword.length < APP_LIMITS.MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `La nueva contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`
    );
  }

  if (!VALIDATION_PATTERNS.PASSWORD.test(newPassword)) {
    throw new ValidationError(
      'La nueva contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial'
    );
  }

  // Verificar que la nueva contraseña sea diferente
  const isSamePassword = await user.validatePassword(newPassword);
  if (isSamePassword) {
    throw new ValidationError('La nueva contraseña debe ser diferente a la actual');
  }

  // Cambiar contraseña
  user._plainPassword = newPassword;
  await user.save();

  logger.info('Contraseña cambiada', { userId: user._id, ip: req.ip });

  res.json({
    success: true,
    message: 'Contraseña cambiada exitosamente'
  });
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
  changePassword
};