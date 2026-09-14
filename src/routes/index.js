import { Router } from 'express';
import settingsRoutes from './public/settingsRoutes.js';
import registrationRoutes from './public/registrationRoutes.js';
import paymentRoutes from './public/paymentRoutes.js';
import adminAuthRoutes from './admin/authRoutes.js';
import adminDashboardRoutes from './admin/dashboardRoutes.js';
import adminRegistrationRoutes from './admin/registrationRoutes.js';
import adminSettingsRoutes from './admin/settingsRoutes.js';
import adminMiscRoutes from './admin/miscRoutes.js';

const router = Router();

router.use('/settings', settingsRoutes);
router.use('/registrations', registrationRoutes);
router.use('/payment', paymentRoutes);

router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/dashboard', adminDashboardRoutes);
router.use('/admin/registrations', adminRegistrationRoutes);
router.use('/admin/settings', adminSettingsRoutes);
router.use('/admin', adminMiscRoutes);

export default router;