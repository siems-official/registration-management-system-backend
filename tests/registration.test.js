import { jest } from '@jest/globals';
import request from 'supertest';
import Registration from '../src/models/Registration.js';
import RegistrationSettings from '../src/models/RegistrationSettings.js';
import Capacity from '../src/models/Capacity.js';
import {
  setupTestDb,
  teardownTestDb,
  resetDb,
  seedBaseSettings,
  createAdmin,
  getSessionToken,
  buildApp,
  alumniPayload,
  studentPayload,
  registerParticipant,
  mockSessionInit,
  mockSessionFailure,
  makePng
} from './helpers.js';

async function postWithPhoto(app, payload, { buffer, contentType, filename } = {}) {
  let pending = request(app).post('/api/registrations');
  for (const [key, value] of Object.entries(payload)) {
    pending = pending.field(key, String(value));
  }
  if (buffer != null) {
    pending = pending.attach('photo', buffer, { filename, contentType });
  }
  return pending;
}

describe('Public registration', () => {
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

  describe('participant-type-specific field sets', () => {
    test('Alumni registration with alumni-only fields succeeds', async () => {
      const res = await registerParticipant(app, alumniPayload());
      expect(res.status).toBe(201);
      expect(res.body.data.payableAmount).toBe(3000); // 2000 + 1 * 1000
      expect(res.body.data.gatewayUrl).toBe('https://gateway.test/pay');
      expect(res.body.data.tran_id).toMatch(/^tran_[0-9a-f]+$/);
    });

    test('Current Student registration succeeds with base fields', async () => {
      const res = await registerParticipant(app, studentPayload());
      expect(res.status).toBe(201);
      expect(res.body.data.payableAmount).toBe(1000);
    });

    test('Current Student row with profession/year fields is rejected (conditional per-type)', async () => {
      const res = await registerParticipant(app, studentPayload({ profession: 'Engineer' }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('Alumni row with number of accompany above 20 is rejected', async () => {
      const res = await registerParticipant(app, alumniPayload({ numberOfAccompany: 21 }));
      expect(res.status).toBe(400);
    });

    test('Unknown fields are rejected', async () => {
      const res = await registerParticipant(app, alumniPayload({ hackField: 'nope' }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('duplicate detection (email AND nid must both match)', () => {
    test('same email + same nid is rejected', async () => {
      await registerParticipant(app, alumniPayload());
      const second = await registerParticipant(app, alumniPayload({ email: 'fahim@example.com' }));
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('DUPLICATE_REGISTRATION');
    });

    test('same email but different nid is accepted', async () => {
      await registerParticipant(app, alumniPayload());
      const res = await registerParticipant(
        app,
        alumniPayload({ nid: '9999999999', name: 'Other Fahim' })
      );
      expect(res.status).toBe(201);
    });

    test('same nid but different email is accepted', async () => {
      await registerParticipant(app, alumniPayload());
      const res = await registerParticipant(
        app,
        alumniPayload({ email: 'other@example.com', name: 'Fahim 2' })
      );
      expect(res.status).toBe(201);
    });
  });

  describe('photo upload validation', () => {
    test('valid PNG accepted', async () => {
      const res = await registerParticipant(app, alumniPayload());
      expect(res.status).toBe(201);
    });

    test('wrong MIME type rejected', async () => {
      const pending = await postWithPhoto(app, alumniPayload(), {
        buffer: Buffer.from('this is not an image'),
        contentType: 'text/plain',
        filename: 'note.txt'
      });
      const res = await pending;
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PHOTO_TYPE');
    });

    test('oversized photo rejected', async () => {
      const big = Buffer.alloc(2 * 1024 * 1024 + 1024, 7);
      const pending = await postWithPhoto(app, alumniPayload(), {
        buffer: big,
        contentType: 'image/png',
        filename: 'big.png'
      });
      const res = await pending;
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PHOTO_TOO_LARGE');
    });

    test('undecodable dimensions rejected (1x1 png)', async () => {
      const tiny = makePng(1, 1);
      const pending = await postWithPhoto(app, alumniPayload(), {
        buffer: tiny,
        contentType: 'image/png',
        filename: 'tiny.png'
      });
      const res = await pending;
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PHOTO_DIMENSIONS');
    });

    test('missing photo rejected', async () => {
      const res = await postWithPhoto(app, alumniPayload());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PHOTO_REQUIRED');
    });
  });

  describe('deadline enforcement (server clock)', () => {
    test('registration rejected after the configured deadline', async () => {
      await RegistrationSettings.findByIdAndUpdate('event', {
        registrationDeadline: new Date(Date.now() - 1000)
      });
      const res = await registerParticipant(app, alumniPayload());
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
    });
  });

  describe('gateway-init failure resilience (Part-1 fix #3)', () => {
    test('Pending record persists after session-init failure and resume-payment recovers it', async () => {
      jest.restoreAllMocks();
      mockSessionFailure();

      const res = await registerParticipant(app, alumniPayload());
      expect(res.status).toBe(502);
      expect(res.body.error.code).toBe('GATEWAY_ERROR');
      const regId = res.body.error.details.registrationId;
      const originalTranId = res.body.error.details.tranId;
      expect(regId).toBeTruthy();

      // The Pending record persists (no rollback, no expiry).
      const persisted = await Registration.findById(regId);
      expect(persisted).not.toBeNull();
      expect(persisted.paymentStatus).toBe('Pending');
      expect(persisted.tran_id).toBe(originalTranId);

      // Admin resume-payment now succeeds against a recovered gateway.
      mockSessionInit();
      const resume = await request(app)
        .post(`/api/admin/registrations/${regId}/resume-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(resume.body.data.gatewayUrl).toBe('https://gateway.test/pay');
      expect(resume.body.data.tran_id).not.toBe(originalTranId);

      // Still exactly one document for that registration.
      const after = await Registration.findById(regId);
      expect(after.tran_id).toBe(resume.body.data.tran_id);
      expect(await Registration.countDocuments({ _id: regId })).toBe(1);
    });
  });

  describe('status polling endpoint', () => {
    test('returns current payment status', async () => {
      const res = await registerParticipant(app, alumniPayload());
      const id = res.body.data.registrationId;
      const status = await request(app).get(`/api/registrations/${id}/status`).expect(200);
      expect(status.body.data.paymentStatus).toBe('Processing');
      expect(status.body.data.payableAmount).toBe(3000);
    });
  });

  describe('soft capacity check (UX only, not authoritative)', () => {
    test('registration creation rejected early when event is full', async () => {
      await Capacity.findByIdAndUpdate('event', { maxCapacity: 5, paidSlots: 5 });
      const res = await registerParticipant(app, alumniPayload());
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EVENT_FULL');
    });
  });
});