import { constants } from '../config/index.js';

const { VALIDATION_PATTERNS } = constants;

// Función para escapar HTML y prevenir XSS
const escapeHtml = (text) => {
  if (typeof text !== 'string') return text;
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  
  return text.replace(/[&<>"'`=\/]/g, (s) => map[s]);
};

// Función para limpiar strings removiendo caracteres peligrosos
const cleanString = (str, options = {}) => {
  if (typeof str !== 'string') return str;
  
  const {
    allowHtml = false,
    allowSpecialChars = true,
    maxLength = null,
    trim = true
  } = options;
  
  let cleaned = str;
  
  // Trimmer espacios si se especifica
  if (trim) {
    cleaned = cleaned.trim();
  }
  
  // Remover caracteres de control
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Escapar HTML si no se permite
  if (!allowHtml) {
    cleaned = escapeHtml(cleaned);
  }
  
  // Remover caracteres especiales si no se permiten
  if (!allowSpecialChars) {
    cleaned = cleaned.replace(/[^\w\s\-._@áéíóúüñ]/gi, '');
  }
  
  // Limitar longitud
  if (maxLength && cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength);
  }
  
  return cleaned;
};

// Función para sanitizar objetos recursivamente
const sanitizeObject = (obj, options = {}) => {
  if (obj === null || obj === undefined) return obj;
  
  // Si es un array, sanitizar cada elemento
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options));
  }
  
  // Si no es un objeto, aplicar sanitización según tipo
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return cleanString(obj, options);
    }
    return obj;
  }
  
  // Sanitizar cada propiedad del objeto
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitizar la clave también
    const cleanKey = cleanString(key, { allowSpecialChars: false, maxLength: 100 });
    sanitized[cleanKey] = sanitizeObject(value, options);
  }
  
  return sanitized;
};

// Middleware principal de sanitización
export const sanitizeInput = (options = {}) => {
  const defaultOptions = {
    body: true,
    query: true,
    params: false, // Los params no se sanitizan por defecto
    allowHtml: false,
    allowSpecialChars: true,
    ...options
  };
  
  return (req, res, next) => {
    try {
      // Sanitizar body
      if (defaultOptions.body && req.body) {
        req.body = sanitizeObject(req.body, defaultOptions);
      }
      
      // Sanitizar query
      if (defaultOptions.query && req.query) {
        req.query = sanitizeObject(req.query, defaultOptions);
      }
      
      // Sanitizar params (solo si se especifica)
      if (defaultOptions.params && req.params) {
        req.params = sanitizeObject(req.params, defaultOptions);
      }
      
      next();
      
    } catch (error) {
      console.error('Error en sanitización:', error);
      next(error);
    }
  };
};

// Middleware específico para diferentes tipos de contenido
export const sanitizeBusinessData = (req, res, next) => {
  if (req.body) {
    // Campos que permiten HTML limitado (para descripciones)
    const htmlFields = ['description', 'services'];
    
    // Campos que requieren sanitización estricta
    const strictFields = ['name', 'email', 'phone', 'address'];
    
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        if (htmlFields.includes(key)) {
          // Permitir HTML básico pero escapar scripts
          req.body[key] = cleanString(value, { 
            allowHtml: false, // Por seguridad, no permitir HTML
            allowSpecialChars: true,
            maxLength: key === 'description' ? 1000 : 500,
            trim: true
          });
        } else if (strictFields.includes(key)) {
          // Sanitización estricta
          req.body[key] = cleanString(value, {
            allowHtml: false,
            allowSpecialChars: key === 'email' || key === 'phone',
            maxLength: 200,
            trim: true
          });
        } else {
          // Sanitización general
          req.body[key] = cleanString(value, {
            allowHtml: false,
            allowSpecialChars: true,
            maxLength: 500,
            trim: true
          });
        }
      }
    }
  }
  
  next();
};

// Middleware para sanitizar datos de servicios
export const sanitizeServiceData = (req, res, next) => {
  if (req.body) {
    const fieldLimits = {
      name: 100,
      description: 500,
      category: 50,
      duration: 10,
      price: 20
    };
    
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string' && fieldLimits[key]) {
        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: key === 'price' || key === 'duration',
          maxLength: fieldLimits[key],
          trim: true
        });
      }
    }
  }
  
  next();
};

