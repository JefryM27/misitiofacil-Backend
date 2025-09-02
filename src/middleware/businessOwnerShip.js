// middleware/businessOwnerShip.js
import { constants } from '../config/index.js';
import mongoose from 'mongoose';
import Business from '../models/business.js'; // <-- ajusta la ruta si tu modelo está en otro archivo

const { USER_ROLES, ERROR_MESSAGES } = constants;

export const requireBusinessOwnership = (businessIdParam = 'businessId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: ERROR_MESSAGES.ACCESS_DENIED,
          code: 'NOT_AUTHENTICATED'
        });
      }

      if (req.user.role === USER_ROLES.ADMIN) return next();
      if (req.user.role !== USER_ROLES.OWNER) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Solo los dueños de negocio pueden realizar esta acción',
          code: 'ROLE_NOT_ALLOWED'
        });
      }

      const businessId = req.params[businessIdParam];
      if (!businessId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Parámetro ${businessIdParam} es requerido`,
          code: 'MISSING_BUSINESS_ID'
        });
      }

      if (!mongoose.isValidObjectId(businessId)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'businessId inválido',
          code: 'INVALID_BUSINESS_ID'
        });
      }

      // ✅ Verificación real en BD
      const biz = await Business.findById(businessId).select('owner');
      if (!biz) {
        return res.status(404).json({
          error: 'Not Found',
          message: ERROR_MESSAGES.BUSINESS_NOT_FOUND || 'Negocio no encontrado',
          code: 'BUSINESS_NOT_FOUND'
        });
      }

      if (String(biz.owner) !== String(req.user.id)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No tienes permisos para acceder a este negocio',
          code: 'NOT_BUSINESS_OWNER'
        });
      }

      req.business = biz; // opcional
      return next();
    } catch (error) {
      console.error('Error en businessOwnership middleware:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
        code: 'MIDDLEWARE_ERROR'
      });
    }
  };
};
