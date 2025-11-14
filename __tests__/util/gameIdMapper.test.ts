import { describe, it, expect } from 'vitest';
import { nbaGameIdToUuid } from '../../src/util/gameIdMapper.js';

describe('gameIdMapper', () => {
  describe('nbaGameIdToUuid', () => {
    it('should generate deterministic UUIDs', () => {
      const gameId = '0022300123';
      const uuid1 = nbaGameIdToUuid(gameId);
      const uuid2 = nbaGameIdToUuid(gameId);
      
      expect(uuid1).toBe(uuid2);
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate different UUIDs for different game IDs', () => {
      const uuid1 = nbaGameIdToUuid('0022300123');
      const uuid2 = nbaGameIdToUuid('0022300124');
      
      expect(uuid1).not.toBe(uuid2);
    });
  });
});

