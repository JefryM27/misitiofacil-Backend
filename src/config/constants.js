// ============== ROLES DE USUARIO ==============
export const USER_ROLES = {
  OWNER: 'owner',
  CLIENT: 'client', 
  ADMIN: 'admin'
};

// ============== ESTADOS DE RESERVAS ==============
export const RESERVATION_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'no_show'
};

// ============== TIPOS DE NEGOCIO ==============
export const BUSINESS_TYPES = {
  BARBERIA: 'barberia',
  SALON: 'salon_belleza',
  SPA: 'spa'
};

// ============== ESTADOS DE NEGOCIO ==============
export const BUSINESS_STATUS = {
  DRAFT: 'draft',           // Borrador, no publicado
  ACTIVE: 'active',         // Activo y visible
  INACTIVE: 'inactive',     // Temporalmente inactivo
  SUSPENDED: 'suspended',   // Suspendido por admin
  DELETED: 'deleted'        // Marcado como eliminado
};

// ============== DÍAS DE LA SEMANA ==============
export const WEEKDAYS = {
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday'
};

export const WEEKDAYS_SPANISH = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo'
};

// ============== TIPOS DE SERVICIOS ==============
export const SERVICE_TYPES = {
  INDIVIDUAL: 'individual',    // Servicio individual
  PACKAGE: 'package',          // Paquete de servicios
  MEMBERSHIP: 'membership'     // Membresía/suscripción
};

// ============== DURACIONES COMUNES ==============
export const SERVICE_DURATIONS = {
  15: '15 minutos',
  30: '30 minutos',
  45: '45 minutos',
  60: '1 hora',
  90: '1.5 horas',
  120: '2 horas',
  180: '3 horas',
  240: '4 horas'
};

// ============== MÉTODOS DE PAGO ==============
export const PAYMENT_METHODS = {
  CASH: 'cash',
  SINPE: 'sinpe'
};

// ============== TIPOS DE NOTIFICACIÓN ==============
export const NOTIFICATION_TYPES = {
  RESERVATION_CREATED: 'reservation_created',
  RESERVATION_CONFIRMED: 'reservation_confirmed',
  RESERVATION_CANCELLED: 'reservation_cancelled',
  RESERVATION_REMINDER: 'reservation_reminder',
  BUSINESS_APPROVED: 'business_approved',
  BUSINESS_SUSPENDED: 'business_suspended',
  SERVICE_UPDATED: 'service_updated',
  PAYMENT_RECEIVED: 'payment_received'
};

// ============== CANALES DE NOTIFICACIÓN ==============
export const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  PUSH: 'push',
  IN_APP: 'in_app'
};

// ============== LÍMITES DE LA APLICACIÓN ==============
export const APP_LIMITS = {
  MAX_SERVICES_PER_BUSINESS: 50,
  MAX_IMAGES_PER_BUSINESS: 20,
  MAX_GALLERY_IMAGES: 15,
  MAX_BUSINESS_DESCRIPTION_LENGTH: 1000,
  MAX_SERVICE_DESCRIPTION_LENGTH: 500,
  MIN_SERVICE_DURATION: 15, // minutos
  MAX_SERVICE_DURATION: 480, // 8 horas
  MAX_RESERVATIONS_PER_DAY: 100,
  MAX_BUSINESS_NAME_LENGTH: 100,
  MAX_SERVICE_NAME_LENGTH: 80,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PHONE_LENGTH: 20
};

// ============== TIPOS DE ARCHIVO PERMITIDOS ==============
export const ALLOWED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  LOGOS: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

// ============== TAMAÑOS MÁXIMOS DE ARCHIVO ==============
export const FILE_SIZE_LIMITS = {
  LOGO: 1 * 1024 * 1024,      // 1MB
  COVER: 3 * 1024 * 1024,     // 3MB
  GALLERY: 2 * 1024 * 1024,   // 2MB
  DOCUMENT: 5 * 1024 * 1024   // 5MB
};

// ============== CONFIGURACIÓN DE TIEMPO ==============
export const TIME_CONFIG = {
  BUSINESS_HOURS: {
    MIN: '06:00',
    MAX: '23:59'
  },
  RESERVATION_ADVANCE: {
    MIN_MINUTES: 30,           // Mínimo 30 min de anticipación
    MAX_DAYS: 90               // Máximo 90 días de anticipación
  },
  CANCELLATION_WINDOW: {
    MIN_HOURS: 2               // Mínimo 2 horas para cancelar
  },
  SESSION_TIMEOUT: {
    MINUTES: 60                // Sesión expira en 1 hora de inactividad
  }
};

// ============== CONFIGURACIÓN DE VALIDACIÓN ==============
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_CR: /^[0-9]{8}$/,                    // Teléfono Costa Rica (8 dígitos)
  PHONE_INTERNATIONAL: /^\+?[1-9]\d{6,14}$/, // Teléfono internacional
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
  BUSINESS_SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, // URL amigable para negocios
  COLOR_HEX: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
};

