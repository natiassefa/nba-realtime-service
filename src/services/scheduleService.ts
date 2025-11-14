/**
 * Schedule Service
 * 
 * Handles fetching NBA game schedules from NBA API Bridge and persisting
 * schedule information to Redis for quick access and tracking.
 */

import { logger } from '../core/logger.js';
import { redis } from '../cache/redisClient.js';
import { httpGet } from '../util/http.js';
import { scheduleUrl } from '../http/nbaApiClient.js';
import { KEYS } from '../cache/keys.js';
import { publishUpdate } from '../bus/kafkaProducer.js';
import { sha256 } from '../util/hash.js';
import { CACHE_TTL } from '../core/constants.js';
import { isValidDateISO, ValidationError } from '../util/validation.js';
import { ApiError, CacheError, KafkaError } from '../errors/index.js';
import type { Schedule } from '../types/api.js';

/**
 * Fetches the NBA schedule for a given date from NBA API Bridge and persists it to Redis
 * 
 * Saves to Redis:
 * - Full schedule JSON: `schedule:{dateISO}`
 * - Individual game metadata: `game:meta:{gameId}` (for each game)
 * - Set of game IDs: `schedule:games:{dateISO}` (for quick iteration)
 * 
 * @param dateISO - Date in ISO format (YYYY-MM-DD)
 * @returns Array of game IDs for the specified date
 */
export async function fetchSchedule(dateISO: string): Promise<string[]> {
  if (!isValidDateISO(dateISO)) {
    throw new ValidationError(`Invalid date format: ${dateISO}. Expected YYYY-MM-DD`, 'dateISO');
  }
  
  const url = scheduleUrl(dateISO);
  
  let res;
  try {
    res = await httpGet<Schedule>(url);
  } catch (err) {
    if (err instanceof ApiError) {
      logger.error({ err, url }, 'Failed to fetch schedule');
      throw err;
    }
    throw new ApiError(`Unexpected error fetching schedule: ${err}`, url, 0, err instanceof Error ? err : undefined);
  }
  
  if (res.status !== 200 || !res.data) {
    logger.warn({ status: res.status, url }, 'schedule fetch failed');
    return [];
  }
  
  const schedule = res.data;
  const games = schedule.games || [];
  const gameIds = games.map((g) => g.id).filter(Boolean);
  
  // Use the date from the schedule response if available, otherwise use the requested dateISO
  // This ensures we store using the date the API actually returned
  const scheduleDate = schedule.date || dateISO;
  
  if (scheduleDate !== dateISO) {
    logger.warn({ requestedDate: dateISO, scheduleDate }, 'Schedule response date differs from requested date');
  }
  
  if (gameIds.length === 0) {
    logger.debug({ dateISO: scheduleDate }, 'no games in schedule');
    return [];
  }
  
  // Persist schedule data to Redis using the schedule's actual date
  try {
    const scheduleKey = KEYS.schedule(scheduleDate);
    const scheduleGamesKey = KEYS.scheduleGames(scheduleDate);
    
    // Save full schedule JSON (expires after 24 hours)
    await redis.setex(scheduleKey, CACHE_TTL.SCHEDULE_SECONDS, JSON.stringify(schedule));
    
    // Save individual game metadata for quick lookup
    const pipeline = redis.pipeline();
    for (const game of games) {
      if (game.id) {
        const gameMetaKey = KEYS.gameMeta(game.id);
        pipeline.setex(gameMetaKey, CACHE_TTL.SCHEDULE_SECONDS, JSON.stringify(game));
      }
    }
    
    // Add all game IDs to a set for quick iteration
    if (gameIds.length > 0) {
      pipeline.del(scheduleGamesKey); // Clear existing set
      pipeline.sadd(scheduleGamesKey, ...gameIds);
      pipeline.expire(scheduleGamesKey, CACHE_TTL.SCHEDULE_SECONDS); // Expire after 24 hours
    }
    
    await pipeline.exec();
    
    logger.info({ dateISO: scheduleDate, gameCount: gameIds.length }, 'schedule persisted to Redis');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err, dateISO: scheduleDate }, 'failed to persist schedule to Redis');
    throw new CacheError(`Failed to persist schedule to Redis: ${error.message}`, 'setex', error);
  }

  // Publish schedule to Kafka for persistence consumer to handle
  try {
    const schedulePayload = {
      date: scheduleDate, // Use the schedule's actual date
      schedule,
      gameIds
    };
    const hash = sha256(JSON.stringify(schedulePayload));
    
    const scheduleMessage = {
      eventType: 'schedule' as const,
      gameId: '', // Not applicable for schedules
      source: 'nba_api' as const,
      version: 'v1' as const,
      fetchedAt: new Date().toISOString(),
      hash,
      payload: schedulePayload
    };
    await publishUpdate(`schedule:${scheduleDate}`, scheduleMessage);
    logger.debug({ dateISO: scheduleDate }, 'Schedule published to Kafka');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error({ err, dateISO: scheduleDate }, 'Failed to publish schedule to Kafka');
    throw new KafkaError(`Failed to publish schedule: ${error.message}`, 'publishUpdate', error);
  }
  
  return gameIds;
}

