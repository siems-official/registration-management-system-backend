import { Router } from 'express';
import {
  initiatePayment,
  ipn,
  gatewaySuccess,
  gatewayFail,
  gatewayCancel
} from '../../controllers/public/paymentController.js';
import { strictLimiter, ipnLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Strict rate limit: payment initiation is abuse-prone (5 / 15 min per IP).
router.post('/initiate/:registrationId', strictLimiter, initiatePayment);
// CellFin calls this server-to-server. Moderate limiter protects the public,
// unauthenticated endpoint without blocking legitimate retries.
router.post('/ipn', ipnLimiter, ipn);
router.post('/CellFinIPN', ipnLimiter, ipn);
router.get('/success', gatewaySuccess);
router.get('/fail', gatewayFail);
router.get('/cancel', gatewayCancel);
router.get('/CellFinSuccess', gatewaySuccess);
router.get('/CellFinFail', gatewayFail);
router.get('/CellFinCancel', gatewayCancel);

export default router;

// Also exported so the bank-conventional callback paths (documented as
// https://domain.com/payment/CellFinIPN etc., outside /api) can be mounted
// directly in app.js without duplicating handlers.
export const paymentRouter = router;