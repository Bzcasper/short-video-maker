// Test setup file for Vitest
import { afterEach, beforeEach, vi, afterAll, beforeAll } from 'vitest';

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
  
  // Set up any global test environment here
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  // Clean up after each test
  vi.resetAllMocks();
});

// Global test teardown
afterAll(() => {
  // Clean up any global resources
});

// Mock console methods to reduce noise in test output
const originalConsole = { ...console };

beforeAll(() => {
  // Only mock console methods in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.info = vi.fn();
    console.debug = vi.fn();
  }
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
});

// Global test utilities and helpers
globalThis.testUtils = {
  // Add any global test utilities here
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Export any test utilities that might be needed
export const testConfig = {
  timeout: 30000,
  retries: 2,
};

// Type definitions for global test utilities
declare global {
  // eslint-disable-next-line no-var
  var testUtils: {
    waitFor: (ms: number) => Promise<void>;
  };
}