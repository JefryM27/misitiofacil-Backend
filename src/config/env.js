// src/config/env.js
import dotenv from 'dotenv';
dotenv.config();

/* ─────────────────────────────────────────────────────────────
   Flags de entorno
───────────────────────────────────────────────────────────── */
const IS_VERCEL = process.env.VERCEL === '1';
const NODE_ENV = process.env.NODE_ENV || 'development';

/* ─────────────────────────────────────────────────────────────
   Requeridas / Opcionales
   NOTA: No requerimos PORT (Vercel la gestiona). En local usamos 3001.
───────────────────────────────────────────────────────────── */
const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET'
];

const OPTIONAL_VARS = {
  // App / Servidor
  APP_NAME: 'MiSitioFácil',
  APP_VERSION: '1.0.0',
  NODE_ENV: 'development',
  PORT: '3001',
  BASE_URL: 'http://localhost:3001',       // opcional; en Vercel preferir APP_URL
  APP_URL: '',                              // p.ej. https://misitiofacil-api.vercel.app
  FRONTEND_URL: 'http://localhost:3000',
  API_PREFIX: '/api',
  TIMEZONE: 'America/Costa_Rica',          // mejor zona IANA que offset

  // MongoDB
  MONGODB_MAX_POOL_SIZE: '10',
  MONGODB_TIMEOUT_MS: '15000',

  // JWT
  JWT_EXPIRES_IN: '7d',
  JWT_REFRESH_EXPIRES_IN: '30d',

  // Storage / Uploads
  STORAGE_TYPE: 'local', // en Vercel la FS es efímera: usar cloudinary en prod
  UPLOAD_PATH: 'uploads',
  UPLOAD_MAX_FILE_SIZE: '2097152', // 2MB
  UPLOAD_MAX_FILES: '5',
  UPLOAD_ALLOWED_TYPES: 'image/jpeg,image/png,image/webp,image/jpg',

  // Seguridad
  CORS_ORIGIN: 'http://localhost:3000',
  ADMIN_CORS_ORIGIN: '',
  RATE_LIMIT_WINDOW_MS: '900000', // 15 min
  RATE_LIMIT_MAX_REQUESTS: '100',
  BCRYPT_ROUNDS: '12',

  // Logging
  LOG_LEVEL: 'info',
  LOG_FILE: 'logs/app.log',

  // Desarrollo
  DEBUG_DB: 'false',
  DEBUG_ROUTES: 'false',
  SKIP_RATE_LIMIT: 'false'
};

/* ─────────────────────────────────────────────────────────────
   Utils
───────────────────────────────────────────────────────────── */
const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const toBool = (v) => v === 'true' || v === '1';

/* ─────────────────────────────────────────────────────────────
   Validación de variables
───────────────────────────────────────────────────────────── */
export const validateEnv = () => {
  const errors = [];
  const warnings = [];

  console.log('🔍 Validando variables de entorno...');

  // Requeridas
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      errors.push(`❌ Variable requerida faltante: ${varName}`);
    } else {
      console.log(`✅ ${varName}: configurado`);
    }
  }

  // Defaults para opcionales
  for (const [varName, defVal] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[varName]) {
      process.env[varName] = defVal;
      warnings.push(`⚠️  ${varName}: usando valor por defecto (${defVal})`);
    } else {
      console.log(`✅ ${varName}: ${process.env[varName]}`);
    }
  }

  // Validaciones específicas
  validateSpecificVars(errors, warnings);

  if (warnings.length) {
    console.log('\n📋 Variables con valores por defecto o potencialmente mejorables:');
    warnings.forEach((w) => console.log(w));
  }

  if (errors.length) {
    console.error('\n💥 Errores en configuración:');
    errors.forEach((e) => console.error(e));
    console.error('\n📝 Revisa tu archivo .env y corrige los errores.');

    // En Vercel no matamos el build; en local sí fallamos temprano.
    if (!IS_VERCEL) process.exit(1);
  } else {
    console.log('\n✅ Variables de entorno validadas');
  }

  return { ok: errors.length === 0, errors, warnings };
};

