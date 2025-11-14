/**
 * Validation Utilities
 * 
 * Functions for validating external inputs to prevent invalid data
 * from propagating through the system.
 */

export { ValidationError } from '../errors/index.js';

/**
 * Validates a date string in ISO format (YYYY-MM-DD)
 * 
 * @param dateISO - Date string to validate
 * @returns True if valid, false otherwise
 */
export function isValidDateISO(dateISO: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateISO)) {
    return false;
  }
  
  // Parse the date components to validate they're actually valid
  const [year, month, day] = dateISO.split('-').map(Number);
  
  // Create a date object and check if the components match (JavaScript Date is lenient)
  const date = new Date(year, month - 1, day);
  
  // Check if the date is valid and matches the input components
  // This catches cases like '2025-13-01' (becomes 2026-01-01) or '2025-02-30' (becomes 2025-03-02)
  return (
    date instanceof Date &&
    !isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Validates a game ID (UUID format)
 * 
 * @param gameId - Game ID to validate
 * @returns True if valid UUID format, false otherwise
 */
export function isValidGameId(gameId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(gameId);
}

/**
 * Validates a URL string
 * 
 * @param url - URL to validate
 * @returns True if valid URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

