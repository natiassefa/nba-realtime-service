/**
 * Database Migration Runner
 * 
 * Runs SQL migration files in order to set up the database schema.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db } from './client.js';
import { logger } from '../core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Runs all migration files in order
 */
export async function runMigrations() {
  // Migrations are in src/db/migrations
  // When running from dist/db/migrate.js, we need to go up to app root then into src
  // When running from src/db/migrate.ts (dev), migrations are in same directory structure
  const isDist = __dirname.includes('/dist/');
  const migrationsDir = isDist 
    ? join(process.cwd(), 'src/db/migrations')  // From dist, use cwd to get app root
    : join(__dirname, 'migrations');  // From src/db -> src/db/migrations
  
  // Run all migration files in order
  // In the future, this could track which migrations have been run
  const migrations = [
    '001_initial_schema.sql', 
    '002_add_nba_game_id.sql',
    '003_fix_play_by_play_unique_constraint.sql'
  ];
  
  for (const migrationFile of migrations) {
    const migrationPath = join(migrationsDir, migrationFile);
    try {
      const sql = readFileSync(migrationPath, 'utf-8');
      await db.query(sql);
      logger.info({ migration: migrationFile }, 'Migration applied successfully');
    } catch (err) {
      logger.error({ err, migration: migrationFile }, 'Failed to run migration');
      throw err;
    }
  }
  
  logger.info('All database migrations completed successfully');
}

// Run migrations if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.includes('migrate.ts')) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}

