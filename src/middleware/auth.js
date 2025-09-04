// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { constants } from '../config/index.js';
import { AuthenticationError } from './errorHandler.js';

const { USER_ROLES } = constants;

/* -------------------------------------------------------------------------- */
/*                               Helpers internos                             */
/* -------------------------------------------------------------------------- */

const parseAuthHeader = (req) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AuthenticationError('No autorizado');
  }
  return token;
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token expirado');
    }
    throw new AuthenticationError('Token inválido');
  }
};

const payloadToUser = (payload) => ({
  id: payload.id,
  email: payload.email,
  role: payload.role,
  businessId: payload.businessId || null,
});

/* -------------------------------------------------------------------------- */
/*                             Middlewares principales                         */
/* -------------------------------------------------------------------------- */

/**
 * optionalAuth: intenta adjuntar req.user si hay token válido,
 * pero NO bloquea el request si falla.
 */
export const optionalAuth = (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader) {
      req.user = null;
      return next();
    }
    const token = parseAuthHeader(req);
    const payload = verifyAccessToken(token);
    if (!payload?.id || !payload?.email) {
      req.user = null;
      return next();
    }
    req.user = payloadToUser(payload);
    return next();
  } catch (_e) {
    // Si el token es inválido/expirado se ignora y se sigue sin usuario
    req.user = null;
    return next();
  }
};

/**
 * requireAuth: exige un token válido y adjunta req.user.
 * Si no hay token o es inválido, lanza AuthenticationError.
 */
export const requireAuth = (req, _res, next) => {
  try {
    const token = parseAuthHeader(req);
    const payload = verifyAccessToken(token);
    if (!payload?.id || !payload?.email) {
      throw new AuthenticationError('Token inválido');
    }
    req.user = payloadToUser(payload);
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * auth(roles): exige autenticación y que el rol pertenezca al conjunto permitido.
 * Acepta string o array de roles.
 */
export const auth = (roles = []) => (req, _res, next) => {
  try {
    // 1) Asegurar req.user
    const token = parseAuthHeader(req);
    const payload = verifyAccessToken(token);
    if (!payload?.id || !payload?.email) {
      throw new AuthenticationError('Token inválido');
    }
    req.user = payloadToUser(payload);

    // 2) Chequear roles si se especificaron
    const allow = Array.isArray(roles) ? roles : [roles];
    if (allow.length > 0) {
      const userRole = req.user?.role;
      if (!userRole || !allow.includes(userRole)) {
        throw new AuthenticationError('Permisos insuficientes');
      }
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

/* -------------------------------------------------------------------------- */
/*                     Atajos por rol (compatibles con rutas)                 */
/* -------------------------------------------------------------------------- */

export const requireOwner = auth([USER_ROLES.OWNER]);
export const requireAdmin = auth([USER_ROLES.ADMIN]);
export const requireClient = auth([USER_ROLES.CLIENT]);

export const requireOwnerOrAdmin = auth([USER_ROLES.OWNER, USER_ROLES.ADMIN]);
export const requireClientOrOwner = auth([USER_ROLES.CLIENT, USER_ROLES.OWNER]);
export const requireAnyRole = auth([USER_ROLES.OWNER, USER_ROLES.CLIENT, USER_ROLES.ADMIN]);

/* -------------------------------------------------------------------------- */
/*                        Helpers para Access/Refresh JWT                     */
/* -------------------------------------------------------------------------- */

export const generateToken = (user) => {
  const payload = {
    id: user.id || user._id,
    email: user.email,
    role: user.role,
    ...(user.business ? { businessId: user.business } : {}),
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    issuer: 'MiSitioFacil',
    audience: 'misitiofacil-users',
  });
};

export const generateRefreshToken = (user) => {
  const payload = {
    id: user.id || user._id,
    type: 'refresh',
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: 'MiSitioFacil',
    audience: 'misitiofacil-refresh',
  });
};

export const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return payload;
  } catch (_err) {
    throw new AuthenticationError('Refresh token inválido');
  }
};

/**
 * extractUser: helper que intenta adjuntar req.user si hay token; no bloquea.
 * Similar a optionalAuth, pero pensada para pipelines donde sólo quieres
 * tener el usuario a mano si existe.
 */
export const extractUser = (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader) {
      req.user = null;
      return next();
    }
    const token = parseAuthHeader(req);
    const payload = verifyAccessToken(token);
    req.user = payloadToUser(payload);
    return next();
  } catch (_e) {
    req.user = null;
    return next();
  }
};

export default {
  optionalAuth,
  requireAuth,
  auth,
  requireOwner,
  requireAdmin,
  requireClient,
  requireOwnerOrAdmin,
  requireClientOrOwner,
  requireAnyRole,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractUser,
};
