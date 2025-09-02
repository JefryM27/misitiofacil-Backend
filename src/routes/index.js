// src/routes/index.js - CORREGIDO
import express from 'express';

// Importa cada subrouter
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import businessRoutes from './business.routes.js';
import serviceRoutes from './service.routes.js';
import templateRoutes from './template.routes.js';
import reservationRoutes from './reservation.routes.js';
import uploadRoutes from './upload.routes.js';
import { Router } from 'express';

const router = express.Router();

// Endpoint base (GET /api)
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    name: 'MiSitioFácil API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    documentation: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      business: '/api/business',        // ✅ Singular para consistencia
      services: '/api/services',
      reservations: '/api/reservations',
      templates: '/api/templates',
      uploads: '/api/uploads',
    },
  });
});

// Health bajo /api/health
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      usedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      totalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  });
});

// ✅ MONTAJE DE SUBRUTAS (nombres consistentes)
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/business', businessRoutes);
router.use('/services', serviceRoutes);
router.use('/templates', templateRoutes);
router.use('/reservations', reservationRoutes);
router.use('/uploads', uploadRoutes);

export default router;