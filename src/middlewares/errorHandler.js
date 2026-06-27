'use strict';

/**
 * Central Error Handler Middleware
 *
 * Must be registered LAST in app.js (after all routes).
 * Express identifies a 4-argument function as an error handler.
 *
 * Handles:
 *   - Mongoose ValidationError  → 400
 *   - Mongoose CastError        → 400 (malformed ObjectId)
 *   - Mongoose duplicate key    → 409
 *   - Generic errors            → 500
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = null;

  // --- Mongoose: Document validation failed ---
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Database validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // --- Mongoose: Malformed ObjectId (CastError) ---
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field '${err.path}': ${err.value}`;
  }

  // --- MongoDB: Duplicate key error (e.g., duplicate email) ---
  if (err.code === 11000) {
    statusCode = 409;
    const duplicateField = Object.keys(err.keyValue || {})[0] || 'field';
    message = `A record with this ${duplicateField} already exists`;
  }

  // Log full error in development for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${err.name || 'Error'}: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

/**
 * 404 Handler — catches requests to undefined routes.
 * Must be registered BEFORE errorHandler but AFTER all routes.
 */
const notFound = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

module.exports = { errorHandler, notFound };