// ============== MENSAJES DE ERROR COMUNES ==============
export const ERROR_MESSAGES = {
  // Autenticación
  INVALID_CREDENTIALS: 'Credenciales inválidas',
  USER_NOT_FOUND: 'Usuario no encontrado',
  EMAIL_ALREADY_EXISTS: 'El email ya está registrado',
  INVALID_TOKEN: 'Token inválido o expirado',
  ACCESS_DENIED: 'Acceso denegado',
  
  // Validación
  REQUIRED_FIELD: 'Este campo es requerido',
  INVALID_EMAIL: 'Email inválido',
  INVALID_PHONE: 'Número de teléfono inválido',
  PASSWORD_TOO_SHORT: `La contraseña debe tener al menos ${APP_LIMITS.MIN_PASSWORD_LENGTH} caracteres`,
  INVALID_PASSWORD: 'La contraseña debe contener al menos una mayúscula, una minúscula, un número y un carácter especial',
  
  // Negocio
  BUSINESS_NOT_FOUND: 'Negocio no encontrado',
  BUSINESS_INACTIVE: 'Negocio inactivo',
  MAX_SERVICES_EXCEEDED: `Máximo ${APP_LIMITS.MAX_SERVICES_PER_BUSINESS} servicios por negocio`,
  
  // Reservas
  RESERVATION_NOT_FOUND: 'Reserva no encontrada',
  TIME_SLOT_UNAVAILABLE: 'Horario no disponible',
  INVALID_RESERVATION_TIME: 'Hora de reserva inválida',
  CANCELLATION_NOT_ALLOWED: 'No se puede cancelar la reserva',
  
  // Archivos
  FILE_TOO_LARGE: 'Archivo muy pesado',
  INVALID_FILE_TYPE: 'Tipo de archivo no permitido',
  UPLOAD_FAILED: 'Error al subir archivo',
  
  // General
  INTERNAL_ERROR: 'Error interno del servidor',
  NOT_FOUND: 'Recurso no encontrado',
  BAD_REQUEST: 'Solicitud inválida',
  RATE_LIMIT_EXCEEDED: 'Demasiadas solicitudes, intenta más tarde'
};

// ============== MENSAJES DE ÉXITO ==============
export const SUCCESS_MESSAGES = {
  USER_CREATED: 'Usuario creado exitosamente',
  LOGIN_SUCCESS: 'Inicio de sesión exitoso',
  BUSINESS_CREATED: 'Negocio creado exitosamente',
  BUSINESS_UPDATED: 'Negocio actualizado exitosamente',
  SERVICE_CREATED: 'Servicio creado exitosamente',
  SERVICE_UPDATED: 'Servicio actualizado exitosamente',
  RESERVATION_CREATED: 'Reserva creada exitosamente',
  RESERVATION_CONFIRMED: 'Reserva confirmada',
  RESERVATION_CANCELLED: 'Reserva cancelada',
  FILE_UPLOADED: 'Archivo subido exitosamente',
  PASSWORD_RESET: 'Contraseña restablecida exitosamente',
  EMAIL_SENT: 'Email enviado exitosamente'
};

// ============== CONFIGURACIÓN DE COLORES THEME ==============
export const THEME_COLORS = {
  PRIMARY: ['#3B82F6', '#1D4ED8', '#2563EB', '#1E40AF'],
  SECONDARY: ['#64748B', '#475569', '#334155', '#1E293B'],
  SUCCESS: ['#10B981', '#059669', '#047857', '#065F46'],
  WARNING: ['#F59E0B', '#D97706', '#B45309', '#92400E'],
  ERROR: ['#EF4444', '#DC2626', '#B91C1C', '#991B1B'],
  INFO: ['#06B6D4', '#0891B2', '#0E7490', '#155E75']
};

// ============== CONFIGURACIÓN DE PLANTILLAS ==============
export const TEMPLATE_CATEGORIES = {
  MODERN: 'modern',
  CLASSIC: 'classic',
  MINIMAL: 'minimal',
  CREATIVE: 'creative',
  PROFESSIONAL: 'professional'
};

// ============== PAÍSES SOPORTADOS ==============
export const SUPPORTED_COUNTRIES = {
  CR: {
    name: 'Costa Rica',
    code: '+506',
    currency: 'CRC',
    phoneLength: 8,
    timezone: 'America/Costa_Rica'
  },
  US: {
    name: 'Estados Unidos',
    code: '+1',
    currency: 'USD',
    phoneLength: 10,
    timezone: 'America/New_York'
  },
  MX: {
    name: 'México',
    code: '+52',
    currency: 'MXN',
    phoneLength: 10,
    timezone: 'America/Mexico_City'
  }
};

// ============== CONFIGURACIÓN API ==============
export const API_CONFIG = {
  VERSION: 'v1',
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },
  CACHE_TTL: {
    SHORT: 300,    // 5 minutos
    MEDIUM: 1800,  // 30 minutos
    LONG: 3600     // 1 hora
  }
};

// ============== EXPORTS AGRUPADOS ==============
export const CONSTANTS = {
  USER_ROLES,
  RESERVATION_STATUS,
  BUSINESS_TYPES,
  BUSINESS_STATUS,
  WEEKDAYS,
  WEEKDAYS_SPANISH,
  SERVICE_TYPES,
  SERVICE_DURATIONS,
  PAYMENT_METHODS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  APP_LIMITS,
  ALLOWED_FILE_TYPES,
  FILE_SIZE_LIMITS,
  TIME_CONFIG,
  VALIDATION_PATTERNS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  THEME_COLORS,
  TEMPLATE_CATEGORIES,
  SUPPORTED_COUNTRIES,
  API_CONFIG
};

export default CONSTANTS;