import { Router } from 'express';
import { getFees, getRegistrationSettings } from '../../controllers/public/settingsController.js';

const router = Router();

router.get('/fees', getFees);
router.get('/registration', getRegistrationSettings);

export default router;