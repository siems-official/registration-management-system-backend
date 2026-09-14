import { jest } from '@jest/globals';
import request from 'supertest';
import Registration from '../src/models/Registration.js';
import Capacity from '../src/models/Capacity.js';
import EmailSmsQueueItem from '../src/models/EmailSmsQueueItem.js';
import {
  setupTestDb,
  teardownTestDb,
  resetDb,
  seedBaseSettings,
  createAdmin,
  getSessionToken,
  buildApp,
  registerParticipant,
  alumniPayload,
  mockSessionInit,
  mockValidation,
  findRegistrationByEmail
} from './helpers.js';

describe('Payment reconciliation (IPN)', () => {
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

  describe('happy path + idempotency', () => {
    test('successful IPN marks Paid exactly once even if delivered twice', async () => {
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      mockValidation( { amount: reg.payableAmount });
      const first = await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-IDEMPOTENT',
        amount: reg.payableAmount,
        currency: 'BDT',
        status: 'VALID'
      });
      expect(first.body.data.status).toBe('paid');

      const paid = await Registration.findById(reg._id);
      expect(paid.paymentStatus).toBe('Paid');
      expect(paid.paidAmount).toBe(reg.payableAmount);
      expect(paid.gatewayValidationId).toBe('VAL-IDEMPOTENT');
      expect(paid.ticketDisplayId).toMatch(/^(ALUM|STU)-/);

      const cap = await Capacity.findById('event');
      expect(cap.paidSlots).toBe(1);

      // Second delivery of the SAME tran_id/val_id — must not reprocess
      mockValidation( { amount: reg.payableAmount });
      const second = await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-IDEMPOTENT',
        amount: reg.payableAmount,
        currency: 'BDT',
        status: 'VALID'
      });
      expect(second.body.data.status).toBe('already_paid');

      // No duplicate ticket, no double-counted slot.
      const reg2 = await Registration.findById(reg._id);
      expect(reg2.ticketDisplayId).toBe(paid.ticketDisplayId);
      expect(await Capacity.findById('event')).toMatchObject({ paidSlots: 1 });
      const queueItems = await EmailSmsQueueItem.find({ 'payload.registrationId': reg._id });
      expect(queueItems.length).toBe(2); // one email + one SMS channel item
      expect(queueItems.every((i) => i.type === 'ticket_confirmation')).toBe(true);
      expect(queueItems.some((i) => i.channel === 'email')).toBe(true);
      expect(queueItems.some((i) => i.channel === 'sms')).toBe(true);
    });
  });

  describe('authoritative verification (amount/currency)', () => {
    test('amount mismatch never results in Paid', async () => {
      mockValidation( { amount: 1 });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      const res = await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-BADAMOUNT',
        amount: 1,
        currency: 'BDT',
        status: 'VALID'
      });
      expect(res.body.data.status).toBe('amount_mismatch');

      const updated = await Registration.findById(reg._id);
      expect(updated.paymentStatus).toBe('Verification Failed');
      const cap = await Capacity.findById('event');
      expect(cap.paidSlots).toBe(0);
    });

    test('currency mismatch never results in Paid', async () => {
      mockValidation( { amount: 3000, currency: 'USD' });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      const res = await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-BADCURRENCY',
        amount: 3000,
        currency: 'USD',
        status: 'VALID'
      });
      expect(res.body.data.status).toBe('currency_mismatch');
      expect((await Registration.findById(reg._id)).paymentStatus).toBe('Verification Failed');
    });

    test('gateway-reported non-VALID status never results in Paid', async () => {
      mockValidation( { amount: 3000, status: 'INVALID' });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      const res = await request(app).post('/api/payment/ipn').send({
        tran_id: reg.tran_id,
        val_id: 'VAL-INVALID',
        amount: 3000,
        currency: 'BDT',
        status: 'FAILED'
      });
      expect(res.body.data.status).toBe('verification_failed');
      expect((await Registration.findById(reg._id)).paymentStatus).toBe('Verification Failed');
    });
  });

  describe('atomic capacity reservation under concurrency', () => {
    test('two concurrent IPNs with one slot left — exactly one Paid, one Oversold', async () => {
      await Capacity.findByIdAndUpdate('event', { maxCapacity: 1, paidSlots: 0 });
      mockValidation();

      await registerParticipant(app, alumniPayload({ email: 'one@example.com' }));
      await registerParticipant(app, alumniPayload({ email: 'two@example.com', nid: '2222222222' }));

      const [r1, r2] = await Promise.all([
        findRegistrationByEmail('one@example.com'),
        findRegistrationByEmail('two@example.com')
      ]);

      const payloads = [
        { tran_id: r1.tran_id, val_id: 'VAL-FIGHT-1', amount: r1.payableAmount, currency: 'BDT' },
        { tran_id: r2.tran_id, val_id: 'VAL-FIGHT-2', amount: r2.payableAmount, currency: 'BDT' }
      ];

      const [res1, res2] = await Promise.all(
        payloads.map((p) => request(app).post('/api/payment/ipn').send(p))
      );

      const outcomes = [res1.body.data.status, res2.body.data.status].sort();
      expect(outcomes).toEqual(['oversold', 'paid']);

      const statuses = (
        await Registration.find({ _id: { $in: [r1._id, r2._id] } }).sort({ email: 1 })
      ).map((r) => r.paymentStatus);
      expect(statuses.sort()).toEqual(['Oversold-PendingReview', 'Paid']);

      const cap = await Capacity.findById('event');
      expect(cap.paidSlots).toBe(1);
    });
  });

  describe('admin resume-payment (Section 6.5)', () => {
    test('resume generates a new tran_id on the same document', async () => {
      mockValidation();
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');
      // Resume is only legal from a resumable state — a freshly created record
      // sits in 'Processing', so force it into that state first.
      await Registration.findByIdAndUpdate(reg._id, { paymentStatus: 'Network Error' });
      const originalTranId = reg.tran_id;

      const resume = await request(app)
        .post(`/api/admin/registrations/${reg._id}/resume-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(resume.body.data.tran_id).not.toBe(originalTranId);

      const updated = await Registration.findById(reg._id);
      expect(updated.tran_id).toBe(resume.body.data.tran_id);
      expect(await Registration.countDocuments({ _id: reg._id })).toBe(1);

      // IPN against the NEW tran_id settles the same record.
      mockValidation( { amount: reg.payableAmount });
      const ipnRes = await request(app).post('/api/payment/ipn').send({
        tran_id: resume.body.data.tran_id,
        val_id: 'VAL-RESUMED',
        amount: reg.payableAmount,
        currency: 'BDT',
        status: 'VALID'
      });
      expect(ipnRes.body.data.status).toBe('paid');
    });
  });

  describe('no auto-expiry (Section 6.3)', () => {
    test('a Pending record from an arbitrary time in the past is still visible to admins', async () => {
      mockSessionInit();
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      // Force it into a forgotten Pending state far in the past.
      await Registration.findByIdAndUpdate(reg._id, {
        paymentStatus: 'Pending',
        registeredAt: new Date('2020-01-01T00:00:00Z'),
        updatedAt: new Date('2020-01-01T00:00:00Z'),
        createdAt: new Date('2020-01-01T00:00:00Z')
      });

      const list = await request(app)
        .get('/api/admin/registrations?paymentStatus=Pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(list.body.data.some((r) => r._id === reg._id.toString())).toBe(true);
      // NID is masked in list view.
      expect(list.body.data[0].nid).toBe('******7890');
    });
  });
});