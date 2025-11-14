/**
 * Game Poller Service
 * 
 * Handles polling NBA API Bridge endpoints for game data.
 * Implements ETag-based conditional requests, change detection,
 * and publishes updates to Kafka when changes are detected.
 */

import { cfg } from '../core/config.js';
import { logger } from '../core/logger.js';
import { redis } from '../cache/redisClient.js';
import { publishUpdate } from '../bus/kafkaProducer.js';
import { httpGet } from '../util/http.js';
import { nextDelayMs } from '../util/ttlScheduler.js';
import { summaryUrl, pbpUrl } from '../http/nbaApiClient.js';
import { sha256 } from '../util/hash.js';
import { KEYS } from '../cache/keys.js';
import { CACHE_TTL } from '../core/constants.js';
import { isValidGameId, ValidationError } from '../util/validation.js';
import type { GameSummary, PlayByPlay } from '../types/api.js';

/**
 * Polls a single endpoint (summary or play-by-play) for a specific game
 * 
 * This function implements the core polling logic:
 * 1. Uses ETag for conditional requests to avoid unnecessary data transfer
 * 2. Calculates next poll delay based on Cache-Control max-age header
 * 3. Detects changes by comparing SHA256 hashes of the payload
 * 4. Publishes Kafka messages only when data actually changes
 * 
 * @param type - Either 'summary' or 'pbp' (play-by-play)
 * @param gameId - Unique game identifier
 * @returns The delay in milliseconds until the next poll should occur
 */
export async function pollOnce(type: 'summary' | 'pbp', gameId: string): Promise<number> {
  if (!isValidGameId(gameId)) {
    throw new ValidationError(`Invalid game ID format: ${gameId}`, 'gameId');
  }
  
  const url = type === 'summary' ? summaryUrl(gameId) : pbpUrl(gameId);
  const etagKey = KEYS.etag(type, gameId);
  const ttlKey = KEYS.ttl(type, gameId);
  const stateKey = KEYS.state(type, gameId);

  // Retrieve stored ETag for conditional request (If-None-Match header)
  const etag = await redis.get(etagKey);
  const headers: Record<string, string> = {};
  if (etag) headers['If-None-Match'] = etag;

  // Make HTTP request with conditional headers
  const res = await httpGet<GameSummary | PlayByPlay>(url, headers);
  
  // Calculate next poll delay based on Cache-Control max-age or base interval
  const delayMs = nextDelayMs(cfg.polling.baseIntervalMs, res.maxAge);
  
  // Store the calculated delay in Redis (expires when delay elapses)
  await redis.setex(ttlKey, Math.ceil(delayMs / 1000), String(delayMs));

  // Handle 304 Not Modified response (no change since last request)
  if (res.status === 304) {
    logger.debug({ type, gameId, delayMs }, 'not modified');
    return delayMs;
  }
  
  // Handle non-200 responses
  if (res.status !== 200 || !res.data) {
    logger.warn({ type, gameId, status: res.status, delayMs }, 'fetch failed');
    return delayMs;
  }

  // Store new ETag for future conditional requests
  if (res.etag) await redis.set(etagKey, res.etag);
  
  // Calculate hash of current payload to detect changes
  const payload = res.data;
  const json = JSON.stringify(payload);
  const hash = sha256(json);

  // Compare with previous state to detect actual changes
  const previous = await redis.get(stateKey);
  if (previous) {
    const prevHash = sha256(previous);
    if (prevHash === hash) {
      // No change detected - payload is identical to previous state
      logger.debug({ type, gameId, delayMs }, 'no change');
      return delayMs;
    }
  }

  // Store new state in Redis with TTL (minimum 30 seconds)
  await redis.setex(stateKey, Math.max(CACHE_TTL.MIN_GAME_STATE_SECONDS, Math.ceil(delayMs / 1000)), json);

  // Publish update message to Kafka
  const msg = {
    eventType: type,
    gameId,
    source: 'nba_api',
    version: 'v1',
    fetchedAt: new Date().toISOString(),
    hash,
    payload
  };
  await publishUpdate(`${type}:${gameId}`, msg);
  logger.info({ type, gameId, delayMs }, 'update published');

  return delayMs;
}

/**
 * Continuously polls both summary and play-by-play endpoints for a single game
 * 
 * This function runs two polling loops in parallel:
 * - Summary endpoint: Game statistics, scores, status
 * - Play-by-play endpoint: Detailed event-by-event game actions
 * 
 * Each endpoint maintains its own delay schedule based on Cache-Control headers,
 * and polls independently when its delay expires. This allows summary and pbp
 * to be polled at different rates based on their respective TTLs.
 * 
 * @param gameId - Unique game identifier to poll
 * @param signal - AbortSignal to gracefully stop polling on shutdown
 */
export async function pollGame(gameId: string, signal: AbortSignal): Promise<void> {
  if (!isValidGameId(gameId)) {
    throw new ValidationError(`Invalid game ID format: ${gameId}`, 'gameId');
  }
  
  // Track delays for each endpoint independently
  let delaySummary = cfg.polling.baseIntervalMs;
  let delayPbp = cfg.polling.baseIntervalMs;

  while (!signal.aborted) {
    // Poll both endpoints in parallel
    const [summaryDelay, pbpDelay] = await Promise.all([
      pollOnce('summary', gameId),
      pollOnce('pbp', gameId)
    ]);
    
    // Update delays for next iteration
    delaySummary = summaryDelay;
    delayPbp = pbpDelay;
    
    // Sleep until the next poll time (shortest delay)
    const sleepMs = Math.min(delaySummary, delayPbp);
    await new Promise(r => setTimeout(r, sleepMs));
  }
}

