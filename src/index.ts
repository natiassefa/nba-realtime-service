/**
 * NBA Realtime Service - Main Entry Point
 * 
 * This service polls NBA.com APIs via nba_api Python library for live game data,
 * caches state in Redis using ETags and TTLs, and publishes update events
 * to Kafka when game data changes.
 */

import { logger } from './core/logger.js';
import { stopProducer } from './bus/kafkaProducer.js';
import { startApp } from './services/app.js';

// Start the service and handle any uncaught errors
startApp().catch(async (err) => {
  logger.error({ err }, 'Fatal error occurred');
  await stopProducer();
  process.exit(1);
});
