import { Router } from 'express';
import { listAuditLog } from '../../controllers/admin/auditController.js';
import { queueHealth } from '../../controllers/admin/queueHealthController.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { auditLogQuerySchema } from '../../validators/admin.js';

const router = Router();

router.get('/audit-log', requireAuth, validate(auditLogQuerySchema, 'query'), listAuditLog);
router.get('/queue-health', requireAuth, queueHealth);

export default router;