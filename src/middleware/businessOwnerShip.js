import { constants } from '../config/index.js';

const { USER_ROLES, ERROR_MESSAGES } = constants;

// Middleware para verificar que el usuario es dueño del negocio
export const requireBusinessOwnership = (businessIdParam = 'businessId') => {
  return async (req, res, next) => {
    try {
      // Verificar que el usuario está autenticado
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: ERROR_MESSAGES.ACCESS_DENIED,
          code: 'NOT_AUTHENTICATED'
        });
      }

      // Los admins pueden acceder a cualquier negocio
      if (req.user.role === USER_ROLES.ADMIN) {
        return next();
      }

      // Solo owners pueden acceder a negocios
      if (req.user.role !== USER_ROLES.OWNER) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Solo los dueños de negocio pueden realizar esta acción',
          code: 'ROLE_NOT_ALLOWED'
        });
      }

      // Obtener el ID del negocio desde los parámetros de la ruta
      const businessId = req.params[businessIdParam];
      
      if (!businessId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Parámetro ${businessIdParam} es requerido`,
          code: 'MISSING_BUSINESS_ID'
        });
      }

      // Verificar que el usuario es dueño de este negocio específico
      // Opción 1: Usar businessId del token (más rápido)
      if (req.user.businessId && req.user.businessId.toString() === businessId) {
        return next();
      }

      // Opción 2: Verificar en base de datos (más seguro)
      // Importar modelo cuando esté disponible
      // const Business = await import('../models/Business.js');
      // const business = await Business.findById(businessId);
      
      // if (!business) {
      //   return res.status(404).json({
      //     error: 'Not Found',
      //     message: ERROR_MESSAGES.BUSINESS_NOT_FOUND,
      //     code: 'BUSINESS_NOT_FOUND'
      //   });
      // }

      // if (business.owner.toString() !== req.user.id) {
      //   return res.status(403).json({
      //     error: 'Forbidden',
      //     message: 'No tienes permisos para acceder a este negocio',
      //     code: 'NOT_BUSINESS_OWNER'
      //   });
      // }

      // Por ahora, verificar usando businessId del token
      if (!req.user.businessId || req.user.businessId.toString() !== businessId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'No tienes permisos para acceder a este negocio',
          code: 'NOT_BUSINESS_OWNER',
          userBusinessId: req.user.businessId,
          requestedBusinessId: businessId
        });
      }

      next();

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

// Middleware para verificar ownership de servicios
export const requireServiceOwnership = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: ERROR_MESSAGES.ACCESS_DENIED
        });
      }

      // Los admins pueden acceder a cualquier servicio
      if (req.user.role === USER_ROLES.ADMIN) {
        return next();
      }

      const serviceId = req.params.serviceId;
      if (!serviceId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Service ID es requerido'
        });
      }

      // TODO: Implementar cuando tengas el modelo Service
      // const Service = await import('../models/Service.js');
      // const service = await Service.findById(serviceId).populate('business');
      
      // if (!service) {
      //   return res.status(404).json({
      //     error: 'Not Found',
      //     message: 'Servicio no encontrado'
      //   });
      // }

      // if (service.business.owner.toString() !== req.user.id) {
      //   return res.status(403).json({
      //     error: 'Forbidden',
      //     message: 'No tienes permisos para modificar este servicio'
      //   });
      // }

      // Por ahora, almacenar serviceId para uso posterior
      req.serviceId = serviceId;
      next();

    } catch (error) {
      console.error('Error en serviceOwnership middleware:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: ERROR_MESSAGES.INTERNAL_ERROR
      });
    }
  };
};

// Middleware para verificar ownership de reservas
export const requireReservationAccess = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: ERROR_MESSAGES.ACCESS_DENIED
        });
      }

      const reservationId = req.params.reservationId;
      if (!reservationId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Reservation ID es requerido'
        });
      }

      // Los admins pueden acceder a cualquier reserva
      if (req.user.role === USER_ROLES.ADMIN) {
        return next();
      }

      // TODO: Implementar cuando tengas el modelo Reservation
      // const Reservation = await import('../models/Reservation.js');
      // const reservation = await Reservation.findById(reservationId)
      //   .populate('business', 'owner')
      //   .populate('client', '_id');

      // if (!reservation) {
      //   return res.status(404).json({
      //     error: 'Not Found',
      //     message: 'Reserva no encontrada'
      //   });
      // }

      // // Los owners pueden ver reservas de su negocio
      // if (req.user.role === USER_ROLES.OWNER) {
      //   if (reservation.business.owner.toString() !== req.user.id) {
      //     return res.status(403).json({
      //       error: 'Forbidden',
      //       message: 'No tienes permisos para ver esta reserva'
      //     });
      //   }
      // }

      // // Los clients solo pueden ver sus propias reservas
      // if (req.user.role === USER_ROLES.CLIENT) {
      //   if (reservation.client._id.toString() !== req.user.id) {
      //     return res.status(403).json({
      //       error: 'Forbidden',
      //       message: 'Solo puedes ver tus propias reservas'
      //     });
      //   }
      // }

      // Por ahora, almacenar reservationId para uso posterior
      req.reservationId = reservationId;
      next();

    } catch (error) {
      console.error('Error en reservationAccess middleware:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: ERROR_MESSAGES.INTERNAL_ERROR
      });
    }
  };
};

// Middleware genérico para verificar ownership de recursos
export const requireResourceOwnership = (resourceType, resourceIdParam) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: ERROR_MESSAGES.ACCESS_DENIED
        });
      }

      // Los admins pueden acceder a cualquier recurso
      if (req.user.role === USER_ROLES.ADMIN) {
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `${resourceType} ID es requerido`
        });
      }

      // TODO: Implementar lógica específica según el tipo de recurso
      // Esta función se puede expandir cuando tengas los modelos

      req[`${resourceType}Id`] = resourceId;
      next();

    } catch (error) {
      console.error(`Error en ${resourceType}Ownership middleware:`, error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: ERROR_MESSAGES.INTERNAL_ERROR
      });
    }
  };
};

export default {
  requireBusinessOwnership,
  requireServiceOwnership,
  requireReservationAccess,
  requireResourceOwnership
};