import { jest } from '@jest/globals';
import request from 'supertest';
import Registration from '../src/models/Registration.js';
import Capacity from '../src/models/Capacity.js';
import EmailSmsQueueItem from '../src/models/EmailSmsQueueItem.js';
import { CELLFIN_STATUS_MAP, CELLFIN_APPROVED_STATUS } from '../src/config/constants.js';
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
  cellfinIpnPayload,
  findRegistrationByEmail
} from './helpers.js';

describe('Payment reconciliation (CellFin IPN)', () => {
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

      mockValidation({ tr_amount: reg.payableAmount, trId: 'TR-IDEMPOTENT' });
      const payload = cellfinIpnPayload(reg, { token: 'TOKEN-IDEMPOTENT', trId: 'TR-BODY-IGNORED' });
      const first = await request(app).post('/api/payment/ipn').send(payload);
      expect(first.status).toBe(200);
      expect(first.text).toContain('IPN_OK');

      const paid = await Registration.findById(reg._id);
      expect(paid.paymentStatus).toBe('Paid');
      expect(paid.paidAmount).toBe(reg.payableAmount);
      expect(paid.gatewayToken).toBe('TOKEN-IDEMPOTENT');
      expect(paid.gatewayTrId).toBe('TR-IDEMPOTENT');
      expect(paid.ticketDisplayId).toMatch(/^(ALUM|STU)-/);

      const cap = await Capacity.findById('event');
      expect(cap.paidSlots).toBe(1);

      // Second delivery of the SAME correlationId/token — must not reprocess.
      mockValidation({ tr_amount: reg.payableAmount });
      await request(app).post('/api/payment/ipn').send(payload);

      // No duplicate ticket, no double-counted slot, no double enqueue.
      const reg2 = await Registration.findById(reg._id);
      expect(reg2.ticketDisplayId).toBe(paid.ticketDisplayId);
      expect(await Capacity.findById('event')).toMatchObject({ paidSlots: 1 });
      const queueItems = await EmailSmsQueueItem.find({ 'payload.registrationId': reg._id });
      expect(queueItems.length).toBe(2); // one email + one SMS channel item
      expect(queueItems.every((i) => i.type === 'ticket_confirmation')).toBe(true);
      expect(queueItems.some((i) => i.channel === 'email')).toBe(true);
      expect(queueItems.some((i) => i.channel === 'sms')).toBe(true);
    });

    test('settlement works through the bank-conventional /payment/CellFinIPN URL', async () => {
      await registerParticipant(app, alumniPayload({ email: 'alias@example.com' }));
      const reg = await findRegistrationByEmail('alias@example.com');

      mockValidation({ tr_amount: reg.payableAmount });
      const res = await request(app).post('/api/payment/CellFinIPN').send(cellfinIpnPayload(reg));
      expect(res.status).toBe(200);
      expect(res.text).toContain('IPN_OK');
      expect((await Registration.findById(reg._id)).paymentStatus).toBe('Paid');
    });
  });

  describe('authoritative status query — the body is never trusted', () => {
    test('IPN body claims APPROVED but the status query returns FAILED — registration becomes Failed, never Paid', async () => {
      mockValidation({ status: 'FAILED' });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      await request(app)
        .post('/api/payment/ipn')
        .send(cellfinIpnPayload(reg, { status: CELLFIN_APPROVED_STATUS }));

      const updated = await Registration.findById(reg._id);
      expect(updated.paymentStatus).toBe('Failed');
      expect(updated.gatewayToken).toBeNull();
      expect((await Capacity.findById('event')).paidSlots).toBe(0);
    });

    test('IPN body claims APPROVED but query returns an UNRECOGNIZED status — Verification Failed, never guessed', async () => {
      mockValidation({ status: 'BOGUS_GATEWAY_STATUS' });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      await request(app)
        .post('/api/payment/ipn')
        .send(cellfinIpnPayload(reg, { status: CELLFIN_APPROVED_STATUS }));

      const updated = await Registration.findById(reg._id);
      expect(updated.paymentStatus).toBe('Verification Failed');
      expect((await Capacity.findById('event')).paidSlots).toBe(0);
    });

    test('amount mismatch between tr_amount and payableAmount — Verification Failed, never Paid', async () => {
      mockValidation({ tr_amount: 1 });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      await request(app)
        .post('/api/payment/ipn')
        .send(cellfinIpnPayload(reg, { tr_amount: 1 }));

      const updated = await Registration.findById(reg._id);
      expect(updated.paymentStatus).toBe('Verification Failed');
      expect((await Capacity.findById('event')).paidSlots).toBe(0);
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
        cellfinIpnPayload(r1),
        cellfinIpnPayload(r2)
      ];

      const [res1, res2] = await Promise.all(
        payloads.map((p) => request(app).post('/api/payment/ipn').send(p))
      );
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const statuses = (
        await Registration.find({ _id: { $in: [r1._id, r2._id] } }).sort({ email: 1 })
      ).map((r) => r.paymentStatus);
      expect(statuses.sort()).toEqual(['Oversold-PendingReview', 'Paid']);

      const cap = await Capacity.findById('event');
      expect(cap.paidSlots).toBe(1);
    });
  });

  describe('admin resume-payment (recovery)', () => {
    test('resume generates a new correlationId on the same document, never a duplicate', async () => {
      mockValidation();
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');
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

      // IPN against the NEW correlationId settles the same record.
      mockValidation({ tr_amount: reg.payableAmount });
      const fresh = await Registration.findById(reg._id);
      await request(app).post('/api/payment/ipn').send(cellfinIpnPayload(fresh));
      expect((await Registration.findById(reg._id)).paymentStatus).toBe('Paid');
    });

    test('status-query network failure -> Network Error, then resume recovers', async () => {
      mockValidation({ error: new Error('timeout') });
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

      await request(app).post('/api/payment/ipn').send(cellfinIpnPayload(reg));
      expect((await Registration.findById(reg._id)).paymentStatus).toBe('Network Error');

      // The record is still recoverable via admin resume-payment.
      mockSessionInit();
      const resume = await request(app)
        .post(`/api/admin/registrations/${reg._id}/resume-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(resume.body.data.tran_id).not.toBe(reg.tran_id);
    });
  });

  describe('CellFin status map coverage', () => {
    test('every CELLFIN_STATUS_MAP entry produces its documented paymentStatus', async () => {
      let i = 0;
      for (const [cellfinStatus, expectedStatus] of Object.entries(CELLFIN_STATUS_MAP)) {
        const email = `map${i}@example.com`;
        const nid = String(1000000000 + i);
        await registerParticipant(app, alumniPayload({ email, nid }));
        const reg = await findRegistrationByEmail(email);

        mockValidation({ status: cellfinStatus, tr_amount: reg.payableAmount });
        await request(app)
          .post('/api/payment/ipn')
          .send(cellfinIpnPayload(reg, { status: cellfinStatus }));

        const updated = await Registration.findById(reg._id);
        expect(updated.paymentStatus).toBe(expectedStatus);
        i += 1;
      }
    });
  });

  describe('no auto-expiry', () => {
    test('a Pending record from an arbitrary time in the past is still visible to admins', async () => {
      await registerParticipant(app, alumniPayload());
      const reg = await findRegistrationByEmail('fahim@example.com');

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