/**
 * NBA API Client Module
 * 
 * Constructs URLs for NBA API Bridge service endpoints.
 * The bridge service wraps nba_api Python library and runs in the same container.
 * Responses match a standardized API format for compatibility.
 */

import { cfg } from '../core/config.js';
import { isValidUrl, isValidDateISO, isValidGameId, ValidationError } from '../util/validation.js';

/**
 * Constructs the base URL for NBA API Bridge service
 * 
 * Format: {bridgeUrl}
 * Default: http://localhost:8000 (runs in same container)
 * 
 * @returns Base URL string
 * @throws ValidationError if bridge URL is invalid
 */
function baseUrl() {
  const url = cfg.nbaApi.bridgeUrl;
  if (!isValidUrl(url)) {
    throw new ValidationError(`Invalid bridge URL: ${url}`, 'bridgeUrl');
  }
  return url;
}

/**
 * Constructs URL for fetching daily game schedule
 * 
 * Endpoint: /schedule/{year}/{month}/{day}
 * Matches standard API endpoint structure.
 * 
 * @param dateISO - Date in ISO format (YYYY-MM-DD)
 * @returns Full URL
 * 
 * @example
 * scheduleUrl('2025-01-15')
 * // Returns: http://localhost:8000/schedule/2025/01/15
 */
export function scheduleUrl(dateISO: string) {
  if (!isValidDateISO(dateISO)) {
    throw new ValidationError(`Invalid date format: ${dateISO}`, 'dateISO');
  }
  const [y, m, d] = dateISO.split('-');
  return `${baseUrl()}/schedule/${y}/${m}/${d}`;
}

/**
 * Constructs URL for fetching game summary
 * 
 * Endpoint: /games/{gameId}/summary
 * 
 * Game summary includes: scores, statistics, game status, team information.
 * Matches standard API format.
 * 
 * @param gameId - Game identifier (UUID from schedule, or NBA.com numeric ID)
 * @returns Full URL
 * 
 * @example
 * summaryUrl('a1b2c3d4-e5f6-5678-9abc-def012345678')
 * // Returns: http://localhost:8000/games/a1b2c3d4-e5f6-5678-9abc-def012345678/summary
 */
export function summaryUrl(gameId: string) {
  if (!isValidGameId(gameId)) {
    throw new ValidationError(`Invalid game ID format: ${gameId}`, 'gameId');
  }
  return `${baseUrl()}/games/${gameId}/summary`;
}

/**
 * Constructs URL for fetching play-by-play data
 * 
 * Endpoint: /games/{gameId}/pbp
 * 
 * Play-by-play includes: detailed event-by-event game actions, timestamps, player actions.
 * Matches standard API format.
 * 
 * @param gameId - Game identifier (UUID from schedule, or NBA.com numeric ID)
 * @returns Full URL
 * 
 * @example
 * pbpUrl('a1b2c3d4-e5f6-5678-9abc-def012345678')
 * // Returns: http://localhost:8000/games/a1b2c3d4-e5f6-5678-9abc-def012345678/pbp
 */
export function pbpUrl(gameId: string) {
  if (!isValidGameId(gameId)) {
    throw new ValidationError(`Invalid game ID format: ${gameId}`, 'gameId');
  }
  return `${baseUrl()}/games/${gameId}/pbp`;
}

