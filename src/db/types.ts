/**
 * Database Entity Types
 * 
 * TypeScript interfaces matching database schema.
 */

import type { Schedule, GameSummary, PlayByPlay } from '../types/api.js';

export interface GameRow {
  id: string; // UUID
  nba_game_id: string | null; // Original numeric NBA.com game ID (e.g., "0022300123")
  scheduled_at: Date | null;
  status: string;
  home_team_id: string | null;
  home_team_name: string | null;
  home_team_alias: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  away_team_alias: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScheduleRow {
  date: string; // DATE as string (YYYY-MM-DD)
  schedule_data: Schedule; // JSONB
  game_ids: string[]; // UUID[]
  created_at: Date;
  updated_at: Date;
}

export interface GameSummaryRow {
  id: number;
  game_id: string; // UUID
  summary_data: GameSummary; // JSONB
  hash: string;
  fetched_at: Date;
  created_at: Date;
}

export interface PlayByPlayRow {
  id: number;
  game_id: string; // UUID
  pbp_data: PlayByPlay; // JSONB
  hash: string;
  fetched_at: Date;
  created_at: Date;
}

