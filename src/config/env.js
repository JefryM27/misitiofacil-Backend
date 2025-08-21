import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

// Definir variables requeridas y opcionales
const REQUIRED_VARS = [
  'MONGODB_URI',
  'JWT_SECRET',
  'PORT'
];

const OPTIONAL_VARS = {
  // Servidor
  NODE_ENV: 'development',
  PORT: '4000',
  BASE_URL: 'http://localhost:4000',
  TIMEZONE: '-06:00',
  
  // MongoDB
  MONGODB_MAX_POOL_SIZE: '10',
  MONGODB_TIMEOUT_MS: '5000',
  
  // JWT
  JWT_EXPIRES_IN: '7d',
  JWT_REFRESH_EXPIRES_IN: '30d',
  
  // Storage
  STORAGE_TYPE: 'local',
  UPLOAD_PATH: 'uploads',
  UPLOAD_MAX_FILE_SIZE: '2097152', // 2MB
  UPLOAD_MAX_FILES: '5',
  UPLOAD_ALLOWED_TYPES: 'image/jpeg,image/png,image/webp,image/jpg',
  
  // Seguridad
  CORS_ORIGIN: 'http://localhost:3000',
  RATE_LIMIT_WINDOW_MS: '900000', // 15 minutos
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

// Función para validar variables de entorno
export const validateEnv = () => {
  const errors = [];
  const warnings = [];
  
  console.log('🔍 Validando variables de entorno...');
  
  // Verificar variables requeridas
  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName]) {
      errors.push(`❌ Variable requerida faltante: ${varName}`);
    } else {
      console.log(`✅ ${varName}: configurado`);
    }
  }
  
  // Establecer valores por defecto para variables opcionales
  for (const [varName, defaultValue] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      warnings.push(`⚠️  ${varName}: usando valor por defecto (${defaultValue})`);
    } else {
      console.log(`✅ ${varName}: ${process.env[varName]}`);
    }
  }
  
  // Validaciones específicas
  validateSpecificVars(errors, warnings);
  
  // Mostrar warnings
  if (warnings.length > 0) {
    console.log('\n📋 Variables con valores por defecto:');
    warnings.forEach(warning => console.log(warning));
  }
  
  // Si hay errores, terminar la aplicación
  if (errors.length > 0) {
    console.error('\n💥 Errores en configuración:');
    errors.forEach(error => console.error(error));
    console.error('\n📝 Revisa tu archivo .env y corrige los errores antes de continuar.');
    process.exit(1);
  }
  
  console.log('\n✅ Todas las variables de entorno están configuradas correctamente');
  return true;
};

