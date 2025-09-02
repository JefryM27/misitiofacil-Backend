// src/config/database/mongodb.js
// ─────────────────────────────────────────────────────────────
// MongoDB connection helper (Mongoose) — serverless friendly
// - Caches the connection across invocations (Vercel)
// - Attaches event listeners only once
// - Safe logging (redacts credentials)
// ─────────────────────────────────────────────────────────────

import mongoose from 'mongoose';

const {
  NODE_ENV,
  MONGODB_URI,
  MONGODB_TIMEOUT_MS,
  MONGODB_MAX_POOL_SIZE,
  MONGODB_AUTH_SOURCE,          // optional, e.g. 'admin'
  MONGODB_DEBUG                 // 'true' to enable mongoose debug
} = process.env;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}

// Enable Mongoose debug if requested
if (MONGODB_DEBUG === 'true' && NODE_ENV !== 'production') {
  mongoose.set('debug', true);
}

// Global cache shared across hot reloads / serverless invocations
let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

// Prevent attaching listeners multiple times
if (!global._mongooseEventsWired) {
  mongoose.connection.on('connected', () => {
    console.log('🟢 MongoDB connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err?.message || err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB reconnected');
  });
  global._mongooseEventsWired = true;
}

/** Redacts credentials in URI for logs */
function redact(uri) {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  } catch {
    return '***';
  }
}

/** Build connection options compatible with Mongoose 7+ */
function buildOptions() {
  const opts = {
    serverSelectionTimeoutMS: Number(MONGODB_TIMEOUT_MS || 15000),
    maxPoolSize: Number(MONGODB_MAX_POOL_SIZE || 10),
    socketTimeoutMS: 45000,
    retryWrites: true,
    w: 'majority'
  };
  // Only set authSource if provided; Atlas usually doesn't require overriding it
  if (MONGODB_AUTH_SOURCE) opts.authSource = MONGODB_AUTH_SOURCE;
  return opts;
}

/**
 * Connects to Mongo once and reuses the connection.
 * Safe to call multiple times.
 */
export async function connectMongoDB() {
  // Already connected
  if (cached.conn) return cached.conn;

  // Existing in-flight connect
  if (!cached.promise) {
    const options = buildOptions();
    const safeUri = redact(MONGODB_URI);

    console.log('🔗 Connecting to MongoDB…');
    console.log('📍 URI:', safeUri);
    console.log('⚙️  Options:', {
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
      maxPoolSize: options.maxPoolSize,
      socketTimeoutMS: options.socketTimeoutMS,
      authSource: options.authSource || '(default)'
    });

    cached.promise = mongoose.connect(MONGODB_URI, options).then((m) => {
      const { host, name } = m.connection;
      console.log(`✅ MongoDB connected: ${host}`);
      console.log(`📊 Database: ${name}`);
      return m;
    }).catch((err) => {
      // Rich diagnostics
      console.error('❌ Error connecting to MongoDB');
      console.error('📋 Message:', err?.message);
      console.error('📋 Code:', err?.code);
      console.error('📋 Name:', err?.name);

      if (err?.message?.toLowerCase?.().includes('authentication failed') || err?.code === 8000) {
        console.error('💡 Hint: Check Database Access (username/password) in Atlas.');
      }
      if ((err?.message || '').match(/ip|not allowed|whitelist/i) || err?.code === 8) {
        console.error('💡 Hint: Check Network Access (IP allowlist) in Atlas. For dev, 0.0.0.0/0.');
      }
      if ((err?.message || '').match(/ENOTFOUND|getaddrinfo/i)) {
        console.error('💡 Hint: DNS/Connectivity issue. Verify cluster status and network.');
      }
      if (err?.name === 'MongoServerSelectionError' || (err?.message || '').includes('timeout')) {
        console.error('💡 Hint: Server selection timeout. Cluster paused? Firewall? Increase MONGODB_TIMEOUT_MS.');
      }

      // Reset promise so future calls can retry
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

/** Closes the connection — useful in tests */
export async function closeMongoDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      cached.conn = null;
      cached.promise = null;
      console.log('✅ MongoDB connection closed');
    }
  } catch (e) {
    console.warn('⚠️ Error while closing MongoDB:', e?.message || e);
  }
}

export default connectMongoDB;
