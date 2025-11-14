/**
 * Game Repository
 * 
 * Functions for inserting and updating game metadata.
 */

import { db } from '../client.js';
import { logger } from '../../core/logger.js';
import { DatabaseError } from '../../errors/index.js';
import type { GameRow } from '../types.js';

/**
 * Upserts game metadata from schedule data
 */
export async function upsertGame(gameData: {
  id: string;
  nba_game_id?: string | null; // Original numeric NBA.com game ID
  scheduled_at?: Date | string | null;
  status: string;
  home?: { id?: string; name?: string; alias?: string };
  away?: { id?: string; name?: string; alias?: string };
}): Promise<void> {
  const query = `
    INSERT INTO games (
      id, nba_game_id, scheduled_at, status,
      home_team_id, home_team_name, home_team_alias,
      away_team_id, away_team_name, away_team_alias
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      nba_game_id = COALESCE(EXCLUDED.nba_game_id, games.nba_game_id),
      scheduled_at = EXCLUDED.scheduled_at,
      status = EXCLUDED.status,
      home_team_id = EXCLUDED.home_team_id,
      home_team_name = EXCLUDED.home_team_name,
      home_team_alias = EXCLUDED.home_team_alias,
      away_team_id = EXCLUDED.away_team_id,
      away_team_name = EXCLUDED.away_team_name,
      away_team_alias = EXCLUDED.away_team_alias,
      updated_at = NOW()
  `;

  try {
    await db.query(query, [
      gameData.id,
      gameData.nba_game_id || null,
      gameData.scheduled_at || null,
      gameData.status,
      gameData.home?.id || null,
      gameData.home?.name || null,
      gameData.home?.alias || null,
      gameData.away?.id || null,
      gameData.away?.name || null,
      gameData.away?.alias || null
    ]);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err, gameId: gameData.id }, 'Failed to upsert game');
    throw new DatabaseError(`Failed to upsert game: ${error.message}`, 'upsertGame', error);
  }
}

/**
 * Gets a game by ID
 */
export async function getGame(gameId: string): Promise<GameRow | null> {
  const query = 'SELECT * FROM games WHERE id = $1';
  const result = await db.query<GameRow>(query, [gameId]);
  return result.rows[0] || null;
}

/**
 * Gets NBA game ID from UUID
 * 
 * Looks up the original numeric NBA.com game ID from the database.
 * Used as a fallback when Redis lookup fails.
 */
export async function getNbaGameIdFromUuid(gameUuid: string): Promise<string | null> {
  const query = 'SELECT nba_game_id FROM games WHERE id = $1';
  const result = await db.query<{ nba_game_id: string | null }>(query, [gameUuid]);
  return result.rows[0]?.nba_game_id || null;
}

