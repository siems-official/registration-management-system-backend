import { createApp } from './src/app.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { env } from './src/config/env.js';
import { logger } from './src/config/logger.js';
import { startQueueWorker } from './src/jobs/queueWorker.js';

async function main() {
  await connectDB();
  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, 'Registration API listening');
  });

  const queueWorker = startQueueWorker();

  async function shutdown(signal) {
    logger.info({ signal }, 'Received shutdown signal');
    clearInterval(queueWorker);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});