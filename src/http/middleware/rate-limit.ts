/**
 * Rate Limiting Middleware
 *
 * Protects HTTP endpoints from abuse by limiting requests per IP.
 * Implements standard X-RateLimit-* headers per MCP quality standards.
 *
 * Defaults:
 *   - 100 requests per minute per IP
 *   - Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 *   - 429 response when exceeded with Retry-After header
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimitOptions {
  windowMs?: number;      // Time window in milliseconds (default: 60000 = 1 minute)
  maxRequests?: number;   // Max requests per window (default: 100)
  skipPaths?: string[];   // Paths to skip rate limiting (default: ['/health'])
}

const DEFAULT_OPTIONS: Required<RateLimitOptions> = {
  windowMs: 60 * 1000,    // 1 minute
  maxRequests: 100,
  skipPaths: ['/health', '/health/ready', '/health/detailed']
};

// Store for rate limit entries (in-memory, per-process)
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
function startCleanup(windowMs: number): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, windowMs);
}

let cleanupStarted = false;

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(options: RateLimitOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Start cleanup if not already started
  if (!cleanupStarted) {
    startCleanup(opts.windowMs);
    cleanupStarted = true;
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting for certain paths
    if (opts.skipPaths.some(path => req.path === path || req.path.startsWith(path))) {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Get or create entry for this IP
    let entry = rateLimitStore.get(ip);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + opts.windowMs };
      rateLimitStore.set(ip, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', opts.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, opts.maxRequests - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

    // Check if rate limit exceeded
    if (entry.count > opts.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
        retryable: true
      });
      return;
    }

    next();
  };
}

/**
 * Default rate limit middleware with standard settings
 */
export const rateLimitMiddleware = createRateLimitMiddleware();
