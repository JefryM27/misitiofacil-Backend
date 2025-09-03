// src/config/database/index.js
import { connectMongoDB } from './mongodb.js';
import { connectPostgreSQL, closePostgreSQL } from './postgresql.js';

/** Detecta si Postgres está configurado por URL o por host/db */
const isPgConfigured = Boolean(
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  (process.env.POSTGRES_HOST && process.env.POSTGRES_DB)
);

/** Probadita rápida de PG sin romper si no está configurado */
async function testPgConnection() {
  if (!isPgConfigured) return false;
  try {
    const sequelize = await connectPostgreSQL(); // devuelve instancia
    if (!sequelize) return false;
    await sequelize.authenticate();
    return true;
  } catch {
    return false;
  }
}

/**
 * Conecta todas las bases de datos requeridas por la app.
 * - MongoDB (obligatorio)
 * - PostgreSQL (opcional si hay variables configuradas)
 */
export const connectDatabases = async () => {
  const results = { mongodb: false, postgresql: false };

  try {
    console.log('🚀 Iniciando conexiones a bases de datos...');
    console.log('📍 Conectando a MongoDB Atlas...');

    // MongoDB (obligatorio)
    try {
      await connectMongoDB();
      results.mongodb = true;
      console.log('✅ MongoDB: Conectado exitosamente');
    } catch (mongoError) {
      console.error('❌ MongoDB: Error de conexión');
      console.error('📋 Detalles:', mongoError?.message || mongoError);
      const msg = mongoError?.message || '';
      if (msg.includes('authentication failed')) {
        console.error('💡 Revisa username/password en MongoDB Atlas');
      }
      if (msg.includes('IP') || msg.includes('not allowed')) {
        console.error('💡 Agrega tu IP en Network Access (MongoDB Atlas)');
      }
      if (msg.includes('ENOTFOUND')) {
        console.error('💡 Verifica la red y que el cluster esté activo');
      }
      // MongoDB es obligatorio: re-lanzar
      throw mongoError;
    }

    // PostgreSQL (opcional)
    if (isPgConfigured) {
      try {
        await connectPostgreSQL();
        results.postgresql = true;
        console.log('✅ PostgreSQL: Conectado');
      } catch (pgErr) {
        console.warn('⚠️ PostgreSQL: No se pudo conectar, continuo sin reportes avanzados');
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
      console.error('🔧 Atlas → Database Access → Verifica credenciales');
    }
    if (msg.includes('IP') || msg.includes('not allowed')) {
      console.error('🔧 Atlas → Network Access → Agrega tu IP');
    }
    throw error;
  }
};

/**
 * Cierra todas las conexiones de base de datos de forma segura.
 */
export const closeDatabases = async () => {
  const tasks = [];

  // Cerrar MongoDB (via mongoose)
  tasks.push(
    (async () => {
      try {
        const { default: mongoose } = await import('mongoose');
        const state = mongoose?.connection?.readyState; // 0..3
        if (typeof state === 'number' && state !== 0) {
          await mongoose.connection.close(false);
          console.log('🛑 MongoDB cerrado');
        } else {
          console.log('ℹ️ MongoDB no estaba conectado; nada que cerrar.');
        }
      } catch (err) {
        console.error('Error cerrando MongoDB:', err?.message || err);
      }
    })()
  );

  // Cerrar PostgreSQL si está configurado
  if (isPgConfigured) {
    tasks.push(
      closePostgreSQL().catch((err) =>
        console.error('Error cerrando PostgreSQL:', err?.message || err)
      )
    );
  }

  await Promise.allSettled(tasks);
  console.log('🔒 Todas las conexiones de base de datos cerradas');
};

/**
 * Verifica el estado de salud de las conexiones.
 */
export const checkDatabaseHealth = async () => {
  const health = {
    mongodb: false,
    postgresql: false,
    timestamp: new Date().toISOString(),
  };

  try {
    const { default: mongoose } = await import('mongoose');
    health.mongodb = mongoose?.connection?.readyState === 1;
    health.postgresql = await testPgConnection();
  } catch (error) {
    console.error('Error verificando salud de bases de datos:', error?.message || error);
  }

  return health;
};

// Re-exportaciones útiles (sin forzar carga de símbolos inexistentes)
export { connectMongoDB } from './mongodb.js';
export { connectPostgreSQL, closePostgreSQL } from './postgresql.js';

export default connectDatabases;
