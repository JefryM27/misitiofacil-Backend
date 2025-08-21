import { connectMongoDB } from './mongodb.js';
import { connectPostgreSQL, testPostgreSQLConnection, closePostgreSQL } from './postgresql.js';
import { sequelize } from './postgresql.js';

// Función principal para conectar todas las bases de datos
export const connectDatabases = async () => {
  const results = {
    mongodb: false,
    postgresql: false
  };

  try {
    // Conectar MongoDB (obligatorio)
    console.log('🚀 Iniciando conexiones a bases de datos...');
    console.log('📍 Conectando a MongoDB Atlas...');
    
    // ✅ CORRECCIÓN: Manejo específico de errores de MongoDB
    try {
      await connectMongoDB();
      results.mongodb = true;
      console.log('✅ MongoDB: Conectado exitosamente');
    } catch (mongoError) {
      console.error('❌ MongoDB: Error de conexión');
      console.error('📋 Detalles:', mongoError.message);
      
      // Diagnóstico específico sin debug extenso
      if (mongoError.message.includes('authentication failed')) {
        console.error('💡 Revisa username/password en MongoDB Atlas');
      }
      
      if (mongoError.message.includes('IP') || mongoError.message.includes('not allowed')) {
        console.error('💡 Agrega tu IP en Network Access (MongoDB Atlas)');
      }
      
      if (mongoError.message.includes('ENOTFOUND')) {
        console.error('💡 Verifica conexión a internet y que el cluster esté activo');
      }
      
      // Re-lanzar el error
      throw mongoError;
    }

    // Conectar PostgreSQL (opcional, si está configurado)
    if (process.env.POSTGRES_HOST && process.env.POSTGRES_DB) {
      try {
        await connectPostgreSQL();
        results.postgresql = true;
        console.log('✅ PostgreSQL: Conectado');
      } catch (error) {
        console.warn('⚠️ PostgreSQL: No se pudo conectar, continuando sin reportes avanzados');
        console.warn('   Razón:', error.message);
      }
    } else {
      console.log('ℹ️ PostgreSQL: No configurado, omitiendo conexión');
    }

    // Resumen de conexiones
    console.log('\n📊 Estado final de las bases de datos:');
    console.log(`   - MongoDB: ${results.mongodb ? '✅ Activa' : '❌ Inactiva'}`);
    console.log(`   - PostgreSQL: ${results.postgresql ? '✅ Activa' : '⚠️ Inactiva'}`);
    
    if (!results.mongodb) {
      throw new Error('MongoDB es requerido para el funcionamiento de la aplicación');
    }

    return results;

  } catch (error) {
    console.error('❌ Error crítico conectando bases de datos:', error.message);
    
    // Sugerencias rápidas basadas en el error
    if (error.message.includes('authentication')) {
      console.error('🔧 Ve a MongoDB Atlas → Database Access → Verifica credenciales');
    }
    
    if (error.message.includes('IP') || error.message.includes('not allowed')) {
      console.error('🔧 Ve a MongoDB Atlas → Network Access → Agrega tu IP');
    }
    
    throw error;
  }
};

// Función para cerrar todas las conexiones
export const closeDatabases = async () => {
  const promises = [];

  // Cerrar MongoDB
  promises.push(
    import('mongoose').then(mongoose => mongoose.connection.close())
      .catch(err => console.error('Error cerrando MongoDB:', err))
  );

  // Cerrar PostgreSQL si está conectado
  if (process.env.POSTGRES_HOST) {
    promises.push(
      closePostgreSQL().catch(err => console.error('Error cerrando PostgreSQL:', err))
    );
  }

  await Promise.all(promises);
  console.log('🔒 Todas las conexiones de base de datos cerradas');
};

// Función para verificar el estado de las conexiones
export const checkDatabaseHealth = async () => {
  const health = {
    mongodb: false,
    postgresql: false,
    timestamp: new Date().toISOString()
  };

  try {
    // Verificar MongoDB
    const mongoose = await import('mongoose');
    health.mongodb = mongoose.connection.readyState === 1;
    
    // Verificar PostgreSQL
    if (process.env.POSTGRES_HOST) {
      health.postgresql = await testPostgreSQLConnection();
    }

    return health;
  } catch (error) {
    console.error('Error verificando salud de bases de datos:', error);
    return health;
  }
};

// Exportaciones para uso directo
export { 
  connectMongoDB, 
  connectPostgreSQL, 
  testPostgreSQLConnection,
  closePostgreSQL,
  sequelize 
};

export default connectDatabases;