const validateSpecificVars = (errors, warnings) => {
  // JWT_SECRET
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('⚠️  JWT_SECRET es muy corto. Recomendado: mínimo 32 caracteres.');
  }

  // PORT (opcional)
  const port = toInt(process.env.PORT, 3001);
  if (port < 1 || port > 65535) {
    warnings.push('⚠️  PORT fuera de rango (1-65535). Usando 3001 en local.');
    process.env.PORT = '3001';
  }

  // MONGODB_URI
  if (process.env.MONGODB_URI && !/^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI)) {
    errors.push('❌ MONGODB_URI debe empezar con "mongodb://" o "mongodb+srv://".');
  }
  if (process.env.MONGODB_URI?.includes('<PASSWORD>') || process.env.MONGODB_URI?.includes('<db_password>')) {
    errors.push('❌ MONGODB_URI contiene placeholders. Reemplázalos por credenciales reales.');
  }

  // UPLOAD_MAX_FILE_SIZE
  const maxFileSize = toInt(process.env.UPLOAD_MAX_FILE_SIZE, 0);
  if (maxFileSize <= 0) {
    errors.push('❌ UPLOAD_MAX_FILE_SIZE debe ser un número positivo.');
  }

  // BCRYPT_ROUNDS
  const rounds = toInt(process.env.BCRYPT_ROUNDS, 12);
  if (rounds < 10 || rounds > 15) {
    warnings.push('⚠️  BCRYPT_ROUNDS recomendado entre 10 y 15.');
  }

  // NODE_ENV
  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(process.env.NODE_ENV)) {
    warnings.push('⚠️  NODE_ENV debe ser: development, production o test.');
  }

  // CORS en prod
  if (NODE_ENV === 'production' && process.env.CORS_ORIGIN?.includes('localhost')) {
    warnings.push('⚠️  CORS_ORIGIN debería ser tu dominio real en producción.');
  }

  // BASE_URL / APP_URL
  const urlLike = (s) => !!s && /^https?:\/\//.test(s);
  if (process.env.BASE_URL && !urlLike(process.env.BASE_URL)) {
    warnings.push('⚠️  BASE_URL debería empezar con "http://" o "https://".');
  }
  if (process.env.APP_URL && !urlLike(process.env.APP_URL)) {
    warnings.push('⚠️  APP_URL debería empezar con "http://" o "https://".');
  }

  // STORAGE_TYPE en Vercel
  if (IS_VERCEL && process.env.STORAGE_TYPE === 'local') {
    warnings.push('⚠️  STORAGE_TYPE=local en Vercel usa FS efímero. Considera Cloudinary en producción.');
  }

  // LOG_LEVEL
  const validLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLevels.includes(process.env.LOG_LEVEL)) {
    warnings.push('⚠️  LOG_LEVEL debe ser: error, warn, info o debug.');
  }

  // UPLOAD_ALLOWED_TYPES
  if (process.env.UPLOAD_ALLOWED_TYPES) {
    const allowed = process.env.UPLOAD_ALLOWED_TYPES.split(',').map((s) => s.trim());
    const valid = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const invalid = allowed.filter((t) => !valid.includes(t));
    if (invalid.length) {
      warnings.push(`⚠️  Tipos de archivo no recomendados: ${invalid.join(', ')}`);
    }
  }
};

/* ─────────────────────────────────────────────────────────────
   Config processada
───────────────────────────────────────────────────────────── */
export const getConfig = () => {
  const allowedTypes = (process.env.UPLOAD_ALLOWED_TYPES || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    app: {
      name: process.env.APP_NAME || 'MiSitioFácil',
      version: process.env.APP_VERSION || '1.0.0',
      env: NODE_ENV,
      port: toInt(process.env.PORT, 3001),
      baseUrl: process.env.BASE_URL,
      appUrl: process.env.APP_URL,
      apiPrefix: (process.env.API_PREFIX || '/api').replace(/\/?$/, ''), // '/api'
      timezone: process.env.TIMEZONE
    },

    // DB
    database: {
      mongodb: {
        uri: process.env.MONGODB_URI,
        maxPoolSize: toInt(process.env.MONGODB_MAX_POOL_SIZE, 10),
        timeoutMs: toInt(process.env.MONGODB_TIMEOUT_MS, 15000)
      },
      // PostgreSQL opcional (si usas reportes u otra cosa)
      postgresql: {
        host: process.env.POSTGRES_HOST,
        port: toInt(process.env.POSTGRES_PORT || '5432', 5432),
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        maxPoolSize: toInt(process.env.POSTGRES_MAX_POOL_SIZE || '5', 5),
        sync: toBool(process.env.POSTGRES_SYNC || 'false')
      }
    },

    auth: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
      bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12)
    },

    storage: {
      type: process.env.STORAGE_TYPE,
      uploadPath: process.env.UPLOAD_PATH,
      maxFileSize: toInt(process.env.UPLOAD_MAX_FILE_SIZE, 2 * 1024 * 1024),
      maxFiles: toInt(process.env.UPLOAD_MAX_FILES, 5),
      allowedTypes,
      cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET
      }
    },

    security: {
      corsOrigin: process.env.CORS_ORIGIN,
      adminCorsOrigin: process.env.ADMIN_CORS_ORIGIN,
      rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      rateLimitMaxRequests: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
      skipRateLimit: toBool(process.env.SKIP_RATE_LIMIT || 'false')
    },

    email: {
      host: process.env.EMAIL_HOST,
      port: toInt(process.env.EMAIL_PORT || '587', 587),
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
      from: process.env.EMAIL_FROM
    },

    notifications: {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER
    },

    logging: {
      level: process.env.LOG_LEVEL,
      file: process.env.LOG_FILE,
      enableConsole: NODE_ENV !== 'production' || IS_VERCEL, // en Vercel: consola
      enableFile: NODE_ENV !== 'production' && !IS_VERCEL   // nunca escribir archivo en Vercel
    },

    development: {
      debugDb: toBool(process.env.DEBUG_DB || 'false'),
      debugRoutes: toBool(process.env.DEBUG_ROUTES || 'false')
    }
  };
};

