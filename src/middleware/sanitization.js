// src/middleware/sanitization.js
import { constants } from '../config/index.js';

const { VALIDATION_PATTERNS } = constants;

// ───────────────────────── helpers ─────────────────────────
const escapeHtml = (text) => {
  if (typeof text !== 'string') return text;
  const map = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
  };
  return text.replace(/[&<>"'`=\/]/g, (s) => map[s]);
};

const cleanString = (str, options = {}) => {
  if (typeof str !== 'string') return str;
  const { allowHtml = false, allowSpecialChars = true, maxLength = null, trim = true } = options;

  let cleaned = str;
  if (trim) cleaned = cleaned.trim();
  // Remove control chars
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (!allowHtml) cleaned = escapeHtml(cleaned);
  if (!allowSpecialChars) {
    cleaned = cleaned.replace(/[^\w\s\-._@áéíóúüñ]/gi, '');
  }
  if (maxLength && cleaned.length > maxLength) cleaned = cleaned.substring(0, maxLength);
  return cleaned;
};

const sanitizeObject = (obj, options = {}) => {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options));
  }

  if (typeof obj !== 'object') {
    if (typeof obj === 'string') return cleanString(obj, options);
    return obj;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = cleanString(key, { allowSpecialChars: false, maxLength: 100 });
    sanitized[cleanKey] = sanitizeObject(value, options);
  }
  return sanitized;
};

const toNumberOr = (v, fallback = undefined) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ─────────────────────── middlewares ───────────────────────
export const sanitizeInput = (options = {}) => {
  const defaultOptions = {
    body: true,
    query: true,
    params: false,
    allowHtml: false,
    allowSpecialChars: true,
    ...options,
  };

  return (req, res, next) => {
    try {
      if (defaultOptions.body && req.body) req.body = sanitizeObject(req.body, defaultOptions);
      if (defaultOptions.query && req.query) req.query = sanitizeObject(req.query, defaultOptions);
      if (defaultOptions.params && req.params) req.params = sanitizeObject(req.params, defaultOptions);
      next();
    } catch (error) {
      console.error('Error en sanitización:', error);
      next(error);
    }
  };
};

export const sanitizeBusinessData = (req, res, next) => {
  if (req.body) {
    const htmlFields = ['description', 'services'];
    const strictFields = ['name', 'email', 'phone', 'address'];

    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value !== 'string') continue;

      if (htmlFields.includes(key)) {
        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: true,
          maxLength: key === 'description' ? 1000 : 500,
          trim: true,
        });
      } else if (strictFields.includes(key)) {
        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: key === 'email' || key === 'phone',
          maxLength: 200,
          trim: true,
        });
      } else {
        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: true,
          maxLength: 500,
          trim: true,
        });
      }
    }
  }
  next();
};

// ⭐ Ajustado: normaliza alias y castea números
export const sanitizeServiceData = (req, res, next) => {
  if (req.body) {
    const fieldLimits = {
      name: 100,
      description: 500,
      category: 50,
      duration: 10,
      price: 20,
    };

    // 1) Normalizar alias (title → name, durationMin → duration)
    if (!req.body.name && typeof req.body.title === 'string') {
      req.body.name = req.body.title;
    }
    if (req.body.duration == null && req.body.durationMin != null) {
      req.body.duration = req.body.durationMin;
    }

    // 2) Sanitizar strings con límites
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string' && fieldLimits[key]) {
        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: key === 'price' || key === 'duration',
          maxLength: fieldLimits[key],
          trim: true,
        });
      }
    }

    // 3) Coerción numérica segura
    if (req.body.price !== undefined) {
      req.body.price = toNumberOr(req.body.price, req.body.price);
    }
    if (req.body.duration !== undefined) {
      req.body.duration = toNumberOr(req.body.duration, req.body.duration);
    }
  }

  next();
};

export const sanitizeUserData = (req, res, next) => {
  if (req.body) {
    const sanitizationRules = {
      email: { allowSpecialChars: true, maxLength: 100, pattern: VALIDATION_PATTERNS.EMAIL },
      name: { allowSpecialChars: false, maxLength: 50 },
      phone: { allowSpecialChars: true, maxLength: 20, pattern: VALIDATION_PATTERNS.PHONE_CR },
      password: { allowSpecialChars: true, maxLength: 100, skipSanitization: true },
    };

    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string' && sanitizationRules[key]) {
        const rules = sanitizationRules[key];
        if (rules.skipSanitization) continue;

        req.body[key] = cleanString(value, {
          allowHtml: false,
          allowSpecialChars: rules.allowSpecialChars,
          maxLength: rules.maxLength,
          trim: true,
        });

        if (rules.pattern && !rules.pattern.test(req.body[key])) {
          // dejar que el validador lo rechace
        }
      }
    }
  }
  next();
};

export const preventNoSQLInjection = (req, res, next) => {
  const checkForInjection = (obj) => {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (key.startsWith('$') || key.startsWith('_')) {
          delete obj[key];
          console.warn(`Removed potentially malicious key: ${key}`);
          continue;
        }
        if (typeof obj[key] === 'object') checkForInjection(obj[key]);
      }
    }
  };
  if (req.body) checkForInjection(req.body);
  if (req.query) checkForInjection(req.query);
  if (req.params) checkForInjection(req.params);
  next();
};

// ⭐ Arreglado: mutar arrays por índice
export const trimWhitespace = (req, res, next) => {
  const trimObject = (obj) => {
    if (!obj) return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = obj[i].trim();
        } else if (typeof obj[i] === 'object') {
          trimObject(obj[i]);
        }
      }
      return;
    }

    if (typeof obj === 'object') {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = obj[key].trim();
        } else if (typeof obj[key] === 'object') {
          trimObject(obj[key]);
        }
      }
    }
  };

  if (req.body) trimObject(req.body);
  if (req.query) trimObject(req.query);
  next();
};

export const normalizeData = (req, res, next) => {
  if (req.body) {
    if (req.body.email && typeof req.body.email === 'string') {
      req.body.email = req.body.email.toLowerCase().trim();
    }
    if (req.body.phone && typeof req.body.phone === 'string') {
      req.body.phone = req.body.phone.replace(/[\s\-\(\)]/g, '');
    }
    if (req.body.website && typeof req.body.website === 'string') {
      let url = req.body.website.trim();
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      req.body.website = url;
    }
    const nameFields = ['name', 'firstName', 'lastName', 'businessName'];
    nameFields.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        req.body[field] = req.body[field]
          .toLowerCase()
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    });
  }
  next();
};

// helpers
export const sanitizeText = (text, options = {}) => cleanString(text, options);

export const sanitizeEmail = (email) => {
  if (!email || typeof email !== 'string') return email;
  const cleaned = email.toLowerCase().trim();
  if (!VALIDATION_PATTERNS.EMAIL.test(cleaned)) {
    throw new Error('Formato de email inválido');
  }
  return cleaned;
};

export const sanitizePhone = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  return phone.replace(/[^\d+]/g, '');
};

export const fullSanitization = [trimWhitespace, preventNoSQLInjection, sanitizeInput(), normalizeData];

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
  sanitizePhone,
};
