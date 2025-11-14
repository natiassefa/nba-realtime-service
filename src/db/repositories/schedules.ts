/**
 * Schedule Repository
 * 
 * Functions for inserting and updating schedule data.
 */

import { db } from '../client.js';
import { logger } from '../../core/logger.js';
import type { ScheduleRow } from '../types.js';
import type { Schedule } from '../../types/api.js';

/**
 * Upserts schedule data for a date
 */
export async function upsertSchedule(dateISO: string, schedule: Schedule): Promise<void> {
  const gameIds = (schedule.games || []).map(g => g.id).filter(Boolean) as string[];

  const query = `
    INSERT INTO schedules (date, schedule_data, game_ids)
    VALUES ($1, $2, $3)
    ON CONFLICT (date) DO UPDATE SET
      schedule_data = EXCLUDED.schedule_data,
      game_ids = EXCLUDED.game_ids,
      updated_at = NOW()
  `;

  try {
    await db.query(query, [dateISO, JSON.stringify(schedule), gameIds]);
    logger.debug({ dateISO, gameCount: gameIds.length }, 'Schedule upserted to database');
  } catch (err) {
    logger.error({ err, dateISO }, 'Failed to upsert schedule');
    throw err;
  }
}

/**
 * Gets schedule for a date
 */
export async function getSchedule(dateISO: string): Promise<ScheduleRow | null> {
  const query = 'SELECT * FROM schedules WHERE date = $1';
  const result = await db.query<ScheduleRow>(query, [dateISO]);
  return result.rows[0] || null;
}

