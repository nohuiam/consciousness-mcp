/**
 * HTTP Middleware Exports
 *
 * Provides production-quality middleware for MCP servers:
 * - Rate limiting with standard headers
 * - Request ID tracing
 * - Error handling with classification
 */

export { rateLimitMiddleware, createRateLimitMiddleware } from './rate-limit.js';
export type { RateLimitOptions } from './rate-limit.js';

export { requestIdMiddleware } from './request-id.js';

export {
  errorHandlerMiddleware,
  notFoundHandler,
  AppError
} from './error-handler.js';
