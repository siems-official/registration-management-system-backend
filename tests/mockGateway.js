import { jest } from '@jest/globals';

/**
 * The live cellfinService builds `axios.create()` once at module load. By
 * making axios.create return this client in setupAfterEnv, the REAL service
 * logic (correlationId usage, sha512Password, assertConfigured, CellfinError
 * wrapping, the isMockMode branches) all run while the HTTP boundary stays
 * stubbed.
 *
 * `armGateway()` re-applies the dispatcher after `jest.restoreAllMocks()` has
 * been called, since restore wipes jest.fn() implementations.
 */
const STATE = {
  sessionUrl: 'https://gateway.test/pay',
  tokenError: null,
  status: 'APPROVED',
  tr_amount: undefined,
  trId: undefined,
  statusError: null
};

async function dispatcher(endpointUrl, payload) {
  const url = String(endpointUrl);
  if (url.includes('/cfpg/v1/token')) {
    if (STATE.tokenError) throw STATE.tokenError;
    return {
      data: {
        status: 'SUCCESS',
        correlationId: payload?.correlationId,
        token: `mock-token-${payload?.correlationId ?? 'x'}`,
        redirectUrl: STATE.sessionUrl,
        time: '11/11/2020 04:30 PM',
        version: '1',
        type: 'PG_TOKEN'
      }
    };
  }
  if (url.includes('/cfpg/v1/status')) {
    if (STATE.statusError) throw STATE.statusError;
    return {
      data: {
        correlationId: payload?.correlationId,
        token: payload?.token,
        trId: STATE.trId ?? `mock-tr-${payload?.correlationId ?? 'x'}`,
        status: STATE.status,
        date_time: '20/11/2020 04:29 PM',
        tr_amount: STATE.tr_amount,
        cr_amount: STATE.tr_amount,
        source_of_fund: 'CELLFIN'
      }
    };
  }
  return { data: {} };
}

export const mockGatewayClient = {
  post: jest.fn(dispatcher)
};

export function armGateway() {
  mockGatewayClient.post.mockImplementation(dispatcher);
}

/** Arm the token-creation endpoint (returns a canned redirect URL). */
export function mockSessionInit({ url = 'https://gateway.test/pay', error = null } = {}) {
  STATE.sessionUrl = url;
  STATE.tokenError = error;
  STATE.status = 'APPROVED';
  STATE.tr_amount = undefined;
  STATE.trId = undefined;
  STATE.statusError = null;
  armGateway();
  return mockGatewayClient.post;
}

export function mockSessionFailure({ error = new Error('gateway down') } = {}) {
  return mockSessionInit({ error });
}

/**
 * Arm the authoritative status-query endpoint. `status` is the CellFin status
 * the QUERIED transaction reports (the source of truth for reconciliation).
 */
export function mockValidation({
  status = 'APPROVED',
  tr_amount,
  trId,
  error = null
} = {}) {
  STATE.sessionUrl = 'https://gateway.test/pay';
  STATE.tokenError = null;
  STATE.status = status;
  STATE.tr_amount = tr_amount;
  STATE.trId = trId ?? undefined;
  STATE.statusError = error;
  armGateway();
  return mockGatewayClient.post;
}