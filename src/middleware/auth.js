import jwt from 'jsonwebtoken';
import { constants } from '../config/index.js';

const { USER_ROLES, ERROR_MESSAGES } = constants;

// Middleware principal de autenticación
export const auth = (roles = []) => {
  // Convertir roles a array si es string
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    try {
      // Verificar que existe el header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ 
          error: 'Authentication required',
          message: ERROR_MESSAGES.ACCESS_DENIED,
          code: 'NO_TOKEN'
        });
      }

      // Verificar formato del header (Bearer TOKEN)
      const headerParts = authHeader.split(' ');
      if (headerParts.length !== 2 || headerParts[0] !== 'Bearer') {
        return res.status(401).json({
          error: 'Invalid token format',
          message: 'Token debe tener formato: Bearer <token>',
          code: 'INVALID_TOKEN_FORMAT'
        });
      }

      const token = headerParts[1];

      // Verificar y decodificar token
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      // Verificar que el token tiene los campos requeridos
      if (!payload.id || !payload.email) {
        return res.status(401).json({
          error: 'Invalid token payload',
          message: ERROR_MESSAGES.INVALID_TOKEN,
          code: 'INVALID_PAYLOAD'
        });
      }

      // Verificar rol si se especificó
      if (roles.length > 0) {
        if (!payload.role || !roles.includes(payload.role)) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            message: ERROR_MESSAGES.ACCESS_DENIED,
            code: 'INSUFFICIENT_ROLE',
            requiredRoles: roles,
            userRole: payload.role || null
          });
        }
      }

      // Agregar información del usuario al request
      req.user = {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        businessId: payload.businessId || null, // Para owners
        iat: payload.iat,
        exp: payload.exp
      };

      next();

    } catch (error) {
      // Manejar diferentes tipos de errores JWT
      let errorResponse = {
        error: 'Authentication failed',
        message: ERROR_MESSAGES.INVALID_TOKEN,
        code: 'AUTH_ERROR'
      };

      if (error.name === 'TokenExpiredError') {
        errorResponse.message = 'Token expirado';
        errorResponse.code = 'TOKEN_EXPIRED';
        errorResponse.expiredAt = error.expiredAt;
      } else if (error.name === 'JsonWebTokenError') {
        errorResponse.message = 'Token malformado';
        errorResponse.code = 'MALFORMED_TOKEN';
      } else if (error.name === 'NotBeforeError') {
        errorResponse.message = 'Token no válido aún';
        errorResponse.code = 'TOKEN_NOT_ACTIVE';
      }

      return res.status(401).json(errorResponse);
    }
  };
};

// Middleware específicos por rol
export const requireOwner = auth([USER_ROLES.OWNER]);
export const requireAdmin = auth([USER_ROLES.ADMIN]);
export const requireClient = auth([USER_ROLES.CLIENT]);

// Middleware para múltiples roles
export const requireOwnerOrAdmin = auth([USER_ROLES.OWNER, USER_ROLES.ADMIN]);
export const requireClientOrOwner = auth([USER_ROLES.CLIENT, USER_ROLES.OWNER]);
export const requireAnyRole = auth([USER_ROLES.OWNER, USER_ROLES.CLIENT, USER_ROLES.ADMIN]);

// Middleware opcional (no requiere token, pero lo procesa si existe)
export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      businessId: payload.businessId || null
    };
  } catch (error) {
    // Si el token es inválido, continuar sin usuario
    req.user = null;
  }
  
  next();
};

// Función helper para generar tokens
export const generateToken = (user) => {
  const payload = {
    id: user.id || user._id,
    email: user.email,
    role: user.role,
    ...(user.businessId ? { businessId: user.businessId } : {})
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      issuer: 'MiSitioFacil',
      audience: 'misitofacil-users'
    }
  );
};

// Función helper para generar refresh token
export const generateRefreshToken = (user) => {
  const payload = {
    id: user.id || user._id,
    type: 'refresh'
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
      issuer: 'MiSitioFacil',
      audience: 'misitofacil-refresh'
    }
  );
};

// Función helper para verificar refresh token
export const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    
    return payload;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

// Middleware para extraer información del usuario sin requerir autenticación
export const extractUser = (req, res, next) => {
  req.user = null;
  
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: payload.id,
        email: payload.email,
        role: payload.role,
        businessId: payload.businessId || null
      };
    } catch (error) {
      // Ignorar errores y continuar sin usuario
    }
  }
  
  next();
};

export default {
  auth,
  requireOwner,
  requireAdmin,
  requireClient,
  requireOwnerOrAdmin,
  requireClientOrOwner,
  requireAnyRole,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractUser
};