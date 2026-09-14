import { Router } from 'express';
import {
  getFees,
  patchFees,
  getCapacity,
  patchCapacity,
  getDeadline,
  patchDeadline
} from '../../controllers/admin/settingsController.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  feeConfigPatchSchema,
  capacityPatchSchema,
  deadlinePatchSchema
} from '../../validators/admin.js';

const router = Router();

router.get('/fees', requireAuth, getFees);
router.patch('/fees', requireAuth, validate(feeConfigPatchSchema), patchFees);

router.get('/capacity', requireAuth, getCapacity);
router.patch('/capacity', requireAuth, validate(capacityPatchSchema), patchCapacity);

router.get('/registration-deadline', requireAuth, getDeadline);
router.patch('/registration-deadline', requireAuth, validate(deadlinePatchSchema), patchDeadline);

export default router;