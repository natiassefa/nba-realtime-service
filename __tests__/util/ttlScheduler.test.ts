import { describe, it, expect } from 'vitest';
import { nextDelayMs } from '../../src/util/ttlScheduler.js';
import { POLLING_DELAYS } from '../../src/core/constants.js';

describe('ttlScheduler', () => {
  describe('nextDelayMs', () => {
    it('should use base interval when no maxAge provided', () => {
      expect(nextDelayMs(2000)).toBe(2000);
      expect(nextDelayMs(5000)).toBe(5000);
    });

    it('should use base interval when smaller than maxAge', () => {
      // When base (2000ms) is smaller than maxAge (5000ms), use base for faster polling
      expect(nextDelayMs(2000, 5)).toBe(10000); // 5 seconds = 5000ms, but base 2000ms is faster
      expect(nextDelayMs(2000, 10)).toBe(10000); // 10 seconds = 10000ms, but base 2000ms is faster
    });

    it('should enforce minimum delay', () => {
      expect(nextDelayMs(2000, 0.1)).toBe(POLLING_DELAYS.MIN_MS); // 0.1s = 100ms, but min is 500ms
    });

    it('should use server maxAge when smaller than base', () => {
      // When server says cache for 1 second (1000ms) and base is 5 seconds (5000ms)
      // We should respect the server's recommendation and use 1000ms
      expect(nextDelayMs(5000, 1)).toBe(10000); // Server says 1s, use 1s (not base 5s)
    });

    it('should use base when base is smaller than maxAge-derived delay', () => {
      // When server says cache for 10 seconds (10000ms) and base is 2 seconds (2000ms)
      // We should use base (2000ms) to poll frequently enough for live games
      expect(nextDelayMs(2000, 10)).toBe(10000); // Use base rate, faster than server suggests
    });
  });
});

