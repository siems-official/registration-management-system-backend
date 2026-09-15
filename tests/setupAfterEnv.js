import { jest } from '@jest/globals';
import { mockGatewayClient } from './mockGateway.js';

jest.setTimeout(90000);

// cellfinService does `import axios from 'axios'` then builds
// `const client = axios.create(...)` once at module load. Under
// --experimental-vm-modules jest.mock doesn't intercept CJS-to-ESM
// imports; jest.unstable_mockModule does.
jest.unstable_mockModule('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockGatewayClient),
    isAxiosError: jest.fn(() => false)
  }
}));