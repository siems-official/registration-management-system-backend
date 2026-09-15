import fs from 'node:fs';
import helmet from 'helmet';
import cors from 'cors';
import express from 'express';
import routes from './routes/index.js';
import { paymentRouter } from './routes/public/paymentRoutes.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());

  const corsOrigin = env.allowedOrigins.length > 0 ? env.allowedOrigins : false;
  app.use(
    cors({
      origin: corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));

  if (!env.isTest) {
    app.use(globalLimiter);
  }

  if (env.cellfin.mock && !env.isTest) {
    logger.warn(
      '*************************************************************\n' +
        '*  CELLFIN_MOCK=true is ON — the gateway is SIMULATED.     *\n' +
        '*  This is for local development ONLY. Never enable it on *\n' +
        '*  a production server.                                    *\n' +
        '*************************************************************'
    );
  }

  // ensure upload dir exists
  fs.mkdirSync(env.upload.dir, { recursive: true });

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  app.use('/api', routes);

  // Bank-conventional callback URLs (https://domain.com/payment/CellFinIPN — no
  // /api prefix) registered with Islami Bank at onboarding.
  app.use('/payment', paymentRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}