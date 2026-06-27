# DESIGN.md — Architecture & Engineering Decisions

## Overview

This document explains the key architectural decisions, schema choices, validation strategy, edge cases considered, and trade-offs made during the development of the Shopping Cart Engine.

---

## 1. Directory Architecture & Separation of Concerns

### Chosen Pattern: Controller-Service-Model (CSM)

```
Routes → Middleware → Controllers → Models/Utils
```

**Why:**
- **Routes** declare only the HTTP method, path, and middleware chain — zero logic.
- **Controllers** own business logic and orchestrate models. No raw MongoDB queries leak into routes.
- **Models** define schema shape and DB-level constraints (indexes, uniqueness).
- **Utils** (promotionEngine) are pure functions — no side effects, easily testable.

**Trade-off considered:** A full Service layer between controllers and models would improve testability further (controllers would call service functions, not models directly). For this microservice scope, a dedicated service layer adds indirection without significant benefit. If this were to grow into a checkout, payments, and inventory system, a service layer would be introduced.

---

## 2. Schema Design

### User Schema

```js
{ name, email (unique), createdAt, updatedAt }
```

**Decisions:**
- `email` has a unique index enforced at the DB level (`unique: true`), not just the application layer. This prevents race conditions where two concurrent requests pass app-level validation but hit the DB simultaneously.
- `versionKey: false` removes the `__v` field from all documents — reduces document size and noise in API responses.

### Cart Schema

```js
{
  userId: ObjectId (unique, ref User),
  items: [embedded CartItem],
  createdAt, updatedAt
}
```

**Embedding vs. Referencing items:**

| Factor | Embedding (chosen) | Referencing |
|--------|-------------------|-------------|
| Access pattern | Items always fetched with cart | Would require $lookup |
| Atomicity | Single document update is atomic | Multi-document requires transactions |
| Item sharing | Cart items are not shared | Only relevant if shared |
| Document size | ~16MB limit, typical cart << limit | No size concern |

**Verdict:** Embedding is the correct choice here. Cart items are always read and written alongside the cart. There is no use case for reading items in isolation.

**Price Locking:**
When an item is added, its `price` is embedded in the cart document. If the product catalog price changes later, the cart price does NOT auto-update. This is intentional (price locking) — consistent with real e-commerce behavior. Users expect to pay what they saw when adding.

---

## 3. Multi-Tenant Isolation Strategy

**Mechanism:** `userId` (MongoDB ObjectId) is passed as a URL route parameter. Every DB query is scoped with `{ userId }`:
```js
Cart.findOne({ userId })   // scoped — user A cannot see user B's cart
```

**Index:** A compound index on `Cart.userId` makes these queries O(log n) regardless of total cart count.

**Lazy Cart Creation:** The Cart document is not created at user registration. It is created on the first item insertion. Rationale:
- Avoids orphaned empty cart documents for users who register but never shop.
- The `GET /cart/:userId` endpoint gracefully returns an empty cart structure (not 404) if no cart exists, so clients don't need to handle the absence.

**Auth Note:** In production, `userId` would be extracted from a verified JWT (issued by an Auth Service), not passed as a URL param by the client. This is the standard microservice pattern.

---

## 4. Item Ingestion Logic

The `POST /cart/:userId/items` endpoint implements a **upsert + soft-remove** pattern:

```
1. Receive { productId, name, price, quantity, category }
2. Find cart for userId (create if missing)
3. Search items[] for existing productId:
   - Not found + quantity > 0  → push new item
   - Found     + quantity > 0  → update in-place (qty, price, name, category)
   - quantity = 0              → splice item out of array
4. Save and return updated cart
```

**Why update name/price/category on quantity update?**
Allows clients to correct a product name or price alongside a quantity change in a single request. Alternatively, a PATCH endpoint could be provided for field-level updates — a reasonable extension for v2.

**Why `quantity = 0` for removal vs. a separate DELETE?**
Both are supported. The `quantity = 0` path is convenient for frontend clients that already have quantity controls (decrementing to 0). The `DELETE /items/:productId` route exists for REST-semantic clarity.

---

## 5. Promotion Engine Design

### Why a pure function?

The promotion engine (`src/utils/promotionEngine.js`) takes `items[]` as input and returns a pricing summary. It has:
- **No Express dependency** — can be called from anywhere (CLI scripts, tests, other routes)
- **No MongoDB dependency** — pure computation, no I/O
- **Deterministic output** — same input always produces same output; trivially unit testable

### Tier Resolution

Tiers are defined as an ordered array (Platinum → Bronze). The engine finds the **first** (highest) matching tier using `Array.find()`:

