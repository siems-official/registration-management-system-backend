import { Router } from 'express';
import {
  initiatePayment,
  ipn,
  gatewaySuccess,
  gatewayFail,
  gatewayCancel
} from '../../controllers/public/paymentController.js';
import { strictLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Strict rate limit: payment initiation is abuse-prone (5 / 15 min per IP).
router.post('/initiate/:registrationId', strictLimiter, initiatePayment);
// SSLCommerz calls this server-to-server. Do NOT rate limit the IPN.
router.post('/ipn', ipn);
router.get('/success', gatewaySuccess);
router.get('/fail', gatewayFail);
router.get('/cancel', gatewayCancel);

export default router;