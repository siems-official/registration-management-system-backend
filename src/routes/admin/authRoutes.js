import { Router } from 'express';
import { login, verify2fa, me } from '../../controllers/admin/authController.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { strictLimiter, verify2faLimiter } from '../../middleware/rateLimiter.js';
import { adminLoginSchema, verify2faSchema } from '../../validators/admin.js';

const router = Router();

router.post('/login', strictLimiter, validate(adminLoginSchema), login);
router.post('/login/verify-2fa', verify2faLimiter, validate(verify2faSchema), verify2fa);
router.get('/me', requireAuth, me);

export default router;