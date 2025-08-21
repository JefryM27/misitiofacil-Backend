// src/middleware/validateRequest.js
import { validationResult } from 'express-validator';
import { ValidationError } from './errorHandler.js';

/**
 * Middleware que verifica los resultados de express-validator
 * Si hay errores de validación, devuelve una respuesta 400 con los detalles
 * Si no hay errores, continúa al siguiente middleware
 */
export default function validateRequest(req, res, next) {
  try {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      // Formatear errores para una mejor respuesta
      const formattedErrors = errors.array().map(error => ({
        field: error.path || error.param,
        value: error.value,
        message: error.msg,
        location: error.location
      }));

      // Crear mensaje principal con el primer error
      const mainMessage = formattedErrors[0]?.message || 'Datos de entrada inválidos';

      // Lanzar ValidationError con detalles
      const validationError = new ValidationError(mainMessage);
      validationError.details = formattedErrors;
      validationError.validationErrors = formattedErrors;
      
      throw validationError;
    }

    // Si no hay errores, continuar
    next();
  } catch (error) {
    // Si es un error de validación que creamos, pasarlo al error handler
    if (error instanceof ValidationError) {
      return next(error);
    }
    
    // Si es otro tipo de error, crear un ValidationError genérico
    const validationError = new ValidationError('Error de validación');
    validationError.originalError = error;
    next(validationError);
  }
}

// Función helper para validaciones personalizadas
export const createCustomValidator = (validatorFn, message) => {
  return (value, { req, location, path }) => {
    const isValid = validatorFn(value, req);
    if (!isValid) {
      throw new Error(message);
    }
    return true;
  };
};

// Validaciones comunes reutilizables
export const commonValidations = {
  // Validar que un ID de MongoDB sea válido
  mongoId: {
    isMongoId: true,
    errorMessage: 'ID inválido'
  },
  
  // Validar email con normalización
  email: {
    isEmail: true,
    normalizeEmail: true,
    errorMessage: 'Email inválido'
  },
  
  // Validar contraseña fuerte
  strongPassword: {
    isLength: { min: 8 },
    matches: {
      options: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    },
    errorMessage: 'La contraseña debe tener al menos 8 caracteres, incluyendo mayúscula, minúscula, número y carácter especial'
  },
  
  // Validar teléfono
  phone: {
    matches: {
      options: /^[0-9+\-\s()]{7,20}$/,
    },
    errorMessage: 'Número de teléfono inválido'
  }
};