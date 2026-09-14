import crypto from 'node:crypto';
import pino from 'pino';
import { env } from './env.js';

const level = env.isTest ? 'silent' : env.logLevel;

export const logger = pino({
  level,
  base: { service: 'registration-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: env.isTest || env.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' }
      }
});

export function createRequestId() {
  return crypto.randomUUID();
}