'use strict';

/**
 * Promotion Engine — Tiered Campaign Pricing
 *
 * Engineering Rationale:
 *   Promotions are calculated as a pure function of cart state (items + subtotal).
 *   This isolation means the engine can be:
 *     - Unit tested independently of Express/MongoDB
 *     - Swapped out / extended without touching controller logic
 *     - Documented clearly with explicit thresholds
 *
 * Tier Definitions:
 * ┌──────────┬────────────────────────────────────────────┬──────────────────────────────────────────┐
 * │ Tier     │ Condition                                  │ Benefits                                 │
 * ├──────────┼────────────────────────────────────────────┼──────────────────────────────────────────┤
 * │ None     │ subtotal < ₹500                            │ No discount, standard shipping           │
 * │ Bronze   │ subtotal ≥ ₹500                            │ 5% discount                              │
 * │ Silver   │ subtotal ≥ ₹1,000                          │ 10% discount + ₹50 shipping credit       │
 * │ Gold     │ subtotal ≥ ₹2,500                          │ 15% discount + free ship + 50 pts        │
 * │ Platinum │ subtotal ≥ ₹5,000 OR 5+ unique categories │ 20% discount + free ship + 100 pts       │
 * └──────────┴────────────────────────────────────────────┴──────────────────────────────────────────┘
 *
 * Note on Platinum's dual condition:
 *   A user with a highly diverse cart (5+ categories) even below ₹5000 gets Platinum.
 *   This rewards engagement/diversity and incentivises cross-category shopping —
 *   a common real-world campaign strategy used by platforms like Amazon and Myntra.
 */

const TIERS = [
  {
    name: 'Platinum',
    // Platinum is checked first because it has dual eligibility conditions
    check: (subtotal, uniqueCategoryCount) =>
      subtotal >= 5000 || uniqueCategoryCount >= 5,
    discountPercent: 20,
    shippingCredit: 50,  // Free shipping (standard shipping fee absorbed)
    rewardPoints: 100,
  },
  {
    name: 'Gold',
    check: (subtotal) => subtotal >= 2500,
    discountPercent: 15,
    shippingCredit: 50,
    rewardPoints: 50,
  },
  {
    name: 'Silver',
    check: (subtotal) => subtotal >= 1000,
    discountPercent: 10,
    shippingCredit: 50,
    rewardPoints: 0,
  },
  {
    name: 'Bronze',
    check: (subtotal) => subtotal >= 500,
    discountPercent: 5,
    shippingCredit: 0,
    rewardPoints: 0,
  },
];

const NO_TIER = {
  name: 'None',
  discountPercent: 0,
  shippingCredit: 0,
  rewardPoints: 0,
};

/**
 * Calculates the applicable promotion tier and checkout summary.
 *
 * @param {Array} items - Array of cart item objects { price, quantity, category }
 * @returns {Object} Full checkout summary including tier, discounts, and total
 */
const calculatePromotion = (items) => {
  if (!items || items.length === 0) {
    return {
      tier: 'None',
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      shippingCredit: 0,
      rewardPoints: 0,
      total: 0,
      uniqueCategories: [],
    };
  }

  // --- Core Metrics ---
  const subtotal = items.reduce(
    (sum, item) => sum + parseFloat((item.price * item.quantity).toFixed(2)),
    0
  );
  const roundedSubtotal = parseFloat(subtotal.toFixed(2));

  // Unique categories drive Platinum's diversity condition
  const uniqueCategories = [...new Set(items.map((i) => i.category.toLowerCase()))];
  const uniqueCategoryCount = uniqueCategories.length;

  // --- Tier Resolution (highest tier wins; checked top-down) ---
  const matchedTier = TIERS.find((tier) => tier.check(roundedSubtotal, uniqueCategoryCount)) || NO_TIER;

  // --- Discount Calculation ---
  const discountAmount = parseFloat(
    ((matchedTier.discountPercent / 100) * roundedSubtotal).toFixed(2)
  );
  const total = parseFloat(
    (roundedSubtotal - discountAmount - matchedTier.shippingCredit).toFixed(2)
  );

  return {
    tier: matchedTier.name,
    subtotal: roundedSubtotal,
    discountPercent: matchedTier.discountPercent,
    discountAmount,
    shippingCredit: matchedTier.shippingCredit,
    rewardPoints: matchedTier.rewardPoints,
    total: Math.max(0, total), // Total can never be negative
    uniqueCategories,
  };
};

module.exports = { calculatePromotion, TIERS };