// Middleware para sanitizar datos de usuario
export const sanitizeUserData = (req, res, next) => {
  if (req.body) {
    const sanitizationRules = {
      email: {
        allowSpecialChars: true,
        maxLength: 100,
        pattern: VALIDATION_PATTERNS.EMAIL
      },
      name: {
        allowSpecialChars: false,
        maxLength: 50
      },
      phone: {
        allowSpecialChars: true,
        maxLength: 20,
        pattern: VALIDATION_PATTERNS.PHONE_CR
      },
      password: {
        allowSpecialChars: true,
        maxLength: 100,
        skipSanitization: true // No sanitizar contraseñas
      }
    };
    
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string' && sanitizationRules[key]) {
        const rules = sanitizationRules[key];
        
        // Saltear sanitización si se especifica
        if (rules.skipSanitization) {
          continue;
        }
        
        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: rules.allowSpecialChars,
          maxLength: rules.maxLength,
          trim: true
        });
        
        // Validar patrón si se especifica
        if (rules.pattern && !rules.pattern.test(req.body[key])) {
          // No modificar si no cumple el patrón, dejar que la validación lo maneje
        }
      }
    }
  }
  
  next();
};

// Middleware para prevenir ataques NoSQL injection
export const preventNoSQLInjection = (req, res, next) => {
  const checkForInjection = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        // Detectar operadores de MongoDB
        if (key.startsWith('$') || key.startsWith('_')) {
          delete obj[key];
          console.warn(`Removed potentially malicious key: ${key}`);
          continue;
        }
        
        // Recursivamente verificar objetos anidados
        if (typeof obj[key] === 'object') {
          checkForInjection(obj[key]);
        }
      }
    }
  };
  
  // Verificar body, query y params
  if (req.body) checkForInjection(req.body);
  if (req.query) checkForInjection(req.query);
  if (req.params) checkForInjection(req.params);
  
  next();
};

// Middleware para limpiar espacios extra
export const trimWhitespace = (req, res, next) => {
  const trimObject = (obj) => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].trim();
        } else if (typeof obj[key] === 'object') {
          trimObject(obj[key]);
        }
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (typeof item === 'string') {
          item = item.trim();
        } else if (typeof item === 'object') {
          trimObject(item);
        }
      });
    }
  };
  
  if (req.body) trimObject(req.body);
  if (req.query) trimObject(req.query);
  
  next();
};

// Middleware para normalizar datos
export const normalizeData = (req, res, next) => {
  if (req.body) {
    // Normalizar email a lowercase
    if (req.body.email && typeof req.body.email === 'string') {
      req.body.email = req.body.email.toLowerCase().trim();
    }
    
    // Normalizar teléfono (remover espacios y caracteres especiales)
    if (req.body.phone && typeof req.body.phone === 'string') {
      req.body.phone = req.body.phone.replace(/[\s\-\(\)]/g, '');
    }
    
    // Normalizar URLs
    if (req.body.website && typeof req.body.website === 'string') {
      let url = req.body.website.trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      req.body.website = url;
    }
    
    // Normalizar nombres (capitalizar primera letra)
    const nameFields = ['name', 'firstName', 'lastName', 'businessName'];
    nameFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = req.body[field]
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    });
  }
  
  next();
};

// Función helper para sanitizar texto manualmente
export const sanitizeText = (text, options = {}) => {
  return cleanString(text, options);
};

// Función helper para validar y sanitizar email
export const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') return email;
  
  const cleaned = email.toLowerCase().trim();
  
  // Validar formato básico
  if (!VALIDATION_PATTERNS.EMAIL.test(cleaned)) {
    throw new Error('Formato de email inválido');
  }
  
  return cleaned;
};

// Función helper para sanitizar número de teléfono
export const sanitizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  
  // Remover todos los caracteres no numéricos excepto +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  return cleaned;
};

// Middleware combinado para sanitización completa
export const fullSanitization = [
  trimWhitespace,
  preventNoSQLInjection,
  sanitizeInput(),
  normalizeData
];

export default {
  sanitizeInput,
  sanitizeBusinessData,
  sanitizeServiceData,
  sanitizeUserData,
  preventNoSQLInjection,
  trimWhitespace,
  normalizeData,
  fullSanitization,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone
};