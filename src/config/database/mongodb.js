import mongoose from 'mongoose';

export const connectMongoDB = async () => {
  try {
    console.log('🔗 Intentando conectar a MongoDB...');
    
    // ✅ VALIDACIÓN PREVIA
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI no está definida en las variables de entorno');
    }
    
    if (process.env.MONGODB_URI.includes('<db_password>')) {
      throw new Error('MONGODB_URI contiene <db_password>. Reemplázalo con tu password real');
    }
    
    // ✅ MOSTRAR URI CENSURADA
    const censoredUri = process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log('📍 URI:', censoredUri);
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT_MS) || 10000,
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      bufferMaxEntries: 0,
      retryWrites: true,
      w: 'majority',
      authSource: 'admin' // ✅ AGREGADO
    });

    console.log(`✅ MongoDB conectado: ${conn.connection.host}`);
    console.log(`📊 Base de datos: ${conn.connection.name}`);
    return conn;
    
  } catch (err) {
    // ✅ MOSTRAR ERROR COMPLETO
    console.error('❌ Error conectando a MongoDB:');
    console.error('📋 Mensaje:', err.message);
    console.error('📋 Código:', err.code);
    console.error('📋 Nombre:', err.name);
    
    // ✅ DIAGNÓSTICO ESPECÍFICO
    if (err.message.includes('authentication failed') || err.code === 8000) {
      console.error('💡 PROBLEMA: Credenciales incorrectas');
      console.error('   1. Ve a MongoDB Atlas → Database Access');
      console.error('   2. Verifica username/password');
      console.error('   3. Cambia password si es necesario');
    }
    
    if (err.message.includes('IP address') || err.message.includes('not allowed') || err.code === 8) {
      console.error('💡 PROBLEMA: IP no autorizada');
      console.error('   1. Ve a MongoDB Atlas → Network Access');
      console.error('   2. Agrega tu IP actual');
      console.error('   3. O agrega 0.0.0.0/0 para desarrollo');
    }
    
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('💡 PROBLEMA: No se puede resolver el host');
      console.error('   1. Verifica tu conexión a internet');
      console.error('   2. Verifica que el cluster está activo');
      console.error('   3. Prueba con otra red');
    }
    
    if (err.message.includes('timeout') || err.name === 'MongoServerSelectionError') {
      console.error('💡 PROBLEMA: Timeout de conexión');
      console.error('   1. El cluster puede estar pausado');
      console.error('   2. Verifica firewall/antivirus');
      console.error('   3. Aumenta MONGODB_TIMEOUT_MS a 15000');
    }
    
    throw err;
  }
};

// Manejo de eventos de conexión
mongoose.connection.on('connected', () => {
  console.log('🟢 MongoDB conectado exitosamente');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Error en conexión MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB desconectado');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconectado');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('🔒 Conexión MongoDB cerrada por terminación de aplicación');
  } catch (err) {
    console.error('❌ Error cerrando conexión MongoDB:', err);
  }
});

process.on('SIGTERM', async () => {
  try {
    await mongoose.connection.close();
    console.log('🔒 Conexión MongoDB cerrada por SIGTERM');
  } catch (err) {
    console.error('❌ Error cerrando conexión MongoDB:', err);
  }
});

export default connectMongoDB;