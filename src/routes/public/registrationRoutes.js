import { Router } from 'express';
import { createRegistration, getRegistrationStatus } from '../../controllers/public/registrationController.js';
import { validate } from '../../middleware/validate.js';
import { uploadPhoto } from '../../services/uploadService.js';
import { createRegistrationSchema } from '../../validators/registration.js';

const router = Router();

router.post('/', uploadPhoto, validate(createRegistrationSchema), createRegistration);
router.get('/:id/status', getRegistrationStatus);

export default router;