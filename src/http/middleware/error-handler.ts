/**
 * Error Handler Middleware
 *
 * Provides consistent error response format per MCP quality standards.
 *
 * Features:
 *   - Standard error response format with retryable flag
 *   - Request ID included in all error responses
 *   - HTTP status code classification
 *   - Prevents internal error details from leaking
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Custom application error class
 */
export class AppError extends Error {
  public statusCode: number;
  public isRetryable: boolean;
  public code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isRetryable: boolean = false,
    code?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.code = code;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create a 400 Bad Request error
   */
  static badRequest(message: string, code?: string): AppError {
    return new AppError(message, 400, false, code || 'BAD_REQUEST');
  }

  /**
   * Create a 401 Unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, false, 'UNAUTHORIZED');
  }

  /**
   * Create a 403 Forbidden error
   */
  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, false, 'FORBIDDEN');
  }

  /**
   * Create a 404 Not Found error
   */
  static notFound(message: string = 'Not Found'): AppError {
    return new AppError(message, 404, false, 'NOT_FOUND');
  }

  /**
   * Create a 409 Conflict error
   */
  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, false, code || 'CONFLICT');
  }

  /**
   * Create a 500 Internal Server Error (retryable)
   */
  static internal(message: string = 'Internal Server Error'): AppError {
    return new AppError(message, 500, true, 'INTERNAL_ERROR');
  }

  /**
   * Create a 503 Service Unavailable error (retryable)
   */
  static serviceUnavailable(message: string = 'Service Unavailable'): AppError {
    return new AppError(message, 503, true, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: string;
  code?: string;
  retryable: boolean;
  requestId: string;
  timestamp: string;
}

/**
 * Error handler middleware
 * Must be added AFTER all routes
 */
export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  // Log error with request ID for tracing
  console.error(`[${requestId}] Error:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Build error response
  const response: ErrorResponse = {
    error: '',
    retryable: false,
    requestId,
    timestamp: new Date().toISOString()
  };

  if (err instanceof AppError) {
    // Known application error
    response.error = err.message;
    response.code = err.code;
    response.retryable = err.isRetryable;
    res.status(err.statusCode).json(response);
  } else {
    // Unknown error - don't expose internals
    response.error = 'Internal Server Error';
    response.code = 'INTERNAL_ERROR';
    response.retryable = true; // Unknown errors might be transient
    res.status(500).json(response);
  }
}

/**
 * 404 handler for unmatched routes
 * Add BEFORE error handler middleware
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.requestId || 'unknown';
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
    retryable: false,
    requestId,
    timestamp: new Date().toISOString()
  });
}
