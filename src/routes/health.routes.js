import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// Salud del servidor (CPU/memario/uptime)
router.get('/', (req, res) => {
  const used = process.memoryUsage();
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      usedMB: Math.round((used.heapUsed / 1024 / 1024) * 100) / 100,
      totalMB: Math.round((used.heapTotal / 1024 / 1024) * 100) / 100
    }
  });
});

// Salud de la base de datos (estado + ping)
router.get('/db', async (req, res) => {
  const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const state = mongoose.connection.readyState;
  const label = stateMap[state] ?? 'unknown';

  try {
    if (state === 1) {
      // ping directo a Mongo
      await mongoose.connection.db.admin().command({ ping: 1 });
      return res.json({ success: true, db: label });
    }
    return res.status(503).json({ success: false, db: label, code: 'DB_NOT_CONNECTED' });
  } catch (err) {
    return res.status(500).json({ success: false, db: label, code: 'DB_PING_ERROR', error: err.message });
  }
});

export default router;
