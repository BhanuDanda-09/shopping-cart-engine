'use strict';

require('dotenv').config();

const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

/**
 * Bootstrap sequence:
 *   1. Connect to MongoDB (exits process on failure — fail-fast pattern)
 *   2. Start the HTTP server only after DB is confirmed available
 *
 * This ordering prevents the server from accepting requests before
 * the database is ready, avoiding 500 errors on first requests.
 */
const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`\n🚀 Shopping Cart Engine running on port ${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health Check: http://localhost:${PORT}/health`);
    console.log(`   API Base    : http://localhost:${PORT}/api\n`);
  });

  // --- Graceful Shutdown ---
  // Allows in-flight requests to complete before closing connections.
  // Triggered by SIGTERM (Docker/k8s stop) and SIGINT (Ctrl+C in dev).
  const gracefulShutdown = (signal) => {
    console.log(`\n⚠️  ${signal} received. Initiating graceful shutdown...`);
    server.close(async () => {
      console.log('✅ HTTP server closed');
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Catch unhandled promise rejections to prevent silent failures
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
};

startServer();
