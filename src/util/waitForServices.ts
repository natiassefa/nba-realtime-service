/**
 * Wait for Services Utility
 * 
 * Waits for external services (Redis, Kafka, PostgreSQL, Python bridge) to be ready
 * before starting the application. Prevents startup errors from connection failures.
 */

import { cfg } from '../core/config.js';
import { logger } from '../core/logger.js';
import { HEALTH_CHECK } from '../core/constants.js';
import Redis from 'ioredis';
import { Kafka } from 'kafkajs';
import { Pool } from 'pg';

const MAX_RETRIES = HEALTH_CHECK.MAX_RETRIES;
const RETRY_DELAY_MS = HEALTH_CHECK.RETRY_DELAY_MS;

/**
 * Wait for Redis to be available
 */
async function waitForRedis(): Promise<void> {
  logger.info('Waiting for Redis to be ready...');
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const testRedis = new Redis(cfg.redis.url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't retry, just test connection
        connectTimeout: HEALTH_CHECK.CONNECTION_TIMEOUT_MS
      });
      
      await testRedis.ping();
      await testRedis.quit();
      logger.info('✓ Redis is ready');
      return;
    } catch (err) {
      if (i < MAX_RETRIES - 1) {
        logger.debug({ attempt: i + 1, maxRetries: MAX_RETRIES }, 'Redis not ready, retrying...');
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw new Error(`Redis failed to become ready after ${MAX_RETRIES} attempts: ${err}`);
      }
    }
  }
}

/**
 * Wait for Kafka/Redpanda to be available
 */
async function waitForKafka(): Promise<void> {
  logger.info('Waiting for Kafka to be ready...');
  
  const kafka = new Kafka({
    clientId: 'nba-realtime-service-health-check',
    brokers: cfg.kafka.brokers,
    connectionTimeout: HEALTH_CHECK.CONNECTION_TIMEOUT_MS,
    requestTimeout: HEALTH_CHECK.CONNECTION_TIMEOUT_MS
  });
  
  const admin = kafka.admin();
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      logger.info('✓ Kafka is ready');
      return;
    } catch (err) {
      if (i < MAX_RETRIES - 1) {
        logger.debug({ attempt: i + 1, maxRetries: MAX_RETRIES }, 'Kafka not ready, retrying...');
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        throw new Error(`Kafka failed to become ready after ${MAX_RETRIES} attempts: ${err}`);
      }
    }
  }
}

/**
 * Wait for PostgreSQL to be available
 */
async function waitForPostgreSQL(): Promise<void> {
  if (!cfg.database?.host) {
    logger.info('PostgreSQL not configured, skipping...');
    return;
  }
  
  logger.info('Waiting for PostgreSQL to be ready...');
  
  const pool = new Pool({
    host: cfg.database.host,
    port: cfg.database.port,
    user: cfg.database.user,
    password: cfg.database.password,
    database: cfg.database.database,
    connectionTimeoutMillis: HEALTH_CHECK.CONNECTION_TIMEOUT_MS,
    max: 1
  });
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      logger.info('✓ PostgreSQL is ready');
      return;
    } catch (err) {
      if (i < MAX_RETRIES - 1) {
        logger.debug({ attempt: i + 1, maxRetries: MAX_RETRIES }, 'PostgreSQL not ready, retrying...');
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      } else {
        await pool.end();
        throw new Error(`PostgreSQL failed to become ready after ${MAX_RETRIES} attempts: ${err}`);
      }
    }
  }
}

/**
 * Wait for Python bridge service to be available
 */
async function waitForPythonBridge(): Promise<void> {
  logger.info('Waiting for Python bridge service to be ready...');
  
  const bridgeUrl = cfg.nbaApi.bridgeUrl;
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${bridgeUrl}/health`, {
        signal: AbortSignal.timeout(HEALTH_CHECK.CONNECTION_TIMEOUT_MS)
      });
      
      if (response.ok) {
        logger.info('✓ Python bridge service is ready');
        return;
      }
    } catch (err) {
      // Ignore fetch errors, just retry
    }
    
    if (i < MAX_RETRIES - 1) {
      logger.debug({ attempt: i + 1, maxRetries: MAX_RETRIES }, 'Python bridge not ready, retrying...');
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    } else {
      logger.warn('Python bridge service not ready after maximum retries, continuing anyway...');
      // Don't throw - Python bridge might start after Node.js service
      return;
    }
  }
}

/**
 * Wait for all required services to be ready
 */
export async function waitForServices(): Promise<void> {
  logger.info('Checking service availability...');
  
  const checks = [
    waitForRedis(),
    waitForKafka(),
    waitForPostgreSQL(),
    waitForPythonBridge()
  ];
  
  // Run checks in parallel for faster startup
  await Promise.allSettled(checks);
  
  logger.info('Service availability check complete');
}