// Validaciones específicas para ciertas variables
const validateSpecificVars = (errors, warnings) => {
  // Validar JWT_SECRET
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('⚠️  JWT_SECRET es muy corto. Recomendado: mínimo 32 caracteres');
  }
  
  // Validar PORT
  const port = parseInt(process.env.PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push('❌ PORT debe ser un número entre 1 y 65535');
  }
  
  // Validar MONGODB_URI
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
    errors.push('❌ MONGODB_URI debe empezar con "mongodb://" o "mongodb+srv://"');
  }
  
  // Validar UPLOAD_MAX_FILE_SIZE
  const maxFileSize = parseInt(process.env.UPLOAD_MAX_FILE_SIZE);
  if (isNaN(maxFileSize) || maxFileSize <= 0) {
    errors.push('❌ UPLOAD_MAX_FILE_SIZE debe ser un número positivo');
  }
  
  // Validar BCRYPT_ROUNDS
  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS);
  if (isNaN(bcryptRounds) || bcryptRounds < 10 || bcryptRounds > 15) {
    warnings.push('⚠️  BCRYPT_ROUNDS recomendado entre 10 y 15');
  }
  
  // Validar NODE_ENV
  const validEnvironments = ['development', 'production', 'test'];
  if (!validEnvironments.includes(process.env.NODE_ENV)) {
    warnings.push('⚠️  NODE_ENV debe ser: development, production o test');
  }
  
  // Validar CORS_ORIGIN en producción
  if (process.env.NODE_ENV === 'production' && 
      process.env.CORS_ORIGIN === 'http://localhost:3000') {
    warnings.push('⚠️  CORS_ORIGIN debería ser tu dominio real en producción');
  }
  
  // Validar BASE_URL
  if (process.env.BASE_URL && !process.env.BASE_URL.startsWith('http')) {
    errors.push('❌ BASE_URL debe empezar con "http://" o "https://"');
  }
  
  // Validar LOG_LEVEL
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(process.env.LOG_LEVEL)) {
    warnings.push('⚠️  LOG_LEVEL debe ser: error, warn, info o debug');
  }
  
  // Validar STORAGE_TYPE
  const validStorageTypes = ['local', 'cloudinary'];
  if (!validStorageTypes.includes(process.env.STORAGE_TYPE)) {
    warnings.push('⚠️  STORAGE_TYPE debe ser: local o cloudinary');
  }
  
  // Validar tipos de archivos permitidos
  if (process.env.UPLOAD_ALLOWED_TYPES) {
    const allowedTypes = process.env.UPLOAD_ALLOWED_TYPES.split(',');
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const invalidTypes = allowedTypes.filter(type => !validMimeTypes.includes(type.trim()));
    
    if (invalidTypes.length > 0) {
      warnings.push(`⚠️  Tipos de archivo no recomendados: ${invalidTypes.join(', ')}`);
    }
  }
};

// Función para obtener configuración procesada
export const getConfig = () => {
  return {
    // Servidor
    app: {
      name: process.env.APP_NAME || 'MiSitioFácil',
      version: process.env.APP_VERSION || '1.0.0',
      env: process.env.NODE_ENV,
      port: parseInt(process.env.PORT),
      baseUrl: process.env.BASE_URL,
      timezone: process.env.TIMEZONE
    },
    
    // Base de datos
    database: {
      mongodb: {
        uri: process.env.MONGODB_URI,
        maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE),
        timeoutMs: parseInt(process.env.MONGODB_TIMEOUT_MS)
      },
      postgresql: {
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        maxPoolSize: parseInt(process.env.POSTGRES_MAX_POOL_SIZE || '5'),
        sync: process.env.POSTGRES_SYNC === 'true'
      }
    },
    
    // Autenticación
    auth: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS)
    },
    
    // Storage
    storage: {
      type: process.env.STORAGE_TYPE,
      uploadPath: process.env.UPLOAD_PATH,
      maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE),
      maxFiles: parseInt(process.env.UPLOAD_MAX_FILES),
      allowedTypes: process.env.UPLOAD_ALLOWED_TYPES.split(',').map(type => type.trim()),
      cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET
      }
    },
    
    // Seguridad
    security: {
      corsOrigin: process.env.CORS_ORIGIN,
      adminCorsOrigin: process.env.ADMIN_CORS_ORIGIN,
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS),
      rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS),
      skipRateLimit: process.env.SKIP_RATE_LIMIT === 'true'
    },
    
    // Email (futuro)
    email: {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
      from: process.env.EMAIL_FROM
    },
    
    // SMS/WhatsApp (futuro)
    notifications: {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER
    },
    
    // Logging
    logging: {
      level: process.env.LOG_LEVEL,
      file: process.env.LOG_FILE,
      enableConsole: process.env.NODE_ENV !== 'production',
      enableFile: true
    },
    
    // Desarrollo
    development: {
      debugDb: process.env.DEBUG_DB === 'true',
      debugRoutes: process.env.DEBUG_ROUTES === 'true'
    }
  };
};

