// controllers/user.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';
import { Business } from '../models/business.js';
import { controllerHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';
import { generateToken, generateRefreshToken } from '../utils/auth.js';
import { USER_ROLES } from '../config/constants.js';

export const userController = {
  
  // ============== PERFIL DE USUARIO ==============
  
  // Obtener perfil del usuario actual
  getCurrentUser: controllerHandler(async (req, res) => {
    const user = await User.findById(req.user.id)
      .select('-passwordHash -emailVerificationToken -passwordResetToken -loginAttempts -lockUntil')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Si es owner, agregar información de negocios
    let businessInfo = null;
    if (user.role === USER_ROLES.OWNER) {
      const businesses = await Business.find({ owner: user._id })
        .select('name status isActive')
        .lean();
      
      businessInfo = {
        totalBusinesses: businesses.length,
        activeBusinesses: businesses.filter(b => b.isActive).length,
        businesses: businesses
      };
    }

    logger.info('Perfil de usuario obtenido', {
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      data: {
        user,
        ...(businessInfo && { businessInfo })
      }
    });
  }, 'Get Current User'),

  // ============== ACTUALIZACIÓN DE PERFIL ==============
  
  // Actualizar perfil de usuario
  updateProfile: controllerHandler(async (req, res) => {
    const {
      fullName,
      username,
      phone,
      address,
      dateOfBirth,
      avatar,
      preferences,
      socialMedia
    } = req.body;

    // Validar que no se intenten modificar campos restringidos
    const restrictedFields = ['email', 'role', 'isActive', 'emailVerified', 'passwordHash'];
    const hasRestrictedFields = restrictedFields.some(field => req.body.hasOwnProperty(field));
    
    if (hasRestrictedFields) {
      return res.status(400).json({
        success: false,
        error: 'No se pueden modificar campos restringidos'
      });
    }

    // Verificar si el username ya está en uso (si se está cambiando)
    if (username) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: req.user.id } 
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'El nombre de usuario ya está en uso'
        });
      }
    }

    // Preparar datos de actualización
    const updateData = {
      ...(fullName && { fullName }),
      ...(username && { username }),
      ...(phone && { phone }),
      ...(address && { address }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(avatar && { avatar }),
      ...(preferences && { preferences }),
      ...(socialMedia && { socialMedia }),
      updatedAt: new Date()
    };

    // Actualizar usuario
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { 
        new: true, 
        runValidators: true,
        select: '-passwordHash -emailVerificationToken -passwordResetToken'
      }
    );

    logger.success('Perfil actualizado exitosamente', {
      userId: req.user.id,
      updatedFields: Object.keys(updateData),
      userEmail: updatedUser.email
    });

    res.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: { user: updatedUser }
    });
  }, 'Update Profile'),

  // ============== GESTIÓN DE CONTRASEÑA ==============
  
  // Cambiar contraseña
  changePassword: controllerHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validaciones básicas
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Las contraseñas no coinciden'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe tener al menos 6 caracteres'
      });
    }

    // Obtener usuario con contraseña
    const user = await User.findById(req.user.id).select('+passwordHash');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña actual incorrecta'
      });
    }

    // Verificar que la nueva contraseña sea diferente
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'La nueva contraseña debe ser diferente a la actual'
      });
    }

    // Hash de la nueva contraseña
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Actualizar contraseña
    await User.findByIdAndUpdate(req.user.id, {
      passwordHash: newPasswordHash,
      passwordChangedAt: new Date()
    });

    logger.success('Contraseña cambiada exitosamente', {
      userId: req.user.id,
      userEmail: user.email,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });
  }, 'Change Password'),

  // ============== CONFIGURACIONES DE USUARIO ==============
  
  // Actualizar preferencias de notificaciones
  updateNotificationPreferences: controllerHandler(async (req, res) => {
    const { email, sms, push, marketing } = req.body.notifications || {};

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        'preferences.notifications': {
          email: email ?? true,
          sms: sms ?? false,
          push: push ?? true,
          marketing: marketing ?? false
        }
      },
      { new: true, select: '-passwordHash' }
    );

    logger.info('Preferencias de notificación actualizadas', {
      userId: req.user.id,
      preferences: user.preferences.notifications
    });

    res.json({
      success: true,
      message: 'Preferencias de notificación actualizadas',
      data: { 
        preferences: user.preferences 
      }
    });
  }, 'Update Notification Preferences'),

  // Actualizar configuración de privacidad
  updatePrivacySettings: controllerHandler(async (req, res) => {
    const { profileVisibility, showContactInfo, allowMessages } = req.body.privacy || {};

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        'preferences.privacy': {
          profileVisibility: profileVisibility || 'public',
          showContactInfo: showContactInfo ?? true,
          allowMessages: allowMessages ?? true
        }
      },
      { new: true, select: '-passwordHash' }
    );

    res.json({
      success: true,
      message: 'Configuración de privacidad actualizada',
      data: { 
        privacy: user.preferences.privacy 
      }
    });
  }, 'Update Privacy Settings'),

  // ============== GESTIÓN DE CUENTA ==============
  
  // Activar/desactivar cuenta
  toggleAccountStatus: controllerHandler(async (req, res) => {
    const { isActive } = req.body;

    // Solo admins pueden desactivar cuentas de otros usuarios
    if (req.user.role !== USER_ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para realizar esta acción'
      });
    }

    const { userId } = req.params;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isActive: isActive ?? false,
        ...(isActive === false && { 
          deactivatedAt: new Date(),
          deactivatedBy: req.user.id 
        })
      },
      { new: true, select: '-passwordHash' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    logger.warn('Estado de cuenta cambiado', {
      targetUserId: userId,
      newStatus: isActive ? 'activated' : 'deactivated',
      changedBy: req.user.id
    });

    res.json({
      success: true,
      message: `Cuenta ${isActive ? 'activada' : 'desactivada'} exitosamente`,
      data: { user }
    });
  }, 'Toggle Account Status'),

  // Solicitar eliminación de cuenta
  requestAccountDeletion: controllerHandler(async (req, res) => {
    const { password, reason } = req.body;

    // Verificar contraseña
    const user = await User.findById(req.user.id).select('+passwordHash');
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Contraseña incorrecta'
      });
    }

    // Verificar si tiene negocios activos
    if (user.role === USER_ROLES.OWNER) {
      const activeBusinesses = await Business.countDocuments({
        owner: req.user.id,
        isActive: true
      });

      if (activeBusinesses > 0) {
        return res.status(400).json({
          success: false,
          error: 'No puedes eliminar tu cuenta mientras tengas negocios activos',
          data: { activeBusinesses }
        });
      }
    }

    // Marcar cuenta para eliminación
    await User.findByIdAndUpdate(req.user.id, {
      deletionRequested: true,
      deletionRequestedAt: new Date(),
      deletionReason: reason || 'No especificado'
    });

    logger.warn('Solicitud de eliminación de cuenta', {
      userId: req.user.id,
      userEmail: user.email,
      reason: reason || 'No especificado'
    });

    res.json({
      success: true,
      message: 'Solicitud de eliminación procesada. Tu cuenta será eliminada en 30 días.'
    });
  }, 'Request Account Deletion'),

  // ============== ADMINISTRACIÓN (SOLO ADMINS) ==============
  
  // Listar usuarios (solo admins)
  getAllUsers: controllerHandler(async (req, res) => {
    if (req.user.role !== USER_ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado'
      });
    }

    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construir filtros
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

    // Configurar ordenamiento
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Ejecutar consulta con paginación
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filters)
        .sort(sortConfig)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-passwordHash -emailVerificationToken -passwordResetToken')
        .lean(),
      User.countDocuments(filters)
    ]);

    // Agregar estadísticas de negocios para owners
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        if (user.role === USER_ROLES.OWNER) {
          const businessCount = await Business.countDocuments({ owner: user._id });
          return { ...user, businessCount };
        }
        return user;
      })
    );

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      }
    });
  }, 'Get All Users'),

  // Obtener usuario por ID (admin)
  getUserById: controllerHandler(async (req, res) => {
    if (req.user.role !== USER_ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado'
      });
    }

    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-passwordHash -emailVerificationToken -passwordResetToken')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Agregar información adicional si es owner
    let additionalInfo = {};
    if (user.role === USER_ROLES.OWNER) {
      const businesses = await Business.find({ owner: userId })
        .select('name status isActive createdAt')
        .lean();
      
      additionalInfo.businesses = businesses;
      additionalInfo.businessStats = {
        total: businesses.length,
        active: businesses.filter(b => b.isActive).length
      };
    }

    res.json({
      success: true,
      data: {
        user,
        ...additionalInfo
      }
    });
  }, 'Get User By ID'),

  // Actualizar rol de usuario (admin)
  updateUserRole: controllerHandler(async (req, res) => {
    if (req.user.role !== USER_ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Acceso denegado'
      });
    }

    const { userId } = req.params;
    const { role } = req.body;

    if (!Object.values(USER_ROLES).includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Rol inválido'
      });
    }

    // No permitir cambiar el rol del último admin
    if (role !== USER_ROLES.ADMIN) {
      const adminCount = await User.countDocuments({ 
        role: USER_ROLES.ADMIN, 
        isActive: true 
      });
      
      const targetUser = await User.findById(userId);
      if (targetUser.role === USER_ROLES.ADMIN && adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'No se puede cambiar el rol del último administrador'
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        role,
        roleChangedAt: new Date(),
        roleChangedBy: req.user.id
      },
      { new: true, select: '-passwordHash' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    logger.success('Rol de usuario actualizado', {
      targetUserId: userId,
      newRole: role,
      changedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Rol actualizado exitosamente',
      data: { user }
    });
  }, 'Update User Role'),

  // ============== ESTADÍSTICAS DE USUARIO ==============
  
  // Obtener estadísticas del dashboard del usuario
  getUserDashboardStats: controllerHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    
    let stats = {
      user: {
        memberSince: user.createdAt,
        lastLogin: user.lastLogin,
        profileComplete: calculateProfileCompleteness(user)
      }
    };

    // Estadísticas específicas por rol
    if (user.role === USER_ROLES.OWNER) {
      const businesses = await Business.find({ owner: req.user.id });
      
      stats.business = {
        total: businesses.length,
        active: businesses.filter(b => b.isActive).length,
        draft: businesses.filter(b => b.status === 'draft').length
      };

      // TODO: Agregar estadísticas de reservas cuando esté implementado
    }

    res.json({
      success: true,
      data: stats
    });
  }, 'Get User Dashboard Stats')
};

// ============== FUNCIONES AUXILIARES ==============

// Calcular completitud del perfil
const calculateProfileCompleteness = (user) => {
  const requiredFields = ['fullName', 'email', 'phone'];
  const optionalFields = ['avatar', 'dateOfBirth', 'address'];
  
  const completedRequired = requiredFields.filter(field => user[field]).length;
  const completedOptional = optionalFields.filter(field => user[field]).length;
  
  const requiredScore = (completedRequired / requiredFields.length) * 70; // 70% weight
  const optionalScore = (completedOptional / optionalFields.length) * 30; // 30% weight
  
  return Math.round(requiredScore + optionalScore);
};

export default userController;