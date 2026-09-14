import mongoose from 'mongoose';
import { logger } from './logger.js';
import { env } from './env.js';

export async function connectDB(uri = env.mongoUri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set — cannot connect to MongoDB.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000
  });
  logger.info({ uri: redact(uri) }, 'Connected to MongoDB');
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

function redact(uri) {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    if (u.username) u.username = '***';
    return u.toString();
  } catch {
    return '<mongodb-uri>';
  }
}

export { mongoose };