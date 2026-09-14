import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Admin from '../src/models/Admin.js';
import FeeConfig from '../src/models/FeeConfig.js';
import Capacity from '../src/models/Capacity.js';
import RegistrationSettings from '../src/models/RegistrationSettings.js';
import { env } from '../src/config/env.js';
import { makePng } from './utils/png.js';

let mongo;

export async function setupTestDb() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

export async function teardownTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
    mongo = null;
  }
}

export async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
}

export async function seedBaseSettings(overrides = {}) {
  await FeeConfig.create({
    _id: 'event',
    alumnusFee: overrides.alumnusFee ?? 2000,
    currentStudentFee: overrides.currentStudentFee ?? 1000,
    perAccompanyFee: overrides.perAccompanyFee ?? 1000
  });
  await Capacity.create({
    _id: 'event',
    maxCapacity: overrides.maxCapacity ?? 5000,
    paidSlots: overrides.paidSlots ?? 0
  });
  await RegistrationSettings.create({
    _id: 'event',
    registrationDeadline:
      overrides.registrationDeadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  });
}

export const TEST_TOTP = 'JBSWY3DPEHPK3PXP';

export async function createAdmin({
  username = 'super',
  password = 'strongpass123',
  role = 'SuperAdmin',
  isActive = true,
  totpSecret = TEST_TOTP
} = {}) {
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  return Admin.create({ username, passwordHash, totpSecret, role, isActive });
}

export async function loginStep1(app, { username = 'super', password = 'strongpass123' } = {}) {
  const res = await request(app)
    .post('/api/admin/auth/login')
    .send({ username, password })
    .expect(200);
  return res.body.data.preauthToken;
}

export async function loginStep2(app, preauthToken, totp = null) {
  const code = totp || authenticator.generate(TEST_TOTP);
  const res = await request(app)
    .post('/api/admin/auth/login/verify-2fa')
    .set('Authorization', `Bearer ${preauthToken}`)
    .send({ totp: code })
    .expect(200);
  return res.body.data.token;
}

export async function getSessionToken(app, opts = {}) {
  const preauth = await loginStep1(app, opts);
  return loginStep2(app, preauth);
}

export function buildApp() {
  return createApp();
}

export function alumniPayload(overrides = {}) {
  return {
    participantType: 'Alumni',
    name: 'Fahim Rahman',
    nid: '1234567890',
    dateOfBirth: '1990-05-15',
    profession: 'Software Engineer',
    designation: 'Senior Engineer',
    institution: 'BUET',
    presentAddress: 'Dhaka',
    permanentAddress: 'Chittagong',
    whatsappNo: '+8801711111111',
    email: 'fahim@example.com',
    yearOfPassingBSc: 2012,
    yearOfPassingMSc: 2014,
    numberOfAccompany: 1,
    tshirtSize: 'M',
    ...overrides
  };
}

export function studentPayload(overrides = {}) {
  return {
    participantType: 'Current Student',
    name: 'Rafi Ahmed',
    nid: '9876543210',
    dateOfBirth: '2001-03-22',
    institution: 'BUET',
    presentAddress: 'Dhaka',
    permanentAddress: 'Dhaka',
    whatsappNo: '+8801722222222',
    email: 'rafi@example.com',
    numberOfAccompany: 0,
    tshirtSize: 'L',
    ...overrides
  };
}

export function attachRegistrationBody(req, payload) {
  let r = req;
  for (const [key, value] of Object.entries(payload)) {
    if (key !== 'photo') {
      r = r.field(key, String(value));
    }
  }
  return r;
}

/**
 * Register a participant through the public multipart endpoint with a real
 * photo. Requires sslcommerz.initiateSession to be mocked by the caller.
 */
export async function registerParticipant(app, payload, { photo = makePng(100, 100) } = {}) {
  let req = request(app).post('/api/registrations');
  req = attachRegistrationBody(req, payload);
  if (photo) req = req.attach('photo', photo, { filename: 'photo.png', contentType: 'image/png' });
  const res = await req;
  return res;
}

export async function findRegistrationByEmail(email) {
  const Registration = (await import('../src/models/Registration.js')).default;
  return Registration.findOne({ email });
}

export {
  mockSessionInit,
  mockValidation,
  mockSessionFailure,
  armGateway
} from './mockGateway.js';

export { makePng } from './utils/png.js';