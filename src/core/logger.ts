/**
 * Logger Module
 * 
 * Configures structured logging using Pino.
 * In development, uses pino-pretty for human-readable colored output.
 * In production, outputs JSON logs for log aggregation systems.
 */

import pino from 'pino';
import { cfg } from './config.js';

/**
 * Pino logger instance
 * 
 * - Development: Pretty-printed, colored output for easy reading
 * - Production: JSON output for structured log processing
 * - Log level controlled by LOG_LEVEL environment variable
 */
export const logger = pino({
  level: cfg.logLevel,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
});
