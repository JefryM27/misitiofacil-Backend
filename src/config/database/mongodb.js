// src/config/database/mongodb.js
import mongoose from 'mongoose';

// Cache global para reusar la conexión en invocaciones calientes (Vercel)
const g = globalThis;
g.__MONGO_CACHE__ ||= { conn: null, promise: null };

export async function connectMongoDB() {
  const uri = process.env.MONGODB_URI;

  // No tronar en import: solo validamos aquí, cuando hace falta la DB
  if (!uri) {
    const err = new Error('MONGODB_URI is required');
    err.code = 'CONFIG_MISSING';
    throw err;
  }

  if (g.__MONGO_CACHE__.conn) return g.__MONGO_CACHE__.conn;

  if (!g.__MONGO_CACHE__.promise) {
    // Ajusta los valores por env si los defines
    const maxPoolSize = Number(process.env.MONGODB_MAX_POOL_SIZE || 10);
    const serverSelectionTimeoutMS = Number(process.env.MONGODB_TIMEOUT_MS || 15000);

    mongoose.set('strictQuery', false);

    g.__MONGO_CACHE__.promise = mongoose
      .connect(uri, {
        maxPoolSize,
        serverSelectionTimeoutMS,
        retryWrites: true,
        w: 'majority',
      })
      .then((m) => {
        const { host, name } = m.connection;
        // No uses console en prod si prefieres tu logger
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.log(`✅ MongoDB connected: ${host}/${name}`);
        }

        m.connection.on('error', (e) => {
          // eslint-disable-next-line no-console
          console.error('❌ Mongo error:', e?.message || e);
        });
        m.connection.on('disconnected', () => {
          // eslint-disable-next-line no-console
          console.warn('⚠️ MongoDB disconnected');
        });

        return m.connection;
      })
      .catch((e) => {
        // Limpia el cache si falla, para permitir reintentos en futuras invocaciones
        g.__MONGO_CACHE__.promise = null;
        throw e;
      });
  }

  g.__MONGO_CACHE__.conn = await g.__MONGO_CACHE__.promise;
  return g.__MONGO_CACHE__.conn;
}

export async function closeMongoDB() {
  if (g.__MONGO_CACHE__.conn) {
    await mongoose.connection.close().catch(() => {});
    g.__MONGO_CACHE__.conn = null;
    g.__MONGO_CACHE__.promise = null;
  }
}
