/**
 * Persistence Consumer
 * 
 * Kafka consumer that handles persistence to both Redis cache and PostgreSQL database.
 * Consumes messages from nba.game.updates topic and writes to both storage systems.
 */

import { Kafka, logLevel } from 'kafkajs';
import { cfg } from '../../core/config.js';
import { logger } from '../../core/logger.js';
import { redis } from '../../cache/redisClient.js';
import { KEYS } from '../../cache/keys.js';
import { CACHE_TTL } from '../../core/constants.js';
import { CacheError, DatabaseError } from '../../errors/index.js';
import type { UpdateMessage } from '../../models/messages.js';
import { upsertGame } from '../../db/repositories/games.js';
import { insertGameSummary } from '../../db/repositories/gameSummaries.js';
import { insertPlayByPlay } from '../../db/repositories/playByPlay.js';
import { upsertSchedule } from '../../db/repositories/schedules.js';
import type { Schedule, GameReference, GameSummary, PlayByPlay } from '../../types/api.js';

/**
 * Type guard to check if payload is a schedule payload
 */
function isSchedulePayload(payload: unknown): payload is { date: string; schedule: Schedule; gameIds: string[] } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'date' in payload &&
    'schedule' in payload &&
    typeof (payload as { date: unknown }).date === 'string'
  );
}

/**
 * Type guard to check if payload is a GameSummary
 */
function isGameSummary(payload: unknown): payload is GameSummary {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    'status' in payload &&
    'home' in payload &&
    'away' in payload
  );
}

/**
 * Type guard to check if payload is a PlayByPlay
 */
function isPlayByPlay(payload: unknown): payload is PlayByPlay {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'id' in payload &&
    'events' in payload &&
    Array.isArray((payload as { events: unknown }).events)
  );
}

/**
 * Kafka consumer instance for persistence
 */
const kafka = new Kafka({
  clientId: `${cfg.kafka.clientId}-persistence-consumer`,
  brokers: cfg.kafka.brokers,
  logLevel: logLevel.ERROR
});

export const persistenceConsumer = kafka.consumer({
  groupId: `${cfg.kafka.clientId}-persistence-group`
});

/**
 * Writes game data to Redis cache (existing cache logic)
 */
async function persistToRedis(message: UpdateMessage): Promise<void> {
  const { eventType, gameId, payload, hash, fetchedAt } = message;
  
  try {
  // Handle schedule messages separately
    if (eventType === 'schedule' && isSchedulePayload(payload)) {
    const { date, schedule } = payload;
    const scheduleKey = KEYS.schedule(date);
    const scheduleGamesKey = KEYS.scheduleGames(date);
    
    // Save full schedule JSON (expires after 24 hours)
      await redis.setex(scheduleKey, CACHE_TTL.SCHEDULE_SECONDS, JSON.stringify(schedule));
    
    // Save individual game metadata
    const games = schedule?.games || [];
      const gameIds = games.map((g: GameReference) => g.id).filter(Boolean);
    
    if (gameIds.length > 0) {
      const pipeline = redis.pipeline();
      for (const game of games) {
        if (game.id) {
          const gameMetaKey = KEYS.gameMeta(game.id);
            pipeline.setex(gameMetaKey, CACHE_TTL.SCHEDULE_SECONDS, JSON.stringify(game));
        }
      }
      
      // Add all game IDs to a set
      pipeline.del(scheduleGamesKey);
      pipeline.sadd(scheduleGamesKey, ...gameIds);
        pipeline.expire(scheduleGamesKey, CACHE_TTL.SCHEDULE_SECONDS);
      
      await pipeline.exec();
    }
    
    logger.debug({ date }, 'Schedule persisted to Redis cache');
    return;
  }
  
  // Handle regular game updates (summary/pbp)
  // At this point, eventType can only be 'summary' or 'pbp' (schedules handled above)
  if (eventType !== 'summary' && eventType !== 'pbp') {
    logger.warn({ eventType }, 'Unexpected event type for Redis persistence');
    return;
  }
  
  // Validate payload is an object, not a string (which would indicate a hash)
  if (typeof payload !== 'object' || payload === null) {
    logger.error({ eventType, gameId, payloadType: typeof payload }, 'Invalid payload type for Redis persistence');
    throw new CacheError(`Payload must be an object, got ${typeof payload}`, 'persistToRedis');
  }
  
  const json = JSON.stringify(payload);
  
  // Validate JSON serialization succeeded
  if (!json || json === 'null' || json === 'undefined') {
    logger.error({ eventType, gameId }, 'Failed to serialize payload to JSON');
    throw new CacheError('Failed to serialize payload to JSON', 'persistToRedis');
  }
  
  // Log the first 100 chars of JSON for debugging (without logging full payload)
  logger.debug({ 
    eventType, 
    gameId, 
    jsonPreview: json.substring(0, 100),
    jsonLength: json.length 
  }, 'Storing payload in Redis');
  
  const stateKey = KEYS.state(eventType, gameId);
  
  // Store state in Redis with TTL (minimum 30 seconds)
  const ttl = Math.max(CACHE_TTL.MIN_GAME_STATE_SECONDS, CACHE_TTL.DEFAULT_GAME_STATE_SECONDS);
  await redis.setex(stateKey, ttl, json);
  
  // Verify the stored value (read it back immediately to catch any issues)
  const stored = await redis.get(stateKey);
  if (stored !== json) {
    logger.error({ 
      eventType, 
      gameId, 
      expectedLength: json.length,
      storedLength: stored?.length,
      storedPreview: stored?.substring(0, 100)
    }, 'Redis stored value does not match what we wrote');
    throw new CacheError('Redis stored value verification failed', 'persistToRedis');
  }
  
  logger.debug({ eventType, gameId, key: stateKey }, 'Data persisted to Redis cache');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new CacheError(`Failed to persist to Redis: ${error.message}`, 'persistToRedis', error);
  }
}

