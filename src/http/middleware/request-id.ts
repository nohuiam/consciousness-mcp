/**
 * Request ID Middleware
 *
 * Adds request ID for distributed tracing per MCP quality standards.
 * Uses X-Request-ID header if provided, otherwise generates a new UUID.
 *
 * Features:
 *   - Generates UUID v4 request IDs
 *   - Passes through existing X-Request-ID header
 *   - Attaches requestId to req object for logging
 *   - Sets X-Request-ID header on response
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Request ID middleware
 * Adds a unique request ID to each request for tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing X-Request-ID header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Attach to request object for use in handlers and logging
  req.requestId = requestId;

  // Set response header
  res.setHeader('X-Request-ID', requestId);

  next();
}
