/**
 * Hash Utility Module
 * 
 * Provides cryptographic hashing functions for change detection.
 * Used to compare game state snapshots without storing full payloads.
 */

import crypto from 'crypto';

/**
 * Generates SHA256 hash of input data
 * 
 * Used to detect changes in game data by comparing hash values.
 * If the hash of new data matches the hash of previous data,
 * the content is identical and no update needs to be published.
 * 
 * @param data - String data to hash (typically JSON stringified game state)
 * @returns Hexadecimal hash string (64 characters)
 * 
 * @example
 * const json = JSON.stringify(gameData);
 * const hash = sha256(json);
 * // Compare with previous hash to detect changes
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