/**
 * Writes game data to PostgreSQL database
 */
async function persistToDatabase(message: UpdateMessage): Promise<void> {
  const { eventType, gameId, payload, hash, fetchedAt } = message;

  try {
  // Handle schedule messages
    if (eventType === 'schedule' && isSchedulePayload(payload)) {
    const { date, schedule } = payload;
    
    // Upsert schedule
      await upsertSchedule(date, schedule);
    
    // Also upsert individual game metadata
    if (schedule?.games) {
      for (const game of schedule.games) {
        if (game.id) {
          await upsertGame({
            id: game.id,
            nba_game_id: game.nba_game_id || null, // Store original numeric ID
            scheduled_at: game.scheduled ? new Date(game.scheduled) : null,
            status: game.status || 'scheduled',
            home: game.home,
            away: game.away
          });
        }
      }
    }
    
    logger.debug({ date }, 'Schedule persisted to database');
    return;
  }

    // Persist based on event type
    if (eventType === 'summary' && isGameSummary(payload)) {
      // Ensure game exists in games table
      if (payload.id) {
    await upsertGame({
      id: payload.id,
          scheduled_at: payload.scheduled ? new Date(payload.scheduled) : null,
      status: payload.status || 'unknown',
      home: payload.home ? {
        id: payload.home.id,
        name: payload.home.name,
        alias: payload.home.alias
      } : undefined,
      away: payload.away ? {
        id: payload.away.id,
        name: payload.away.name,
        alias: payload.away.alias
      } : undefined
    });
  }
    await insertGameSummary(gameId, payload, hash, fetchedAt);
    } else if (eventType === 'pbp' && isPlayByPlay(payload)) {
      // Ensure game exists in games table (extract from payload if available)
      if (payload.id) {
        await upsertGame({
          id: payload.id,
          scheduled_at: null,
          status: 'unknown',
          home: undefined,
          away: undefined
        });
      }
    await insertPlayByPlay(gameId, payload, hash, fetchedAt);
  }

  logger.debug({ eventType, gameId, hash }, 'Data persisted to database');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new DatabaseError(`Failed to persist to database: ${error.message}`, 'persistToDatabase', error);
  }
}

/**
 * Processes a single update message and persists to both Redis and PostgreSQL
 */
async function processUpdateMessage(message: UpdateMessage): Promise<void> {
  // Persist to Redis (always - for caching)
  try {
    await persistToRedis(message);
  } catch (err) {
    logger.error({ err, gameId: message.gameId }, 'Failed to persist to Redis, continuing');
    // Continue even if Redis fails
  }

  // Persist to PostgreSQL (if database is configured)
  if (cfg.database?.host) {
    try {
      await persistToDatabase(message);
    } catch (err) {
      logger.error({ err, gameId: message.gameId }, 'Failed to persist to database, continuing');
      // Continue even if database fails - Redis cache still works
    }
  }
}

/**
 * Starts the persistence consumer
 */
export async function startPersistenceConsumer(): Promise<void> {
  await persistenceConsumer.connect();
  logger.info('Persistence consumer connected');

  await persistenceConsumer.subscribe({
    topic: cfg.kafka.topicUpdates,
    fromBeginning: false // Only consume new messages
  });

  await persistenceConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        if (!message.value) {
          logger.warn({ topic, partition }, 'Received message with no value');
          return;
        }

        const updateMessage: UpdateMessage = JSON.parse(message.value.toString());
        await processUpdateMessage(updateMessage);
      } catch (err) {
        logger.error({ err, topic, partition }, 'Error processing persistence message');
        // Continue processing other messages
      }
    }
  });

  logger.info({ topic: cfg.kafka.topicUpdates }, 'Persistence consumer started');
}

/**
 * Stops the persistence consumer gracefully
 */
export async function stopPersistenceConsumer(): Promise<void> {
  await persistenceConsumer.disconnect();
  logger.info('Persistence consumer stopped');
}

