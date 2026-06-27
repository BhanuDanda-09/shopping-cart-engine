'use strict';

const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Middleware: runValidation
 * Collects all validation errors from express-validator and returns a structured
 * 400 Bad Request response. Passes control to the next middleware only if valid.
 */
const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Please check the errors and try again.',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
};

/**
 * Validator: userId route param
 * Ensures :userId is a valid MongoDB ObjectId before the controller runs.
 * This prevents Mongoose from throwing CastErrors on malformed IDs.
 */
const validateUserId = [
  param('userId')
    .trim()
    .notEmpty()
    .withMessage('User ID is required')
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage('User ID must be a valid MongoDB ObjectId'),
  runValidation,
];

/**
 * Validator: POST /users — Create user body
 */
const validateCreateUser = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  runValidation,
];

/**
 * Validator: POST /cart/:userId/items — Item ingestion
 *
 * Rules:
 *  - productId: required, non-empty string
 *  - name: required, max 200 chars
 *  - price: required, positive number
 *  - quantity: required, integer ≥ 0 (0 triggers removal)
 *  - category: required, alphabetic-ish string
 */
const validateUpsertItem = [
  body('productId')
    .trim()
    .notEmpty()
    .withMessage('productId is required'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 200 })
    .withMessage('Product name cannot exceed 200 characters'),
  body('price')
    .notEmpty()
    .withMessage('Price is required')
    .isFloat({ gt: 0 })
    .withMessage('Price must be a positive number'),
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt({ min: 0 })
    .withMessage('Quantity must be a non-negative integer (0 removes the item)'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required')
    .isLength({ max: 100 })
    .withMessage('Category cannot exceed 100 characters'),
  runValidation,
];

module.exports = {
  validateUserId,
  validateCreateUser,
  validateUpsertItem,
  runValidation,
};