// Función para verificar si la aplicación está lista para producción
export const checkProductionReadiness = () => {
  if (process.env.NODE_ENV !== 'production') {
    return { ready: true, message: 'Not in production mode' };
  }
  
  const issues = [];
  
  // Verificar JWT_SECRET seguro
  if (process.env.JWT_SECRET.length < 32) {
    issues.push('JWT_SECRET es muy corto para producción');
  }
  
  // Verificar CORS configurado correctamente
  if (process.env.CORS_ORIGIN.includes('localhost')) {
    issues.push('CORS_ORIGIN no debería usar localhost en producción');
  }
  
  // Verificar BASE_URL
  if (!process.env.BASE_URL.startsWith('https://')) {
    issues.push('BASE_URL debería usar HTTPS en producción');
  }
  
  // Verificar variables de producción específicas
  const productionVars = [
    'POSTGRES_HOST',
    'EMAIL_HOST',
    'CLOUDINARY_CLOUD_NAME'
  ];
  
  const missingOptional = productionVars.filter(varName => !process.env[varName]);
  if (missingOptional.length > 0) {
    issues.push(`Variables opcionales faltantes: ${missingOptional.join(', ')}`);
  }
  
  return {
    ready: issues.length === 0,
    issues: issues,
    message: issues.length === 0 ? 'Listo para producción' : 'Requiere configuración adicional'
  };
};

// Función para mostrar resumen de configuración
export const showConfigSummary = () => {
  const config = getConfig();
  
  console.log('\n📊 Resumen de configuración:');
  console.log(`   🏷️  Aplicación: ${config.app.name} v${config.app.version}`);
  console.log(`   🌍 Entorno: ${config.app.env}`);
  console.log(`   🚀 Puerto: ${config.app.port}`);
  console.log(`   🗄️  MongoDB: ${config.database.mongodb.uri ? '✅ Configurado' : '❌ No configurado'}`);
  console.log(`   🐘 PostgreSQL: ${config.database.postgresql.host ? '✅ Configurado' : '⚠️  No configurado'}`);
  console.log(`   🔐 JWT: ${config.auth.jwtSecret ? '✅ Configurado' : '❌ No configurado'}`);
  console.log(`   📁 Storage: ${config.storage.type}`);
  console.log(`   📧 Email: ${config.email.host ? '✅ Configurado' : '⚠️  No configurado'}`);
  console.log(`   📱 SMS: ${config.notifications.twilioAccountSid ? '✅ Configurado' : '⚠️  No configurado'}`);
  
  if (config.app.env === 'production') {
    const prodCheck = checkProductionReadiness();
    console.log(`   🎯 Listo para producción: ${prodCheck.ready ? '✅' : '❌'}`);
    if (!prodCheck.ready) {
      console.log(`      Problemas: ${prodCheck.issues.join(', ')}`);
    }
  }
};

// Función para generar .env.example basado en la configuración actual
export const generateEnvExample = () => {
  const example = `# ==============================================
# MISITOFÁCIL - TEMPLATE DE CONFIGURACIÓN
# ==============================================

# ============== SERVIDOR ==================
PORT=4000
NODE_ENV=development
BASE_URL=http://localhost:4000
TIMEZONE=-06:00

# ============== MONGODB ===================
MONGODB_URI="mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/DATABASE_NAME?retryWrites=true&w=majority"
MONGODB_MAX_POOL_SIZE=10
MONGODB_TIMEOUT_MS=5000

# ============== POSTGRESQL (REPORTES) =====
# POSTGRES_HOST=localhost
# POSTGRES_PORT=5432
# POSTGRES_DB=misitiofacil_reports
# POSTGRES_USER=tu_usuario
# POSTGRES_PASSWORD=tu_password

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

# ============== SEGURIDAD ==================
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
BCRYPT_ROUNDS=12

# ============== LOGGING ====================
LOG_LEVEL=info
LOG_FILE=logs/app.log
`;
  
  return example;
};

// Exportar configuración procesada como default
export default getConfig();