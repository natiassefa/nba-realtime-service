/**
 * Application Constants
 * 
 * Centralized location for all magic numbers and configuration constants.
 * Makes the code more maintainable and self-documenting.
 */

/**
 * Cache TTL values (in seconds)
 */
export const CACHE_TTL = {
  /** Schedule data expires after 24 hours */
  SCHEDULE_SECONDS: 86400,
  
  /** Minimum TTL for game state cache (30 seconds) */
  MIN_GAME_STATE_SECONDS: 30,
  
  /** Default TTL for game state cache (60 seconds) */
  DEFAULT_GAME_STATE_SECONDS: 60,
} as const;

/**
 * Polling delays (in milliseconds)
 */
export const POLLING_DELAYS = {
  /** Minimum polling delay (500ms) - prevents excessive requests */
  MIN_MS: 10000,
} as const;

/**
 * Service health check configuration
 */
export const HEALTH_CHECK = {
  /** Maximum retries for service health checks */
  MAX_RETRIES: 30,
  
  /** Delay between retries (2 seconds) */
  RETRY_DELAY_MS: 2000,
  
  /** Connection timeout for health checks (1 second) */
  CONNECTION_TIMEOUT_MS: 1000,
} as const;

