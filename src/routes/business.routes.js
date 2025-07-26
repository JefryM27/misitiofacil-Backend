import { Router } from 'express';
import { createBusiness, getMyBusiness, updateBusiness, deleteBusiness } from '../controllers/business.controller.js';
import { auth } from '../middleware/auth.js';

const router = Router();

// Todas las rutas están protegidas con JWT
router.post('/', auth(), createBusiness);
router.get('/', auth(), getMyBusiness);
router.put('/', auth(), updateBusiness);
router.delete('/', auth(), deleteBusiness);

export default router;
