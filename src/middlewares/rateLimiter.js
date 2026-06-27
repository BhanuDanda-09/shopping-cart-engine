'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Feature X — Rate Limiting
 *
 * What was added:
 *   Two-tier rate limiting using `express-rate-limit`:
 *     1. Global limiter:   100 requests / 15 minutes per IP (all routes)
 *     2. Checkout limiter:  20 requests / 15 minutes per IP (checkout endpoint only)
 *
 * Why it was added (Engineering Rationale):
 *   1. **Abuse Prevention**: The checkout endpoint computes promotional discounts.
 *      Without rate limiting, bots could probe the engine to reverse-engineer tier
 *      thresholds or abuse trial-and-error discount discovery.
 *   2. **MongoDB Protection**: Unbounded traffic can exhaust the connection pool
 *      and crash the service. Rate limiting is the first line of defense at the
 *      application layer, before load even reaches the database.
 *   3. **Production Standard**: Rate limiting is expected in any public-facing API
 *      (OWASP API Security Top 10 — API4:2023 Unrestricted Resource Consumption).
 *   4. **Graceful Degradation**: The limiter returns a structured JSON 429 response
 *      so clients can handle it programmatically rather than receiving an HTML error.
 *
 * Configuration choices:
 *   - `standardHeaders: true`  — sends RateLimit-* headers (RFC 6585 / draft-7)
 *   - `legacyHeaders: false`   — removes deprecated X-RateLimit-* headers
 *   - Window of 15 minutes is a common industry standard for token-bucket windows.
 */

/**
 * Global rate limiter — applied to ALL routes in app.js
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Checkout-specific stricter rate limiter
 * Applied only to GET /api/cart/:userId/checkout
 */
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: 'Too many checkout requests from this IP. Please slow down and try again after 15 minutes.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalLimiter, checkoutLimiter };
