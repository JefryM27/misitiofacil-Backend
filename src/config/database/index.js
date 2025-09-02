// src/config/database/index.js
import { connectMongoDB } from './mongodb.js';
import {
  connectPostgreSQL,
  testPostgreSQLConnection,
  closePostgreSQL,
  sequelize,
} from './postgresql.js';

/**
 * Conecta todas las bases de datos requeridas por la app.
 * - MongoDB (obligatorio)
 * - PostgreSQL (opcional si hay variables configuradas)
 */
export const connectDatabases = async () => {
  const results = {
    mongodb: false,
    postgresql: false,
  };

  try {
    console.log('🚀 Iniciando conexiones a bases de datos...');
    console.log('📍 Conectando a MongoDB Atlas...');

    // ✅ Manejo específico de errores para MongoDB
    try {
      await connectMongoDB();
      results.mongodb = true;
      console.log('✅ MongoDB: Conectado exitosamente');
    } catch (mongoError) {
      console.error('❌ MongoDB: Error de conexión');
      console.error('📋 Detalles:', mongoError?.message || mongoError);

      // Diagnóstico rápido
      const msg = mongoError?.message || '';
      if (msg.includes('authentication failed')) {
        console.error('💡 Revisa username/password en MongoDB Atlas');
      }
      if (msg.includes('IP') || msg.includes('not allowed')) {
        console.error('💡 Agrega tu IP en Network Access (MongoDB Atlas)');
      }
      if (msg.includes('ENOTFOUND')) {
        console.error('💡 Verifica conexión a internet y que el cluster esté activo');
      }

      // MongoDB es obligatorio: re-lanzar
      throw mongoError;
    }

    // PostgreSQL (opcional)
    if (process.env.POSTGRES_HOST && process.env.POSTGRES_DB) {
      try {
        await connectPostgreSQL();
        results.postgresql = true;
        console.log('✅ PostgreSQL: Conectado');
      } catch (pgErr) {
        console.warn('⚠️ PostgreSQL: No se pudo conectar, continuando sin reportes avanzados');
        console.warn('   Razón:', pgErr?.message || pgErr);
      }
    } else {
      console.log('ℹ️ PostgreSQL: No configurado, omitiendo conexión');
    }

    // Resumen
    console.log('\n📊 Estado final de las bases de datos:');
    console.log(`   - MongoDB: ${results.mongodb ? '✅ Activa' : '❌ Inactiva'}`);
    console.log(`   - PostgreSQL: ${results.postgresql ? '✅ Activa' : '⚠️ Inactiva'}`);

    if (!results.mongodb) {
      throw new Error('MongoDB es requerido para el funcionamiento de la aplicación');
    }

    return results;
  } catch (error) {
    console.error('❌ Error crítico conectando bases de datos:', error?.message || error);

    const msg = error?.message || '';
    if (msg.includes('authentication')) {
      console.error('🔧 Ve a MongoDB Atlas → Database Access → Verifica credenciales');
    }
    if (msg.includes('IP') || msg.includes('not allowed')) {
      console.error('🔧 Ve a MongoDB Atlas → Network Access → Agrega tu IP');
    }

    throw error;
  }
};

/**
 * Cierra todas las conexiones de base de datos de forma segura.
 * Incluye guards para evitar TypeError al cerrar conexiones inexistentes.
 */
export const closeDatabases = async () => {
  const tasks = [];

  // 🔒 Cerrar MongoDB (Mongoose) con import dinámico y guard
  tasks.push(
    (async () => {
      try {
        const { default: mongoose } = await import('mongoose');
        // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
        const state = mongoose?.connection?.readyState;
        if (typeof state === 'number' && state !== 0) {
          await mongoose.connection.close(false); // false = no force
          console.log('🛑 MongoDB cerrado');
        } else {
          console.log('ℹ️ MongoDB no estaba conectado; nada que cerrar.');
        }
      } catch (err) {
        console.error('Error cerrando MongoDB:', err?.message || err);
      }
    })()
  );

  // 🔒 Cerrar PostgreSQL si está configurado
  if (process.env.POSTGRES_HOST) {
    tasks.push(
      closePostgreSQL().catch((err) =>
        console.error('Error cerrando PostgreSQL:', err?.message || err)
      )
    );
  }

  // ✅ No revienta si uno de los cierres falla
  await Promise.allSettled(tasks);
  console.log('🔒 Todas las conexiones de base de datos cerradas');
};

/**
 * Verifica el estado de salud de las conexiones.
 * Devuelve flags por motor y un timestamp ISO.
 */
export const checkDatabaseHealth = async () => {
  const health = {
    mongodb: false,
    postgresql: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Estado MongoDB (mongoose)
    const { default: mongoose } = await import('mongoose');
    health.mongodb = mongoose?.connection?.readyState === 1;

    // Estado PostgreSQL
    if (process.env.POSTGRES_HOST) {
      health.postgresql = await testPostgreSQLConnection();
    }
  } catch (error) {
    console.error('Error verificando salud de bases de datos:', error?.message || error);
  }

  return health;
};

// Re-exportaciones para uso directo en otras capas
export {
  connectMongoDB,
  connectPostgreSQL,
  testPostgreSQLConnection,
  closePostgreSQL,
  sequelize,
};

export default connectDatabases;
