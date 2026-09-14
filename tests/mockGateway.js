import { jest } from '@jest/globals';

/**
 * The live sslcommerzService builds `axios.create()` once at module load. By
 * making axios.create return this client in setupAfterEnv, the REAL service
 * logic (tran_id generation, assertConfigured, SslcommerzError wrapping, the
 * isMockMode branches) all run while the HTTP boundary stays stubbed.
 *
 * `armGateway()` re-applies the dispatcher after `jest.restoreAllMocks()` has
 * been called, since restore wipes jest.fn() implementations.
 */
const STATE = {
  sessionUrl: 'https://gateway.test/pay',
  sessionError: null,
  validationStatus: 'VALID',
  validationAmount: undefined,
  validationCurrency: 'BDT',
  validationError: null
};

async function dispatcher(endpointUrl, params) {
  const url = String(endpointUrl);
  if (url.includes('gwprocess')) {
    if (STATE.sessionError) throw STATE.sessionError;
    return {
      data: {
        status: 'SUCCESS',
        sessionkey: `mock_${params?.get?.('tran_id') ?? 'x'}`,
        GatewayPageURL: STATE.sessionUrl
      }
    };
  }
  if (url.includes('validationserverAPI')) {
    if (STATE.validationError) throw STATE.validationError;
    return {
      data: {
        status: STATE.validationStatus,
        val_id: params?.get?.('val_id'),
        tran_id: params?.get?.('tran_id'),
        amount: STATE.validationAmount,
        currency: STATE.validationCurrency
      }
    };
  }
  return { data: { status: 'success', ref: 'mock_refund' } };
}

export const mockGatewayClient = {
  post: jest.fn(dispatcher)
};

export function armGateway() {
  mockGatewayClient.post.mockImplementation(dispatcher);
}

export function mockSessionInit({ url = 'https://gateway.test/pay', error = null } = {}) {
  STATE.sessionUrl = url;
  STATE.sessionError = error;
  STATE.validationStatus = 'VALID';
  STATE.validationAmount = undefined;
  STATE.validationCurrency = 'BDT';
  STATE.validationError = null;
  armGateway();
  return mockGatewayClient.post;
}

export function mockValidation({ amount, currency = 'BDT', status = 'VALID', error = null } = {}) {
  STATE.validationStatus = status;
  STATE.validationAmount = amount;
  STATE.validationCurrency = currency;
  STATE.validationError = error;
  armGateway();
  return mockGatewayClient.post;
}

export function mockSessionFailure({ error = new Error('gateway down') } = {}) {
  return mockSessionInit({ error });
}