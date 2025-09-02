// src/controllers/user.controller.js
import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import Business from '../models/business.js';
import { controllerHandler } from '../middleware/asyncHandler.js';
import { logger } from '../middleware/logger.js';
import { USER_ROLES } from '../config/constants.js';

// util para whitelistear campos
const pick = (obj = {}, allowed = []) =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => allowed.includes(k)));

const getUserId = (req) =>
  req.user?.id || req.user?._id || req.auth?.id || req.userId;

// ──────────────────────────────────────────────────────────────────────────────
// PERFIL
// ──────────────────────────────────────────────────────────────────────────────
const getCurrentUser = controllerHandler(async (req, res) => {
  const user = await User.findById(getUserId(req))
    .select('-passwordHash -emailVerificationToken -passwordResetToken -loginAttempts -lockUntil')
    .lean();

  if (!user) {
    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
  }

  let businessInfo = null;
  if (user.role === USER_ROLES.OWNER) {
    const businesses = await Business.find({ owner: user._id })
      .select('name status isActive')
      .lean();

    businessInfo = {
      totalBusinesses: businesses.length,
      activeBusinesses: businesses.filter(b => b.isActive).length,
      businesses
    };
  }

  logger.info('Perfil de usuario obtenido', { userId: user._id, email: user.email, role: user.role });

  res.json({ success: true, data: { user, ...(businessInfo && { businessInfo }) } });
}, 'Get Current User');

// ──────────────────────────────────────────────────────────────────────────────
// ACTUALIZAR PERFIL
// (solo campos que existen en tu schema)
// ──────────────────────────────────────────────────────────────────────────────
const updateProfile = controllerHandler(async (req, res) => {
  const restrictedFields = ['email', 'role', 'isActive', 'isEmailVerified', 'passwordHash'];
  if (restrictedFields.some((f) => Object.prototype.hasOwnProperty.call(req.body, f))) {
    return res.status(400).json({ success: false, error: 'No se pueden modificar campos restringidos' });
  }

  const allowed = ['fullName', 'username', 'phone', 'dateOfBirth', 'avatar', 'preferences'];
  const data = pick(req.body, allowed);

  const updatedUser = await User.findByIdAndUpdate(
    getUserId(req),
    { ...data, updatedAt: new Date() },
    { new: true, runValidators: true, select: '-passwordHash -emailVerificationToken -passwordResetToken' }
  );

  if (!updatedUser) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

  logger.info('Perfil actualizado', { userId: updatedUser._id, updatedFields: Object.keys(data) });

  res.json({ success: true, message: 'Perfil actualizado exitosamente', data: { user: updatedUser } });
}, 'Update Profile');

// ──────────────────────────────────────────────────────────────────────────────
// CAMBIAR CONTRASEÑA (usa el virtual `password` → hash en el modelo)
// ──────────────────────────────────────────────────────────────────────────────
const changePassword = controllerHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, error: 'Todos los campos son requeridos' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, error: 'Las contraseñas no coinciden' });
  }

  const user = await User.findById(getUserId(req)).select('+passwordHash');
  if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ success: false, error: 'Contraseña actual incorrecta' });

  // usar el virtual del modelo
  user.password = newPassword;
  await user.save();

  logger.info('Contraseña actualizada', { userId: user._id });
  res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
}, 'Change Password');

// ──────────────────────────────────────────────────────────────────────────────
// PREFERENCIAS (solo campos existentes en el schema)
// ──────────────────────────────────────────────────────────────────────────────
const updateNotificationPreferences = controllerHandler(async (req, res) => {
  const { email, sms, push } = req.body?.notifications || {};
  const user = await User.findByIdAndUpdate(
    getUserId(req),
    {
      'preferences.notifications.email': email ?? true,
      'preferences.notifications.sms': sms ?? false,
      'preferences.notifications.push': push ?? true
    },
    { new: true, select: '-passwordHash' }
  );

  logger.info('Preferencias de notificación actualizadas', {
    userId: user?._id,
    preferences: user?.preferences?.notifications
  });

  res.json({ success: true, message: 'Preferencias de notificación actualizadas', data: { preferences: user.preferences } });
}, 'Update Notification Preferences');

// Idioma/Zona horaria (evita preferences.privacy que no existe en el schema)
const updatePrivacySettings = controllerHandler(async (req, res) => {
  const { language, timezone } = req.body || {};
  const user = await User.findByIdAndUpdate(
    getUserId(req),
    {
      ...(language && { 'preferences.language': language }),
      ...(timezone && { 'preferences.timezone': timezone })
    },
    { new: true, select: '-passwordHash' }
  );
  res.json({ success: true, message: 'Preferencias actualizadas', data: { preferences: user.preferences } });
}, 'Update Privacy Settings');

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN
// ──────────────────────────────────────────────────────────────────────────────
const getAllUsers = controllerHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }

  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
  const { role, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const filters = {};
  if (role) filters.role = role;
  if (isActive !== undefined) filters.isActive = isActive === 'true';
  if (search) {
    filters.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } }
    ];
  }

  const sortConfig = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [users, total] = await Promise.all([
    User.find(filters)
      .sort(sortConfig)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-passwordHash -emailVerificationToken -passwordResetToken')
      .lean(),
    User.countDocuments(filters)
  ]);

  const usersWithStats = await Promise.all(
    users.map(async (u) => {
      if (u.role === USER_ROLES.OWNER) {
        const businessCount = await Business.countDocuments({ owner: u._id });
        return { ...u, businessCount };
      }
      return u;
    })
  );

  res.json({
    success: true,
    data: {
      users: usersWithStats,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      }
    }
  });
}, 'Get All Users');

