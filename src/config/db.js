'use strict';

const mongoose = require('mongoose');

/**
 * Establishes a connection to MongoDB using the URI from environment variables.
 * Exits the process if the connection fails to prevent running in a broken state.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // These options are defaults in mongoose 8.x but shown for clarity
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host} (DB: ${conn.connection.name})`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1); // Exit with failure code — app cannot run without DB
  }
};

module.exports = connectDB;
