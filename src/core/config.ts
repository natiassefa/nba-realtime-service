/**
 * Configuration Module
 * 
 * Centralizes all application configuration from environment variables.
 * Loads .env file automatically via dotenv/config import.
 */

import 'dotenv/config';

/**
 * Helper function to ensure required environment variables are present
 * 
 * @param name - Environment variable name
 * @returns The environment variable value
 * @throws Error if the variable is not set
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

/**
 * Application configuration object
 * 
 * All configuration values are read from environment variables with sensible defaults.
 */
export const cfg = {
  // NBA API Bridge configuration
  nbaApi: {
    bridgeUrl: process.env.NBA_API_BRIDGE_URL || 'http://localhost:8000', // Python bridge service URL (runs in same container)
  },
  
  // Legacy API configuration (deprecated - kept for backward compatibility)
  sportradar: {
    apiKey: process.env.SPORTRADAR_API_KEY || '', // No longer required
    accessLevel: process.env.SPORTRADAR_ACCESS_LEVEL || 'trial',
    lang: process.env.SPORTRADAR_LANG || 'en',
    format: process.env.SPORTRADAR_FORMAT || 'json'
  },
  // Polling configuration
  polling: {
    baseIntervalMs: Number(process.env.POLL_BASE_INTERVAL_MS || '20000'), // Base polling interval in milliseconds (default: 2 seconds)
    
    scheduleDate: process.env.SCHEDULE_DATE || '' // Optional: Specific date to fetch schedule for (YYYY-MM-DD), empty = today
  },
  // Kafka/Redpanda configuration
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map(b => b.trim()), // Comma-separated list of Kafka broker addresses
    clientId: process.env.KAFKA_CLIENT_ID || 'nba-realtime-service', // Client identifier for Kafka connections
    topicUpdates: process.env.KAFKA_TOPIC_UPDATES || 'nba.game.updates' // Topic name for publishing game update messages
  },
  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379' // Redis connection URL
  },
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '5433'), // Default to 5433 to avoid conflict with local PostgreSQL
    user: process.env.DB_USER || 'nba',
    password: process.env.DB_PASSWORD || 'nba',
    database: process.env.DB_NAME || 'nba',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DB_POOL_SIZE || '10'), // Connection pool size
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || '30000'),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || '5000')
  },
  // Logging configuration
  logLevel: process.env.LOG_LEVEL || 'info' // Log level (trace, debug, info, warn, error, fatal)
};
