import { describe, it, expect } from 'vitest';
import { CACHE_TTL, POLLING_DELAYS, HEALTH_CHECK } from '../src/core/constants.js';

describe('constants', () => {
  it('should have all required cache TTL values', () => {
    expect(CACHE_TTL.SCHEDULE_SECONDS).toBe(86400);
    expect(CACHE_TTL.MIN_GAME_STATE_SECONDS).toBe(30);
    expect(CACHE_TTL.DEFAULT_GAME_STATE_SECONDS).toBe(60);
  });

  it('should have all required polling delays', () => {
    expect(POLLING_DELAYS.MIN_MS).toBe(10000);
  });

  it('should have all required health check values', () => {
    expect(HEALTH_CHECK.MAX_RETRIES).toBe(30);
    expect(HEALTH_CHECK.RETRY_DELAY_MS).toBe(2000);
    expect(HEALTH_CHECK.CONNECTION_TIMEOUT_MS).toBe(1000);
  });
});

