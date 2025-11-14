/**
 * Message Models
 * 
 * Defines the structure of messages published to Kafka.
 * These messages represent game data updates detected by the polling service.
 */

/**
 * Game update message structure
 * 
 * This message is published to Kafka whenever a change is detected
 * in game summary or play-by-play data.
 * 
 * @template T - Type of the payload (typically GameSummary or PlayByPlay)
 */
export interface UpdateMessage<T = unknown> {
  /** Type of update: 'summary' (game stats/scores), 'pbp' (play-by-play events), or 'schedule' (daily schedule) */
  eventType: 'summary' | 'pbp' | 'schedule';
  
  /** Unique game identifier (UUID) - empty string for schedule events */
  gameId: string;
  
  /** Data source identifier (always 'nba_api' for this service) */
  source: 'nba_api';
  
  /** API version used */
  version: 'v1';
  
  /** ISO timestamp when the data was fetched */
  fetchedAt: string;
  
  /** SHA256 hash of the JSON payload (for change detection and deduplication) */
  hash: string;
  
  /** Full game data payload (summary or play-by-play JSON) */
  payload: T;
}
