/**
 * Game Summary Repository
 * 
 * Functions for inserting game summary data with hash-based deduplication.
 */

import { db } from '../client.js';
import { logger } from '../../core/logger.js';
import type { GameSummaryRow } from '../types.js';
import type { GameSummary } from '../../types/api.js';

/**
 * Inserts game summary if hash doesn't already exist (deduplication)
 * 
 * @returns true if inserted, false if duplicate
 */
export async function insertGameSummary(
  gameId: string,
  summaryData: GameSummary,
  hash: string,
  fetchedAt: Date | string
): Promise<boolean> {
  const query = `
    INSERT INTO game_summaries (game_id, summary_data, hash, fetched_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (game_id, hash) DO NOTHING
    RETURNING id
  `;

  try {
    const result = await db.query<{ id: number }>(query, [
      gameId,
      JSON.stringify(summaryData),
      hash,
      fetchedAt
    ]);

    const inserted = result.rows.length > 0;
    if (inserted) {
      logger.debug({ gameId, hash }, 'Game summary inserted to database');
    } else {
      logger.debug({ gameId, hash }, 'Game summary skipped (duplicate hash)');
    }

    return inserted;
  } catch (err) {
    logger.error({ err, gameId, hash }, 'Failed to insert game summary');
    throw err;
  }
}

/**
 * Gets latest game summary for a game
 */
export async function getLatestGameSummary(gameId: string): Promise<GameSummaryRow | null> {
  const query = `
    SELECT * FROM game_summaries
    WHERE game_id = $1
    ORDER BY fetched_at DESC
    LIMIT 1
  `;
  const result = await db.query<GameSummaryRow>(query, [gameId]);
  return result.rows[0] || null;
}

