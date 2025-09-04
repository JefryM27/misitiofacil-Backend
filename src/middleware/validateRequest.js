// src/validation/service.validation.js
import { checkSchema } from 'express-validator';
import { constants } from '../config/index.js';

const { APP_LIMITS, SERVICE_TYPES } = constants;

export const createServiceRules = checkSchema({
  // Acepta name o title (al menos uno requerido)
  name: {
    optional: { options: { nullable: true } },
    trim: true,
    isLength: {
      options: { min: 1, max: 120 },
      errorMessage: 'El nombre debe tener entre 1 y 120 caracteres'
    },
    custom: {
      options: (value, { req }) => {
        if ((value && String(value).trim()) || (req.body.title && String(req.body.title).trim())) return true;
        throw new Error('El nombre del servicio es obligatorio (name o title)');
      }
    }
  },
  title: {
    optional: true,
    trim: true,
    isLength: { options: { max: 120 }, errorMessage: 'El título no puede exceder 120 caracteres' }
  },

  description: { optional: true, trim: true, isLength: { options: { max: 1000 }, errorMessage: 'Descripción muy larga' } },

  category: {
    trim: true,
    notEmpty: { errorMessage: 'La categoría del servicio es requerida' }
  },

  // Coerción numérica y mínimo 0
  price: {
    customSanitizer: { options: (v) => (v === '' || v == null ? v : Number(v)) },
    notEmpty: { errorMessage: 'El precio es requerido' },
    isFloat: { options: { min: 0 }, errorMessage: 'El precio debe ser ≥ 0' }
  },

  // duration puede venir como "duration" o "durationMin"
  duration: {
    optional: { options: { nullable: true } },
    customSanitizer: {
      options: (value, { req }) => {
        let v = value ?? req.body.durationMin;
        if (v === '' || v == null) return v;
        v = Number(v);
        // guardamos la versión numérica de vuelta en el body
        req.body.duration = v;
        return v;
      }
    },
    custom: {
      options: (v) => {
        if (v == null) throw new Error('La duración es requerida');
        if (!Number.isFinite(Number(v))) throw new Error('La duración debe ser numérica');
        const n = Number(v);
        if (n < APP_LIMITS.MIN_SERVICE_DURATION) throw new Error(`La duración mínima es ${APP_LIMITS.MIN_SERVICE_DURATION} min`);
        if (n > APP_LIMITS.MAX_SERVICE_DURATION) throw new Error(`La duración máxima es ${APP_LIMITS.MAX_SERVICE_DURATION} min`);
        if (n % 15 !== 0) throw new Error('La duración debe ser múltiplo de 15 minutos');
        return true;
      }
    }
  },
  durationMin: { optional: true }, // alias ya manejado

  serviceType: {
    optional: true,
    isIn: { options: [Object.values(SERVICE_TYPES)], errorMessage: 'serviceType inválido' }
  },

  tags: {
    optional: true,
    customSanitizer: {
      options: (arr) =>
        Array.isArray(arr)
          ? arr.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 10)
          : []
    }
  },
  requirements: {
    optional: true,
    customSanitizer: {
      options: (arr) =>
        Array.isArray(arr)
          ? arr.map((r) => String(r || '').trim()).filter(Boolean).slice(0, 5)
          : []
    }
  },

  isActive: { optional: true, toBoolean: true },
  isPublic: { optional: true, toBoolean: true },

  // Para ambas rutas (por params o en body)
  business:   { optional: true, isMongoId: { errorMessage: 'business inválido' } },
  businessId: { optional: true, isMongoId: { errorMessage: 'businessId inválido' } },
});
