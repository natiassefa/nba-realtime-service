import { describe, it, expect } from 'vitest';
import { isValidDateISO, isValidGameId, isValidUrl, ValidationError } from '../../src/util/validation.js';

describe('validation', () => {
  describe('isValidDateISO', () => {
    it('should validate correct ISO date format', () => {
      expect(isValidDateISO('2025-01-13')).toBe(true);
      expect(isValidDateISO('2024-12-31')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidDateISO('2025/01/13')).toBe(false);
      expect(isValidDateISO('01-13-2025')).toBe(false);
      expect(isValidDateISO('2025-1-13')).toBe(false);
      expect(isValidDateISO('invalid')).toBe(false);
    });

    it('should reject invalid dates', () => {
      // JavaScript Date constructor is lenient, so we need to check if the parsed date matches the input
      const testDate1 = new Date('2025-13-01');
      const testDate2 = new Date('2025-02-30');
      
      // These dates get adjusted by JavaScript, so we check if they're different from what we expect
      // '2025-13-01' becomes '2026-01-01', '2025-02-30' becomes '2025-03-02'
      expect(testDate1.getMonth() + 1).not.toBe(13); // Month is 0-indexed, so +1
      expect(testDate2.getDate()).not.toBe(30);
      
      // Our validation should catch these by checking if the date string matches the parsed date
      // Since JavaScript adjusts them, isValidDateISO should return false for these
      // But actually, JavaScript's Date constructor will parse these and adjust them
      // So we need to validate by checking if the date components match
      expect(isValidDateISO('2025-13-01')).toBe(false); // Invalid month
      expect(isValidDateISO('2025-02-30')).toBe(false); // Invalid day
    });
  });

  describe('isValidGameId', () => {
    it('should validate correct UUID format', () => {
      expect(isValidGameId('a1b2c3d4-e5f6-5678-9abc-def012345678')).toBe(true);
      expect(isValidGameId('00000000-0000-0000-0000-000000000000')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidGameId('not-a-uuid')).toBe(false);
      expect(isValidGameId('12345')).toBe(false);
      expect(isValidGameId('')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(isValidUrl('http://localhost:8000')).toBe(true);
      expect(isValidUrl('https://api.example.com')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('ValidationError', () => {
    it('should create error with message and field', () => {
      const error = new ValidationError('Invalid input', 'fieldName');
      expect(error.message).toBe('Invalid input');
      expect(error.field).toBe('fieldName');
      expect(error.name).toBe('ValidationError');
    });
  });
});

