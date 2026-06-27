'use strict';

const express = require('express');
const { globalLimiter } = require('./middlewares/rateLimiter');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const cartRoutes = require('./routes/cartRoutes');

const app = express();

/* ─────────────────────────────────────────────────────────────────────────────
   GLOBAL MIDDLEWARE
   ───────────────────────────────────────────────────────────────────────────── */

// Parse incoming JSON payloads
app.use(express.json({ limit: '10kb' })); // Reject payloads > 10KB

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: false }));

// Feature X: Global rate limiter — 100 requests / 15 minutes per IP
app.use(globalLimiter);

/* ─────────────────────────────────────────────────────────────────────────────
   HEALTH CHECK
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * GET /health
 * Simple liveness probe. Used by orchestration tools (Docker, k8s) to verify
 * the service is running and accepting requests.
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    service: 'shopping-cart-engine',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   API ROUTES
   ───────────────────────────────────────────────────────────────────────────── */

app.use('/api', cartRoutes);

/* ─────────────────────────────────────────────────────────────────────────────
   ERROR HANDLING (must be last)
   ───────────────────────────────────────────────────────────────────────────── */

// 404 handler — catches all undefined routes
app.use(notFound);

// Central error handler — processes all next(err) calls
app.use(errorHandler);

module.exports = app;
