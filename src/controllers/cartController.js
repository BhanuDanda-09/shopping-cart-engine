'use strict';

const User = require('../models/User');
const Cart = require('../models/Cart');
const { calculatePromotion } = require('../utils/promotionEngine');

/* ─────────────────────────────────────────────────────────────────────────────
   USER CONTROLLERS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/users
 * Creates a new user (tenant). A cart is NOT created here — it is lazily
 * created on first item addition, which avoids orphaned empty cart documents.
 */
const createUser = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.create({ name, email });

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:userId
 * Retrieves user profile. Useful for client-side verification before cart ops.
 */
const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   CART CONTROLLERS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/cart/:userId
 * Returns the current state of a user's cart.
 * Returns an empty cart structure (not 404) if cart doesn't exist yet,
 * so clients don't need to handle 404 on first visit.
 */
const getCart = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      // Return an empty cart representation — cart is lazily initialized
      return res.status(200).json({
        success: true,
        data: {
          userId,
          items: [],
          itemCount: 0,
          subtotal: 0,
          message: 'Cart is empty',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        cartId: cart._id,
        userId: cart.userId,
        items: cart.items,
        itemCount: cart.items.length,
        subtotal: cart.items.reduce((s, i) => s + i.price * i.quantity, 0),
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/cart/:userId/items
 *
 * Item Ingestion Endpoint — the core write operation.
 *
 * Upsert Logic:
 *   1. If productId is NEW  → push a new item into the items array
 *   2. If productId EXISTS  → update quantity (and optionally name/price/category)
 *   3. If quantity === 0    → remove the item from the cart
 *
 * Atomicity:
 *   Uses findOneAndUpdate with MongoDB array operators ($push, $set, $pull)
 *   where possible. For quantity-zero removal and update, we load the document
 *   and save — acceptable for single-user cart operations where concurrent
 *   writes to the same cart are not expected (each user owns their cart).
 */
const upsertCartItem = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { productId, name, price, quantity, category } = req.body;

    // Verify user exists before operating on their cart
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find or lazily create the cart for this user
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Find existing item by productId
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId === productId
    );

    let action;

    if (quantity === 0) {
      // --- REMOVE: quantity=0 signals explicit removal ---
      if (existingItemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: `Product '${productId}' is not in the cart`,
        });
      }
      cart.items.splice(existingItemIndex, 1);
      action = 'removed';
    } else if (existingItemIndex === -1) {
      // --- ADD: new product ---
      cart.items.push({ productId, name, price: parseFloat(price), quantity: parseInt(quantity), category });
      action = 'added';
    } else {
      // --- UPDATE: existing product — update quantity and mutable fields ---
      cart.items[existingItemIndex].quantity = parseInt(quantity);
      cart.items[existingItemIndex].price = parseFloat(price);
      cart.items[existingItemIndex].name = name;
      cart.items[existingItemIndex].category = category;
      action = 'updated';
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: `Item '${productId}' ${action} successfully`,
      data: {
        cartId: cart._id,
        userId: cart.userId,
        action,
        affectedProductId: productId,
        items: cart.items,
        itemCount: cart.items.length,
        subtotal: parseFloat(
          cart.items.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)
        ),
        updatedAt: cart.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/cart/:userId/items/:productId
 * Explicit removal endpoint (alternative to quantity=0 in upsert).
 * Provided for RESTful completeness — DELETE semantics are clearer for removal.
 */
const removeCartItem = async (req, res, next) => {
  try {
    const { userId, productId } = req.params;

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart is empty' });
    }

    const itemIndex = cart.items.findIndex((i) => i.productId === productId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Product '${productId}' not found in cart`,
      });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    return res.status(200).json({
      success: true,
      message: `Product '${productId}' removed from cart`,
      data: {
        cartId: cart._id,
        items: cart.items,
        itemCount: cart.items.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/cart/:userId
 * Clears all items from the cart (does not delete the cart document itself).
 */
const clearCart = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
      { new: true }
    );

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      data: { cartId: cart._id, items: [], itemCount: 0 },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/cart/:userId/checkout
 *
 * Dynamic Campaign Pricing Checkout
 *
 * Computes a full checkout summary by:
 *   1. Loading the user's cart
 *   2. Passing items to the promotion engine (pure function)
 *   3. Returning a structured breakdown of subtotal, tier, discounts, and total
 *
 * This endpoint is READ-ONLY — it does not modify the cart or create an order.
 * In a full system, a subsequent POST /orders endpoint would consume this
 * payload to create the order record.
 */
const checkoutCart = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const userExists = await User.findById(userId).lean();
    if (!userExists) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot checkout an empty cart',
      });
    }

    // Delegate all pricing math to the promotion engine
    const promotionResult = calculatePromotion(cart.items);

    return res.status(200).json({
      success: true,
      message: `Checkout summary computed. Tier: ${promotionResult.tier}`,
      data: {
        userId,
        user: {
          name: userExists.name,
          email: userExists.email,
        },
        items: cart.items,
        summary: {
          itemCount: cart.items.length,
          subtotal: promotionResult.subtotal,
          tier: promotionResult.tier,
          discountPercent: promotionResult.discountPercent,
          discountAmount: promotionResult.discountAmount,
          shippingCredit: promotionResult.shippingCredit,
          rewardPoints: promotionResult.rewardPoints,
          total: promotionResult.total,
          uniqueCategories: promotionResult.uniqueCategories,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUser,
  getUser,
  getCart,
  upsertCartItem,
  removeCartItem,
  clearCart,
  checkoutCart,
};
