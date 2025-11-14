/**
 * Application Service
 * 
 * Main application orchestration logic.
 * Handles initialization, game discovery, and graceful shutdown.
 */

import { cfg } from '../core/config.js';
import { logger } from '../core/logger.js';
import { startProducer, stopProducer } from '../bus/kafkaProducer.js';
import { fetchSchedule } from './scheduleService.js';
import { pollGame } from './gamePoller.js';
import { startPersistenceConsumer, stopPersistenceConsumer } from '../bus/consumers/persistenceConsumer.js';
import { closeDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { waitForServices } from '../util/waitForServices.js';
import { isValidDateISO, ValidationError } from '../util/validation.js';

/**
 * Gets today's date in YYYY-MM-DD format using Eastern Time (ET/EDT)
 * 
 * NBA games are scheduled in Eastern Time, so we use ET to determine "today"
 * for schedule fetching. This ensures games scheduled for today in ET are
 * fetched correctly regardless of server timezone.
 * 
 * @returns Date string in YYYY-MM-DD format (Eastern Time)
 */
function getTodayEasternDate(): string {
  const now = new Date();
  
  // Convert to Eastern Time using Intl.DateTimeFormat (more reliable)
  // This handles both EST (UTC-5) and EDT (UTC-4) automatically
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Sets up graceful shutdown handlers
 * 
 * @param controller - AbortController to signal shutdown to polling loops
 */
function setupShutdownHandlers(controller: AbortController): void {
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    controller.abort();
    
    // Stop persistence consumer
    try {
      await stopPersistenceConsumer();
    } catch (err) {
      logger.warn({ err }, 'Error stopping persistence consumer');
    }
    
    // Close database connections
    try {
      await closeDatabase();
    } catch (err) {
      logger.warn({ err }, 'Error closing database connections');
    }
    
    await stopProducer();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * Main application logic
 * 
 * Initializes the service by:
 * 1. Connecting to Kafka producer
 * 2. Fetching the schedule for today in Eastern Time (or configured date)
 * 3. Starting polling loops for each game
 * 4. Setting up graceful shutdown handlers
 */
export async function startApp(): Promise<void> {
  // Wait for all services to be ready before starting
  try {
    await waitForServices();
  } catch (err) {
    logger.error({ err }, 'Failed to wait for services, continuing anyway...');
    // Continue - services might become available later
  }

  // Run database migrations if database is configured
  if (cfg.database?.host) {
    try {
      await runMigrations();
      logger.info('Database migrations completed');
    } catch (err) {
      logger.warn({ err }, 'Database migrations failed, continuing without database persistence');
    }
  }

  // Initialize Kafka producer connection
  await startProducer();

  // Start persistence consumer (writes to Redis + PostgreSQL)
  try {
    await startPersistenceConsumer();
  } catch (err) {
    logger.warn({ err }, 'Persistence consumer failed to start, continuing without persistence');
    // Service continues - polling still works, just no persistence
  }

  // Determine which date to fetch schedule for (defaults to today in Eastern Time)
  // NBA schedules use Eastern Time, so we use ET to determine "today"
  const dateISO = cfg.polling.scheduleDate || getTodayEasternDate();
  
  if (!isValidDateISO(dateISO)) {
    throw new ValidationError(`Invalid configured date: ${dateISO}`, 'scheduleDate');
  }
  
  logger.info({ dateISO, configured: !!cfg.polling.scheduleDate }, 'fetching schedule');
  const gameIds = await fetchSchedule(dateISO);
  
  if (gameIds.length === 0) {
    logger.warn({ dateISO }, 'no games found for schedule');
  } else {
    logger.info({ count: gameIds.length }, 'games discovered');
  }

  // Create abort controller for graceful shutdown
  const controller = new AbortController();
  
  // Set up shutdown handlers
  setupShutdownHandlers(controller);
  
  // Start polling loop for each game (runs in parallel)
  const runners = gameIds.map(id => pollGame(id, controller.signal));

  // Keep process alive even if no games are found
  // (allows service to stay running and handle future schedules)
  if (runners.length === 0) {
    setInterval(() => {}, 1 << 30);
  } else {
    // Wait for all polling loops to complete (they run until aborted)
    await Promise.allSettled(runners);
  }
}

