/**
 * Database Client Module
 * 
 * Creates and exports a PostgreSQL connection pool.
 * Handles connection events and errors for monitoring.
 */

import { Pool } from 'pg';
import { cfg } from '../core/config.js';
import { logger } from '../core/logger.js';

/**
 * PostgreSQL connection pool
 * 
 * Uses connection pooling for efficient database access.
 * Automatically handles reconnection and connection lifecycle.
 */
export const db = new Pool({
  host: cfg.database.host,
  port: cfg.database.port,
  user: cfg.database.user,
  password: cfg.database.password,
  database: cfg.database.database,
  ssl: cfg.database.ssl,
  max: cfg.database.max,
  idleTimeoutMillis: cfg.database.idleTimeoutMillis,
  connectionTimeoutMillis: cfg.database.connectionTimeoutMillis
});

// Log connection events for monitoring
db.on('connect', (_client) => {
  logger.debug('Database client connected');
});

db.on('error', (err: Error) => {
  logger.error({ err }, 'Database pool error');
});

db.on('acquire', () => {
  logger.debug('Database client acquired from pool');
});

db.on('release', () => {
  logger.debug('Database client released to pool');
});

/**
 * Gracefully closes all database connections
 */
export async function closeDatabase() {
  await db.end();
  logger.info('Database connections closed');
}