```js
const TIERS = [ Platinum, Gold, Silver, Bronze ];
const matched = TIERS.find(tier => tier.check(subtotal, categoryCount)) || NO_TIER;
```

This ensures only one tier is applied and the highest-value tier always wins.

### Platinum Dual Condition

```
Platinum = subtotal >= 5000 OR uniqueCategories >= 5
```

The dual condition was chosen to model real promotional strategies:
- **Value-based:** High-spending customers are rewarded (standard loyalty tier).
- **Diversity-based:** Users who explore many categories are rewarded regardless of total spend. This drives breadth of product discovery — valuable for marketplace platforms.

### Floating Point Handling

All monetary calculations use `.toFixed(2)` and `parseFloat()` to control precision. JavaScript floating-point arithmetic can produce values like `1200.0000000001`; `.toFixed(2)` rounds to 2 decimal places before returning to the client.

---

## 6. Validation Strategy

**Principle:** Validate at the **application layer** before any DB write. Never let malformed data reach MongoDB.

**Tools:** `express-validator` (industry standard, composable chains)

**Key rules:**
- `userId` params: validated as MongoDB ObjectId before controllers run. Prevents Mongoose `CastError` exceptions.
- `price`: `isFloat({ gt: 0 })` — positive decimals only
- `quantity`: `isInt({ min: 0 })` — non-negative integers; 0 is allowed (triggers removal)
- All strings: `.trim()` + `.notEmpty()` — rejects whitespace-only inputs

**Structured error response:**
```json
{
  "errors": [{ "field": "price", "message": "Price must be a positive number", "value": -5 }]
}
```

---

## 7. Error Handling Architecture

A **centralized error handler** (`src/middlewares/errorHandler.js`) receives all errors via `next(err)`. This:
- Decouples error formatting from business logic
- Ensures consistent JSON structure for ALL error types
- Maps Mongoose-specific errors (`ValidationError`, `CastError`, `11000 duplicate`) to appropriate HTTP codes

In production, the `stack` trace is omitted from responses. In `NODE_ENV=development` it is included to aid debugging.

---

## 8. Feature X — Rate Limiting

### Decision

**Chosen feature:** Two-tier rate limiting (`express-rate-limit`)

**Alternatives considered:**
| Feature | Reason Not Chosen |
|---------|-------------------|
| Cart TTL / expiry | Would require a cron job or MongoDB TTL index; adds complexity beyond core scope |
| Soft-delete (archived carts) | Valuable for analytics but not a production-readiness safety feature |
| Request logging (Morgan) | Logging is important but passive — doesn't protect the service |
| **Rate Limiting** | **Active protection, OWASP-relevant, easy to verify — chosen** |

### Configuration

- **Global:** 100 req / 15 min / IP — prevents general abuse
- **Checkout:** 20 req / 15 min / IP — stricter because checkout is the highest-value computational endpoint (discount calculation)

### Standards

- Uses `RateLimit-*` headers per RFC 6585 (`standardHeaders: true`)
- Deprecated `X-RateLimit-*` headers disabled (`legacyHeaders: false`)

---

## 9. Edge Cases Considered

| Edge Case | Handling |
|-----------|----------|
| `userId` is not a valid ObjectId | `validateUserId` middleware returns `400` before controller runs |
| User not found | Controller checks `User.exists()` first, returns `404` |
| Cart doesn't exist yet | Lazy creation on first item add; `GET /cart` returns empty structure |
| Quantity = 0 for nonexistent item | Returns `404` — "Product not in cart" |
| Empty cart on checkout | Returns `400` — "Cannot checkout an empty cart" |
| Floating-point arithmetic | All sums rounded via `.toFixed(2)` |
| Negative total (extreme discount) | `Math.max(0, total)` prevents negative values |
| Duplicate user email | MongoDB `11000` error mapped to `409 Conflict` |
| Payload > 10KB | `express.json({ limit: '10kb' })` rejects oversized bodies |
| Category case sensitivity | All categories normalized to `.toLowerCase()` before comparison |

---

## 10. Production Readiness Checklist

| Item | Status |
|------|--------|
| Environment variables via `.env` | ✅ |
| DB connection fail-fast (exit on error) | ✅ |
| Graceful shutdown (SIGTERM/SIGINT) | ✅ |
| Input validation (all routes) | ✅ |
| Centralized error handler | ✅ |
| Rate limiting (global + endpoint-specific) | ✅ |
| MongoDB indexes (userId unique, email unique) | ✅ |
| 404 handler for undefined routes | ✅ |
| Health check endpoint | ✅ |
| Consistent JSON response schema | ✅ |
| Separation of concerns (routes/controllers/models) | ✅ |
| Payload size limiting | ✅ |
