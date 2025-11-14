/**
 * Play-by-Play Repository
 * 
 * Functions for upserting play-by-play data (one row per game).
 */

import { db } from '../client.js';
import { logger } from '../../core/logger.js';
import type { PlayByPlayRow } from '../types.js';
import type { PlayByPlay } from '../../types/api.js';

/**
 * Upserts play-by-play data for a game
 * 
 * Updates the existing row if one exists for the game_id, otherwise inserts a new row.
 * This ensures there is exactly one row per game that gets updated with the latest data.
 */
export async function upsertPlayByPlay(
  gameId: string,
  pbpData: PlayByPlay,
  hash: string,
  fetchedAt: Date | string
): Promise<void> {
  // First check if a row exists to determine if this is an insert or update
  const existing = await getLatestPlayByPlay(gameId);
  const isUpdate = existing !== null;

  const query = `
    INSERT INTO play_by_play (game_id, pbp_data, hash, fetched_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (game_id) 
    DO UPDATE SET
      pbp_data = EXCLUDED.pbp_data,
      hash = EXCLUDED.hash,
      fetched_at = EXCLUDED.fetched_at
    RETURNING id
  `;

  try {
    await db.query<{ id: number }>(query, [
      gameId,
      JSON.stringify(pbpData),
      hash,
      fetchedAt
    ]);

    if (isUpdate) {
      logger.debug({ gameId, hash }, 'Play-by-play updated in database');
    } else {
      logger.debug({ gameId, hash }, 'Play-by-play inserted to database');
    }
  } catch (err) {
    logger.error({ err, gameId, hash }, 'Failed to upsert play-by-play');
    throw err;
  }
}

// Keep old function name for backwards compatibility
// Note: This now upserts instead of just inserting
export const insertPlayByPlay = upsertPlayByPlay;

/**
 * Gets latest play-by-play for a game
 */
export async function getLatestPlayByPlay(gameId: string): Promise<PlayByPlayRow | null> {
  const query = `
    SELECT * FROM play_by_play
    WHERE game_id = $1
    ORDER BY fetched_at DESC
    LIMIT 1
  `;
  const result = await db.query<PlayByPlayRow>(query, [gameId]);
  return result.rows[0] || null;
}

