'use strict';

const mongoose = require('mongoose');

/**
 * CartItem Sub-document Schema (Embedded)
 *
 * Design Decision — Embedding vs. Referencing:
 *   Items are embedded directly in the Cart document rather than stored in a
 *   separate "Items" collection. Rationale:
 *   1. A cart and its items are ALWAYS accessed together — embedding eliminates
 *      JOIN-equivalent $lookup operations, reducing latency.
 *   2. Cart items are not shared across carts — there is no reuse benefit from
 *      normalization here.
 *   3. MongoDB's 16MB document limit is not a concern for typical cart sizes
 *      (max ~100–200 items per cart is far under the limit).
 *
 * Trade-off: If a product's base price changes, existing cart items are NOT
 *   auto-updated. This is intentional — the price a user added to cart is the
 *   price they should see (price locking), consistent with real-world e-commerce
 *   behavior (e.g., Amazon, Flipkart).
 */
const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: [true, 'Product ID is required'],
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0.01, 'Price must be greater than 0'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be a whole number',
      },
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      lowercase: true, // Normalize to lowercase for consistent tier calculation
      maxlength: [100, 'Category cannot exceed 100 characters'],
    },
  },
  { _id: true } // Each item gets its own _id for targeted updates
);

/**
 * Cart Schema
 *
 * Design Decision — One Cart Per User:
 *   A user has exactly ONE active cart at any time. This is enforced via a
 *   unique index on `userId`. "Add to cart" operations upsert into this single
 *   document using findOneAndUpdate, which is atomic at the document level.
 *
 *   Soft-delete pattern: Instead of deleting carts after checkout, we could add
 *   a `status` field ('active' | 'checked_out'). For this assignment the cart
 *   persists and can be re-used after checkout (checkout is read-only summary).
 */
const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true, // One cart per user — enforced at DB level
      index: true,  // Fast lookup by userId (primary access pattern)
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Virtual: itemCount
 * Returns the total number of distinct product lines in the cart.
 */
cartSchema.virtual('itemCount').get(function () {
  return this.items.length;
});

/**
 * Virtual: subtotal
 * Computes raw cart value (before promotions) for convenience.
 */
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});

module.exports = mongoose.model('Cart', cartSchema);
