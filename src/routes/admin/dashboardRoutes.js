import { Router } from 'express';
import { dashboardStats } from '../../controllers/admin/dashboardController.js';
import { requireAuth } from '../../middleware/auth.js';

const router = Router();

router.get('/stats', requireAuth, dashboardStats);

export default router;