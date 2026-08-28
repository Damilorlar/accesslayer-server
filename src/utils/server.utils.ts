// src/utils/server.utils.ts
// Builds the Express app for use in integration tests without binding a port.
import app from '../app';

/**
 * Returns the configured Express application instance. Used by integration
 * tests so they can drive the full HTTP stack via supertest without starting
 * a listening server.
 */
export async function createServer() {
   return app;
}
