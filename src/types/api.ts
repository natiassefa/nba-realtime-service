/**
 * NBA API Type Definitions
 * 
 * TypeScript interfaces for NBA API responses (via nba_api Python library bridge).
 * These types match a standardized API format for compatibility.
 * These are minimal types - expand as needed based on actual API usage.
 */

/**
 * Team reference information
 * 
 * Basic team data included in schedule responses.
 */
export interface TeamRef {
  id: string;
  name: string;
  alias?: string;
  city?: string;
}

/**
 * Game reference in schedule
 */
export interface GameReference {
  id: string;
  nba_game_id?: string; // Original numeric NBA.com game ID (e.g., "0022300123")
  status: string;
  scheduled?: string;
  home: TeamRef;
  away: TeamRef;
}

/**
 * Daily schedule response from NBA API
 * 
 * Contains list of games scheduled for a specific date.
 */
export interface Schedule {
  date: string; // Date in ISO format
  games: GameReference[];
}

/**
 * Team data in game summary
 */
export interface TeamData {
  id: string;
  name: string;
  alias?: string;
  city?: string;
  points?: number;
  // Add other fields as needed based on actual API responses
  [key: string]: unknown; // Allow for additional fields we haven't typed yet
}

/**
 * Play-by-play event structure
 */
export interface PlayByPlayEvent {
  event_id?: string;
  clock?: string;
  description?: string;
  event_type?: string;
  period?: number;
  // Add other fields as needed based on actual API responses
  [key: string]: unknown; // Allow for additional fields we haven't typed yet
}

/**
 * Game summary response from NBA API
 * 
 * Contains game statistics, scores, status, and team information.
 */
export interface GameSummary {
  id: string;
  status: string;
  scheduled?: string;
  home: TeamData;
  away: TeamData;
  // Add other fields as needed
  [key: string]: unknown;
}

/**
 * Play-by-play response from NBA API
 * 
 * Contains detailed event-by-event game actions.
 */
export interface PlayByPlay {
  id: string;
  events: PlayByPlayEvent[];
  // Add other fields as needed
  [key: string]: unknown;
}

/**
 * @deprecated Use GameSummary instead
 */
export interface SummaryResponse extends GameSummary {}

/**
 * @deprecated Use PlayByPlay instead
 */
export interface PbpResponse extends PlayByPlay {}