/* ─────────────────────────────────────────────────────────────
   Chequeos de producción
───────────────────────────────────────────────────────────── */
export const checkProductionReadiness = () => {
  if (NODE_ENV !== 'production') {
    return { ready: true, message: 'Not in production mode' };
  }

  const issues = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    issues.push('JWT_SECRET es muy corto para producción');
  }
  if (process.env.CORS_ORIGIN?.includes('localhost')) {
    issues.push('CORS_ORIGIN no debería usar localhost en producción');
  }
  if (process.env.BASE_URL && !/^https:\/\//.test(process.env.BASE_URL)) {
    issues.push('BASE_URL debería usar HTTPS en producción');
  }
  if (!process.env.APP_URL) {
    issues.push('APP_URL no configurado (útil para construir URLs públicas correctamente)');
  }

  return {
    ready: issues.length === 0,
    issues,
    message: issues.length === 0 ? 'Listo para producción' : 'Requiere configuración adicional'
  };
};

/* ─────────────────────────────────────────────────────────────
   Resumen
───────────────────────────────────────────────────────────── */
const mask = (s) => (s ? s.replace(/\/\/.*@/, '//***:***@') : '');
export const showConfigSummary = () => {
  const config = getConfig();

  console.log('\n📊 Resumen de configuración:');
  console.log(`   🏷️  App: ${config.app.name} v${config.app.version}`);
  console.log(`   🌍 Entorno: ${config.app.env} ${IS_VERCEL ? '(Vercel)' : ''}`);
  console.log(`   🚀 Puerto (local): ${config.app.port}`);
  console.log(`   🔗 APP_URL: ${config.app.appUrl || '(no definido)'}`);
  console.log(`   🔗 BASE_URL: ${config.app.baseUrl || '(no definido)'}`);
  console.log(`   🗄️  MongoDB: ${config.database.mongodb.uri ? '✅ Configurado' : '❌ No configurado'}`);
  console.log(`   🔐 JWT: ${config.auth.jwtSecret ? '✅ Configurado' : '❌ No configurado'}`);
  console.log(`   📁 Storage: ${config.storage.type}${IS_VERCEL && config.storage.type === 'local' ? ' (⚠️ efímero en Vercel)' : ''}`);
  console.log(`   📧 Email: ${config.email.host ? '✅ Configurado' : '⚠️  No configurado'}`);

  if (config.database.mongodb.uri) {
    console.log(`   🔒 Mongo URI: ${mask(config.database.mongodb.uri)}`);
  }

  if (config.app.env === 'production') {
    const prod = checkProductionReadiness();
    console.log(`   🎯 Listo para producción: ${prod.ready ? '✅' : '❌'}`);
    if (!prod.ready) console.log(`      Problemas: ${prod.issues.join(', ')}`);
  }
};

/* ─────────────────────────────────────────────────────────────
   Generador .env.example (sin comillas)
───────────────────────────────────────────────────────────── */
export const generateEnvExample = () => {
  const example = `# ==============================================
# MiSitioFácil - .env.example
# ==============================================

# ============== SERVIDOR ==================
PORT=3001
NODE_ENV=development
APP_URL=
FRONTEND_URL=http://localhost:3000
BASE_URL=http://localhost:3001
API_PREFIX=/api
TIMEZONE=America/Costa_Rica

# ============== MONGODB ===================
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/DATABASE_NAME?retryWrites=true&w=majority
MONGODB_MAX_POOL_SIZE=10
MONGODB_TIMEOUT_MS=15000

# ============== AUTENTICACIÓN =============
JWT_SECRET=tu_jwt_secret_super_seguro_aqui_minimo_32_caracteres
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# ============== STORAGE Y UPLOADS =========
STORAGE_TYPE=local
UPLOAD_PATH=uploads
UPLOAD_MAX_FILE_SIZE=2097152
UPLOAD_MAX_FILES=5
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/jpg
# CLOUDINARY_CLOUD_NAME=
# CLOUDINARY_API_KEY=
# CLOUDINARY_API_SECRET=

# ============== SEGURIDAD =================
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_ROUNDS=12

# ============== LOGGING ===================
LOG_LEVEL=info
LOG_FILE=logs/app.log
`;
  return example;
};

// Export por defecto: config procesada
export default getConfig();