const getUserById = controllerHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }

  const { userId } = req.params;
  const user = await User.findById(userId)
    .select('-passwordHash -emailVerificationToken -passwordResetToken')
    .lean();

  if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

  let additionalInfo = {};
  if (user.role === USER_ROLES.OWNER) {
    const businesses = await Business.find({ owner: userId }).select('name status isActive createdAt').lean();
    additionalInfo = {
      businesses,
      businessStats: { total: businesses.length, active: businesses.filter(b => b.isActive).length }
    };
  }

  res.json({ success: true, data: { user, ...additionalInfo } });
}, 'Get User By ID');

const updateUserRole = controllerHandler(async (req, res) => {
  if (req.user.role !== USER_ROLES.ADMIN) {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }

  const { userId } = req.params;
  const { role } = req.body;

  if (!Object.values(USER_ROLES).includes(role)) {
    return res.status(400).json({ success: false, error: 'Rol inválido' });
  }

  // No dejar sin admins
  if (role !== USER_ROLES.ADMIN) {
    const adminCount = await User.countDocuments({ role: USER_ROLES.ADMIN, isActive: true });
    const target = await User.findById(userId);
    if (target?.role === USER_ROLES.ADMIN && adminCount <= 1) {
      return res.status(400).json({ success: false, error: 'No se puede cambiar el rol del último administrador' });
    }
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { role, roleChangedAt: new Date(), roleChangedBy: getUserId(req) },
    { new: true, select: '-passwordHash' }
  );

  if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });

  logger.info('Rol de usuario actualizado', { targetUserId: userId, newRole: role, changedBy: getUserId(req) });
  res.json({ success: true, message: 'Rol actualizado exitosamente', data: { user } });
}, 'Update User Role');

// Dashboard simple
const getUserDashboardStats = controllerHandler(async (req, res) => {
  const user = await User.findById(getUserId(req));
  const stats = {
    user: {
      memberSince: user.createdAt,
      lastLogin: user.lastLogin,
      profileComplete: calculateProfileCompleteness(user),
    },
  };

  if (user.role === USER_ROLES.OWNER) {
    const businesses = await Business.find({ owner: getUserId(req) });
    stats.business = {
      total: businesses.length,
      active: businesses.filter((b) => b.isActive).length,
      draft: businesses.filter((b) => b.status === 'draft').length,
    };
  }

  res.json({ success: true, data: stats });
}, 'Get User Dashboard Stats');

// ──────────────────────────────────────────────────────────────────────────────
// CREATE (Admin) — útil para tener POST /api/users en "Users"
// ──────────────────────────────────────────────────────────────────────────────
const create = controllerHandler(async (req, res) => {
  const { email, password, fullName, username, role = USER_ROLES.OWNER, country, phone } = req.body || {};
  if (!email || !password || !fullName) {
    return res.status(400).json({ success: false, error: 'Faltan campos requeridos: email, password, fullName' });
  }

  const exists = await User.exists({ email: email.toLowerCase().trim() });
  if (exists) return res.status(409).json({ success: false, error: 'El email ya está registrado' });

  const user = new User({ email, fullName, username, role, country, phone });
  user.password = password; // virtual → hash en el modelo
  await user.save();

  res.status(201).json({ success: true, data: { user } });
}, 'Create User (Admin)');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const calculateProfileCompleteness = (user) => {
  const required = ['fullName', 'email', 'phone'];
  const optional = ['avatar', 'dateOfBirth'];

  const r = required.filter((f) => user[f]).length;
  const o = optional.filter((f) => user[f]).length;

  return Math.round((r / required.length) * 70 + (o / optional.length || 1) * 30);
};

// ──────────────────────────────────────────────────────────────────────────────
// Export: compatibilidad con tus rutas y con mis ejemplos previos
// ──────────────────────────────────────────────────────────────────────────────
const userController = {
  // nombres “amigables”
  getCurrentUser,
  updateProfile,
  changePassword,
  updateNotificationPreferences,
  updatePrivacySettings,
  getAllUsers,
  getUserById,
  updateUserRole,
  getUserDashboardStats,
  create,

  // alias para el router que te propuse
  me: getCurrentUser,
  updateMe: updateProfile,
  list: getAllUsers,
  getById: getUserById,
};

export default userController;
