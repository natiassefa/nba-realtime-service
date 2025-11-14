/**
 * Redis Client Module
 * 
 * Creates and exports a singleton Redis client instance.
 * Handles connection events and errors for monitoring.
 */

import Redis from 'ioredis';
import { cfg } from '../core/config.js';
import { logger } from '../core/logger.js';

/**
 * Redis client instance
 * 
 * Connects to Redis using the URL from configuration.
 * Used throughout the application for caching:
 * - ETags for conditional HTTP requests
 * - TTL values for polling delays
 * - Game state snapshots (summary and play-by-play)
 */
export const redis = new Redis(cfg.redis.url);

// Log connection events for monitoring
redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));
