import { Router } from 'express';
import {
  listRegistrations,
  getRegistrationDetail,
  updateRegistration,
  resumePaymentAction,
  manualCreate,
  manualPaymentOverride,
  registrationPhoto
} from '../../controllers/admin/registrationController.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  statusQuerySchema,
  manualRegistrationSchema
} from '../../validators/registration.js';
import {
  updateRegistrationSchema,
  manualOverrideBodySchema
} from '../../validators/admin.js';
import { ADMIN_ROLES } from '../../config/constants.js';

const router = Router();

router.get('/', requireAuth, validate(statusQuerySchema, 'query'), listRegistrations);

router.post('/manual', requireAuth, validate(manualRegistrationSchema), manualCreate);

router.get('/:id', requireAuth, getRegistrationDetail);
router.patch('/:id', requireAuth, validate(updateRegistrationSchema), updateRegistration);
router.post('/:id/resume-payment', requireAuth, resumePaymentAction);
router.post(
  '/:id/manual-payment-override',
  requireAuth,
  requireRole(ADMIN_ROLES.SUPER_ADMIN),
  validate(manualOverrideBodySchema),
  manualPaymentOverride
);
router.get('/:id/photo', requireAuth, registrationPhoto);

export default router;