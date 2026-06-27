'use strict';

const express = require('express');
const router = express.Router();

const {
  createUser,
  getUser,
  getCart,
  upsertCartItem,
  removeCartItem,
  clearCart,
  checkoutCart,
} = require('../controllers/cartController');

const {
  validateUserId,
  validateCreateUser,
  validateUpsertItem,
} = require('../middlewares/validate');

const { checkoutLimiter } = require('../middlewares/rateLimiter');

/* ─────────────────────────────────────────────────────────────────────────────
   USER ROUTES
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * @route   POST /api/users
 * @desc    Create a new user (tenant registration)
 * @access  Public
 * @body    { name: string, email: string }
 */
router.post('/users', validateCreateUser, createUser);

/**
 * @route   GET /api/users/:userId
 * @desc    Get user profile
 * @access  Public
 */
router.get('/users/:userId', validateUserId, getUser);

/* ─────────────────────────────────────────────────────────────────────────────
   CART ROUTES
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * @route   GET /api/cart/:userId
 * @desc    Get the current cart state for a user
 * @access  Public
 */
router.get('/cart/:userId', validateUserId, getCart);

/**
 * @route   POST /api/cart/:userId/items
 * @desc    Add, update, or remove an item in the cart (upsert)
 *          - quantity > 0 → add or update
 *          - quantity = 0 → remove item
 * @access  Public
 * @body    { productId, name, price, quantity, category }
 */
router.post('/cart/:userId/items', validateUserId, validateUpsertItem, upsertCartItem);

/**
 * @route   DELETE /api/cart/:userId/items/:productId
 * @desc    Explicitly remove a specific item from the cart
 * @access  Public
 */
router.delete('/cart/:userId/items/:productId', validateUserId, removeCartItem);

/**
 * @route   DELETE /api/cart/:userId
 * @desc    Clear all items from a user's cart
 * @access  Public
 */
router.delete('/cart/:userId', validateUserId, clearCart);

/**
 * @route   GET /api/cart/:userId/checkout
 * @desc    Get checkout summary with tiered promotional pricing
 * @access  Public
 * @middleware checkoutLimiter — stricter rate limit (20 req/15 min)
 */
router.get('/cart/:userId/checkout', checkoutLimiter, validateUserId, checkoutCart);

module.exports = router;
