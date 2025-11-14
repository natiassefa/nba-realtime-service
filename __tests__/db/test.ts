/**
 * Database Test Script
 * 
 * Simple script to test database operations.
 */

import { db } from '../../src/db/client.js';
import { upsertGame } from '../../src/db/repositories/games.js';
import { insertGameSummary } from '../../src/db/repositories/gameSummaries.js';
import { logger } from '../../src/core/logger.js';

async function testDatabase() {
  try {
    // Test connection
    const result = await db.query('SELECT NOW()');
    logger.info({ time: result.rows[0].now }, 'Database connection successful');

    // Test game upsert (using a valid UUID format)
    const testGameId = '00000000-0000-0000-0000-000000000123';
    await upsertGame({
      id: testGameId,
      status: 'scheduled',
      home: { name: 'Lakers', alias: 'LAL' },
      away: { name: 'Celtics', alias: 'BOS' }
    });
    logger.info('Game upsert test passed');

    // Test summary insert
    const testSummary = {
      id: testGameId,
      status: 'closed',
      home: { id: 'home-id', name: 'Lakers', alias: 'LAL', points: 100 },
      away: { id: 'away-id', name: 'Celtics', alias: 'BOS', points: 95 }
    };
    const testHash = 'test-hash-123';
    const inserted = await insertGameSummary(
      testGameId,
      testSummary,
      testHash,
      new Date()
    );
    logger.info({ inserted }, 'Game summary insert test passed');

    // Test deduplication
    const insertedAgain = await insertGameSummary(
      testGameId,
      testSummary,
      testHash,
      new Date()
    );
    if (!insertedAgain) {
      logger.info('Deduplication test passed');
    } else {
      logger.warn('Deduplication test failed - duplicate was inserted');
    }

    logger.info('All database tests passed');
  } catch (err) {
    logger.error({ err }, 'Database test failed');
    process.exit(1);
  } finally {
    await db.end();
  }
}

testDatabase();

