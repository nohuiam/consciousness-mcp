/**
 * Jest test setup for consciousness-mcp
 */

import { jest } from '@jest/globals';

// Increase timeout for database operations
jest.setTimeout(10000);

// Mock console.error to avoid noise in tests (servers log to stderr)
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});
