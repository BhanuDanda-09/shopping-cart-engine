'use strict';

const mongoose = require('mongoose');

/**
 * User Schema
 *
 * Represents a tenant in the multi-tenant cart system.
 * Each user owns exactly one cart (1:1 relationship, enforced at the Cart model level).
 *
 * Design Decision:
 *   Kept intentionally lean. In a real system this would integrate with an
 *   auth service (JWT/OAuth). Here, userId isolation is enforced at the
 *   controller layer by scoping all Cart queries to { userId }.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
  },
  {
    timestamps: true, // Adds createdAt & updatedAt automatically
    versionKey: false, // Removes __v field from documents
  }
);

// Index on email for fast lookup (also enforces uniqueness)
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);
