import { jest } from '@jest/globals';
import request from 'supertest';
import Registration from '../src/models/Registration.js';
import AdminActionLog from '../src/models/AdminActionLog.js';
import Capacity from '../src/models/Capacity.js';
import Admin from '../src/models/Admin.js';
import { authenticator } from 'otplib';
import {
  setupTestDb,
  teardownTestDb,
  resetDb,
  seedBaseSettings,
  createAdmin,
  getSessionToken,
  loginStep1,
  buildApp,
  registerParticipant,
  alumniPayload,
  studentPayload,
  mockSessionInit,
  mockValidation,
  findRegistrationByEmail,
  TEST_TOTP
} from './helpers.js';

const ADMIN_ONLY_ROUTES = [
  { method: 'get', path: '/api/admin/auth/me' },
  { method: 'get', path: '/api/admin/dashboard/stats' },
  { method: 'get', path: '/api/admin/registrations' },
  { method: 'get', path: '/api/admin/settings/fees' },
  { method: 'patch', path: '/api/admin/settings/capacity', body: { maxCapacity: 5000 } },
  { method: 'get', path: '/api/admin/audit-log' },
  { method: 'get', path: '/api/admin/queue-health' }
];

describe('Admin auth & security', () => {
  let app;
  let adminToken;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetDb();
    await seedBaseSettings();
    await createAdmin();
    adminToken = await getSessionToken(buildApp());
    app = buildApp();
    mockSessionInit();
  });

  describe('two-step login', () => {
    test('login fails with a wrong password', async () => {
      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({ username: 'super', password: 'wrong-password' })
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    test('login does not complete without a valid TOTP code', async () => {
      const preauth = await loginStep1(app);
      const res = await request(app)
        .post('/api/admin/auth/login/verify-2fa')
        .set('Authorization', `Bearer ${preauth}`)
        .send({ totp: '000000' })
        .expect(401);
      expect(res.body.error.code).toBe('INVALID_TOTP');
      // No session token may have been issued
      expect(res.body.data).toBeUndefined();
    });

    test('a preauth token can only ever complete at verify-2fa, never on a protected route (fix #4)', async () => {
      const preauth = await loginStep1(app);

      for (const route of ADMIN_ONLY_ROUTES) {
        let req = request(app)[route.method](route.path);
        if (route.body) req = req.send(route.body);
        const res = await req.set('Authorization', `Bearer ${preauth}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('2FA_REQUIRED');
      }

      // routes that need a real registration id still fail auth first
      const someId = '000000000000000000000000';
      const idRoutes = [
        ['get', `/api/admin/registrations/${someId}`],
        ['patch', `/api/admin/registrations/${someId}`],
        ['post', `/api/admin/registrations/${someId}/resume-payment`],
        ['get', `/api/admin/registrations/${someId}/photo`],
        ['post', `/api/admin/registrations/${someId}/manual-payment-override`]
      ];
      for (const [method, path] of idRoutes) {
        const res = await request(app)[method](path).set('Authorization', `Bearer ${preauth}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('2FA_REQUIRED');
      }

      // The same preauth token IS accepted at verify-2fa — proving the
      // exception is scoped to exactly that one route.
      const verified = await request(app)
        .post('/api/admin/auth/login/verify-2fa')
        .set('Authorization', `Bearer ${preauth}`)
        .send({ totp: authenticator.generate(TEST_TOTP) })
        .expect(200);
      expect(verified.body.data.token).toBeTruthy();
    });

    test('TOTP brute-force is throttled on verify-2fa (fix #1)', async () => {
      process.env.ENABLE_RATELIMIT_IN_TEST = 'true';
      try {
        const throttledApp = buildApp();
        const preauth = await loginStep1(throttledApp);

        for (let i = 0; i < 5; i += 1) {
          const res = await request(throttledApp)
            .post('/api/admin/auth/login/verify-2fa')
            .set('Authorization', `Bearer ${preauth}`)
            .send({ totp: '111111' });
          expect([401, 429]).toContain(res.status);
          if (res.status === 429) return; // already throttled early = fine
        }
        const sixth = await request(throttledApp)
          .post('/api/admin/auth/login/verify-2fa')
          .set('Authorization', `Bearer ${preauth}`)
          .send({ totp: '111111' });
        expect(sixth.status).toBe(429);
        expect(sixth.body.error.code).toBe('RATE_LIMITED');
      } finally {
        process.env.ENABLE_RATELIMIT_IN_TEST = 'false';
      }
    });

    test('a disabled admin cannot use a previously-issued session token', async () => {
      await Admin.findByIdAndUpdate((await Admin.findOne({ username: 'super' }))._id, {
        isActive: false
      });
      const res = await request(app)
        .get('/api/admin/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(401);
      expect(res.body.error.code).toBe('ADMIN_DISABLED');
    });
  });

  describe('audit logging is mandatory', () => {
    test('fee update logs before/after', async () => {
      const res = await request(app)
        .patch('/api/admin/settings/fees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ alumnusFee: 2500 })
        .expect(200);
      expect(res.body.data.alumnusFee).toBe(2500);

      const log = await AdminActionLog.findOne({ action: 'fee_update' }).sort({ timestamp: -1 });
      expect(log).not.toBeNull();
      expect(log.before.alumnusFee).toBe(2000);
      expect(log.after.alumnusFee).toBe(2500);
      expect(log.targetType).toBe('FeeConfig');
    });

    test('capacity update logs before/after', async () => {
      const res = await request(app)
        .patch('/api/admin/settings/capacity')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maxCapacity: 1000 })
        .expect(200);
      expect(res.body.data.maxCapacity).toBe(1000);

      const log = await AdminActionLog.findOne({ action: 'capacity_update' }).sort({ timestamp: -1 });
      expect(log.before.maxCapacity).toBe(5000);
      expect(log.after.maxCapacity).toBe(1000);
    });

    test('deadline update logs before/after', async () => {
      const newDeadline = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .patch('/api/admin/settings/registration-deadline')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ registrationDeadline: newDeadline })
        .expect(200);
      expect(res.body.data.registrationDeadline).toBeTruthy();

      const log = await AdminActionLog.findOne({ action: 'registration_deadline_update' }).sort({
        timestamp: -1
      });
      expect(new Date(log.before.registrationDeadline).getTime()).toBeLessThan(
        new Date(log.after.registrationDeadline).getTime()
      );
    });

    test('sensitive-data detail view is logged as view_sensitive_data', async () => {
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      const res = await request(app)
        .get(`/api/admin/registrations/${reg._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.data.sensitive.nid).toBe('1234567890');

      const log = await AdminActionLog.findOne({ action: 'view_sensitive_data' }).sort({ timestamp: -1 });
      expect(log).not.toBeNull();
      expect(String(log.targetId)).toBe(String(reg._id));
    });
  });

  describe('manual capacity override (fix #5)', () => {
    async function seedOversoldRegistration() {
      await registerParticipant(app, alumniPayload());
      const doc = await findRegistrationByEmail('fahim@example.com');
      await Registration.findByIdAndUpdate(doc._id, {
        paymentStatus: 'Oversold-PendingReview'
      });
      return doc;
    }

    test('resolves via mark-paid and logs a distinct capacity_manual_override with paidSlots before/after', async () => {
      await seedOversoldRegistration();
      const reg = await findRegistrationByEmail('fahim@example.com');
      const capBefore = await Capacity.findById('event');

      const res = await request(app)
        .post(`/api/admin/registrations/${reg._id}/manual-payment-override`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'mark-paid', note: 'resolved oversold' })
        .expect(200);

      expect(res.body.data.resolvedTo).toBe('Paid');

      const overrideLogs = await AdminActionLog.find({ action: 'capacity_manual_override' }).sort({
        timestamp: 1
      });
      expect(overrideLogs.length).toBe(2);

      const capacityLog = overrideLogs.find((l) => l.targetType === 'Capacity');
      expect(capacityLog.before.paidSlots).toBe(capBefore.paidSlots);
      expect(capacityLog.after.paidSlots).toBe(capBefore.paidSlots + 1);
      expect(capacityLog.action).toBe('capacity_manual_override');

      const regLog = overrideLogs.find((l) => l.targetType === 'Registration');
      expect(regLog.before.paymentStatus).toBe('Oversold-PendingReview');
      expect(regLog.after.paymentStatus).toBe('Paid');
    });

    test('a non-SuperAdmin Admin is forbidden', async () => {
      await createAdmin({ username: 'staff', role: 'Admin', totpSecret: TEST_TOTP });
      const staffToken = await getSessionToken(app, { username: 'staff' });

      await seedOversoldRegistration();
      const reg = await findRegistrationByEmail('fahim@example.com');

      const res = await request(app)
        .post(`/api/admin/registrations/${reg._id}/manual-payment-override`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ action: 'mark-paid' })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('fee changes are not retroactive', () => {
    test('existing Paid records keep their original amounts after a fee change', async () => {
      mockSessionInit();
      mockValidation();
      await registerParticipant(app, alumniPayload({ numberOfAccompany: 0 }));
      const reg = await findRegistrationByEmail('fahim@example.com');

      // settle first registration at 2000
      await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-FSN-1',
        amount: reg.payableAmount,
        currency: 'BDT',
        status: 'VALID'
      });

      await request(app)
        .patch('/api/admin/settings/fees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ alumnusFee: 3000, perAccompanyFee: 1200 })
        .expect(200);

      // new registration picks up the new fee
      const next = await registerParticipant(
        app,
        alumniPayload({ email: 'next@example.com', nid: '3333333333', numberOfAccompany: 0 })
      );
      expect(next.body.data.payableAmount).toBe(3000); // no accompany

      const settled = await Registration.findById(reg._id);
      expect(settled.payableAmount).toBe(2000);
      expect(settled.paidAmount).toBe(2000);
    });
  });

  describe('manual payment override flag on Paid records', () => {
    test('editing paidAmount on a Paid record requires the explicit override flag', async () => {
      mockValidation();
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');
      await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-OVR',
        amount: reg.payableAmount,
        currency: 'BDT',
        status: 'VALID'
      });

      const reject = await request(app)
        .patch(`/api/admin/registrations/${reg._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paidAmount: 1 })
        .expect(400);
      expect(reject.body.error.code).toBe('PAYMENT_OVERRIDE_REQUIRED');

      const ok = await request(app)
        .patch(`/api/admin/registrations/${reg._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paidAmount: 1500, paidAmountOverride: true })
        .expect(200);
      expect(ok.body.data.registration.paidAmount).toBe(1500);

      const overrideLog = await AdminActionLog.findOne({
        action: 'manual_payment_override'
      }).sort({ timestamp: -1 });
      expect(overrideLog).not.toBeNull();
      expect(overrideLog.before.paidAmount).toBe(reg.payableAmount);
      expect(overrideLog.after.paidAmount).toBe(1500);
    });
  });

  describe('admin PATCH member edit recomputes fee server-side', () => {
    test('changing accompany count on a non-Paid record re-derives payableAmount', async () => {
      await registerParticipant(app, studentPayload());
      const reg = await findRegistrationByEmail('rafi@example.com');

      const res = await request(app)
        .patch(`/api/admin/registrations/${reg._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ numberOfAccompany: 2 })
        .expect(200);
      // Server recomputes payableAmount from the updated numberOfAccompany
      expect(res.body.data.registration.payableAmount).toBe(1000 + 2 * 1000);
    });
  });
});