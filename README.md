# 🛒 Shopping Cart Engine

> **Adaptive E-Commerce Cart Engine** — A production-ready Node.js microservice with multi-tenant session isolation, dynamic campaign pricing, and a tiered promotional engine.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Running Locally](#setup--running-locally)
- [API Reference](#api-reference)
  - [Users](#users)
  - [Cart](#cart)
  - [Checkout](#checkout)
- [Session Strategy](#session-strategy)
- [Promotion Engine & Tier Formulas](#promotion-engine--tier-formulas)
- [Feature X — Rate Limiting](#feature-x--rate-limiting)
- [Input Validation](#input-validation)
- [Error Response Format](#error-response-format)

---

## Tech Stack

| Layer       | Technology                |
|-------------|---------------------------|
| Runtime     | Node.js 18+               |
| Framework   | Express 4.x               |
| Database    | MongoDB + Mongoose 8.x    |
| Validation  | express-validator         |
| Rate Limit  | express-rate-limit        |
| Config      | dotenv                    |

---

## Project Structure

```
shopping-cart-engine/
├── src/
│   ├── config/
│   │   └── db.js               # MongoDB connection (exits on failure)
│   ├── models/
│   │   ├── User.js             # User schema (tenant identity)
│   │   └── Cart.js             # Cart + embedded CartItem schema
│   ├── routes/
│   │   └── cartRoutes.js       # Express router (routes only, no logic)
│   ├── controllers/
│   │   └── cartController.js   # All business logic
│   ├── middlewares/
│   │   ├── validate.js         # express-validator chains
│   │   ├── rateLimiter.js      # Feature X: global + checkout limiters
│   │   └── errorHandler.js     # Central error + 404 handler
│   ├── utils/
│   │   └── promotionEngine.js  # Pure tier calculation function
│   ├── app.js                  # Express app (middleware + routes wired)
│   └── server.js               # HTTP server entry + graceful shutdown
├── .env                        # Environment variables (not committed)
├── package.json
├── README.md
└── DESIGN.md
```

---

## Setup & Running Locally

### Prerequisites
- Node.js 18+
- MongoDB running locally on port 27017 (or provide a MongoDB Atlas URI)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/BhanuDanda-09/shopping-cart-engine.git
cd shopping-cart-engine

# 2. Install dependencies
npm install

# 3. Configure environment
# Edit .env with your MongoDB URI
cp .env.example .env   # or edit .env directly  

# .env contents:
# PORT=3000
# MONGODB_URI=mongodb://localhost:27017/shopping-cart-engine
# NODE_ENV=development

# 4. Start the server
npm start

# For development with auto-reload:
npm run dev
```
---

## API Reference

> All endpoints return JSON. All error responses follow the [Error Response Format](#error-response-format).

### Base URL
```
https://shopping-cart-engine-q7oq.onrender.com
```

---

### Users

#### `POST /api/users` — Create User

Creates a new user (tenant). Each user gets an isolated cart.

**Request Body:**
```json
{
  "name": "Riya Sharma",
  "email": "riya@example.com"
}
```

**Success Response `201`:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "_id": "666abc123def456789012345",
      "name": "Riya Sharma",
      "email": "riya@example.com",
      "createdAt": "2024-06-27T05:00:00.000Z"
    }
  }
}
```

**Failure `400`** — Validation error (missing/invalid fields)  
**Failure `409`** — Email already registered

---

#### `GET /api/users/:userId` — Get User

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "name": "Riya Sharma", "email": "riya@example.com" }
  }
}
```

---

### Cart

#### `GET /api/cart/:userId` — View Cart

Returns the user's current cart. Returns an empty cart if no items added yet.

**Success Response `200`:**
```json
{
  "success": true,
  "data": {
    "cartId": "666bcd234efg567890123456",
    "userId": "666abc123def456789012345",
    "items": [
      {
        "_id": "...",
        "productId": "PROD-001",
        "name": "Wireless Headphones",
        "price": 1200,
        "quantity": 1,
        "category": "electronics"
      }
    ],
    "itemCount": 1,
    "subtotal": 1200
  }
}
```

---

#### `POST /api/cart/:userId/items` — Add / Update / Remove Item

The primary ingestion endpoint. Behaviour is determined by `quantity`:

| Scenario                  | Behaviour                                      |
|---------------------------|------------------------------------------------|
| productId not in cart     | **Adds** item                                  |
| productId already in cart | **Updates** quantity, price, name, category    |
| quantity = 0              | **Removes** item from cart                     |

**Request Body:**
```json
{
  "productId": "PROD-001",
  "name": "Wireless Headphones",
  "price": 1200,
  "quantity": 2,
  "category": "electronics"
}
```

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Item 'PROD-001' added successfully",
  "data": {
    "cartId": "...",
    "action": "added",
    "affectedProductId": "PROD-001",
    "items": [...],
    "itemCount": 1,
    "subtotal": 2400
  }
}
```

**Validation Rules:**
- `productId`: required, non-empty string
- `name`: required, max 200 characters
- `price`: required, must be > 0
- `quantity`: required, must be integer ≥ 0
- `category`: required, max 100 characters

---

#### `DELETE /api/cart/:userId/items/:productId` — Remove Specific Item

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Product 'PROD-001' removed from cart",
  "data": { "cartId": "...", "items": [...], "itemCount": 0 }
}
```

---

#### `DELETE /api/cart/:userId` — Clear Entire Cart

Removes all items. Cart document is retained.

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Cart cleared successfully",
  "data": { "cartId": "...", "items": [], "itemCount": 0 }
}
```

---

### Checkout

#### `GET /api/cart/:userId/checkout` — Checkout Summary

Computes a complete checkout breakdown including the active promotional tier.
**This is a read-only endpoint — no cart state is modified.**

**Rate Limit:** 20 requests / 15 minutes per IP (stricter than global).

**Success Response `200`:**
```json
{
  "success": true,
  "message": "Checkout summary computed. Tier: Silver",
  "data": {
    "userId": "666abc123def456789012345",
    "user": { "name": "Riya Sharma", "email": "riya@example.com" },
    "items": [...],
    "summary": {
      "itemCount": 3,
      "subtotal": 1200.00,
      "tier": "Silver",
      "discountPercent": 10,
      "discountAmount": 120.00,
      "shippingCredit": 50.00,
      "rewardPoints": 0,
      "total": 1030.00,
      "uniqueCategories": ["electronics", "books"]
    }
  }
}
```

**Failure `400`** — Empty cart cannot be checked out  
**Failure `404`** — User not found

---

## Session Strategy

### Multi-Tenant Isolation

Each user is identified by their MongoDB `_id` (`userId`). All cart endpoints are scoped to `{ userId }` at the database query level — no user can access or modify another user's cart.

**Design Decision — No JWT / Session Tokens:**
This microservice is scoped to cart management only. In a production system, a separate Auth Service would issue JWT tokens. The cart service would then verify the token and extract `userId` from the payload. For this assignment, `userId` is passed as a route parameter to keep the focus on cart engine logic.

**Cart Initialization — Lazy Creation:**
A Cart document is NOT created when a User is created. It is created on the first `POST /api/cart/:userId/items` call. This avoids orphaned empty cart documents for users who never add items.

**One Cart Per User:**
Enforced by a `unique` index on `Cart.userId` in MongoDB. Concurrent creation attempts are safely handled by the duplicate-key error handler (→ `409`).

---

## Promotion Engine & Tier Formulas

The promotion engine is a **pure function** in `src/utils/promotionEngine.js` — isolated from Express and MongoDB, making it independently testable.

### Tier Table

| Tier     | Condition                                          | Discount | Shipping Credit | Reward Points |
|----------|----------------------------------------------------|----------|-----------------|---------------|
| **None**     | subtotal < ₹500                                | 0%       | ₹0              | 0             |
| **Bronze**   | subtotal ≥ ₹500                                | 5%       | ₹0              | 0             |
| **Silver**   | subtotal ≥ ₹1,000                              | 10%      | ₹50             | 0             |
| **Gold**     | subtotal ≥ ₹2,500                              | 15%      | ₹50             | 50            |
| **Platinum** | subtotal ≥ ₹5,000 **OR** 5+ unique categories  | 20%      | ₹50             | 100           |

### Formulas

```
subtotal       = Σ (item.price × item.quantity)   for all items
discountAmount = (discountPercent / 100) × subtotal
total          = subtotal − discountAmount − shippingCredit
total          = max(0, total)   # never negative
```

### Platinum Dual Condition

Platinum is unlocked either by high cart value (₹5,000+) **or** by shopping across 5+ distinct product categories, regardless of subtotal. This incentivizes category diversity — a strategy used by major e-commerce platforms to drive cross-category exploration.

Categories are normalized to lowercase before comparison (`"Electronics"` and `"electronics"` are treated as the same).

---

## Feature X — Rate Limiting

**What:** Two-tier rate limiting using `express-rate-limit`.

| Limiter    | Scope             | Limit                     |
|------------|-------------------|---------------------------|
| Global     | All `/api` routes | 100 req / 15 min          |
| Checkout   | `/checkout` only  | 20 req / 15 min           |

**Why:**
1. **Discount Scraping Prevention** — Bots probing the checkout endpoint could reverse-engineer tier thresholds.
2. **MongoDB Protection** — Unbounded traffic exhausts connection pools; rate limiting is the first application-layer defense.
3. **OWASP Compliance** — Addresses API4:2023 "Unrestricted Resource Consumption" from the OWASP API Security Top 10.
4. **Graceful 429** — Returns structured JSON (not HTML) so clients can handle it programmatically.

Response headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) are sent per RFC 6585.

---

## Input Validation

All write endpoints validate incoming payloads using `express-validator` **before** the controller runs. Invalid requests never reach MongoDB.

**Invalid Request → `400 Bad Request`:**
```json
{
  "success": false,
  "message": "Validation failed. Please check the errors and try again.",
  "errors": [
    {
      "field": "price",
      "message": "Price must be a positive number",
      "value": -5
    }
  ]
}
```

---

## Error Response Format

All error responses follow a consistent structure:

```json
{
  "success": false,
  "message": "Human-readable error description",
  "errors": [...]   // optional, present for validation errors
}
```

| Status Code | Scenario                          |
|-------------|-----------------------------------|
| `400`       | Validation failure / empty cart   |
| `404`       | User or item not found            |
| `409`       | Duplicate email / unique conflict |
| `429`       | Rate limit exceeded               |
| `500`       | Internal server error             |
