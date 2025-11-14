/**
 * Game ID Mapper Utility
 * 
 * Maps NBA.com numeric game IDs to deterministic UUIDs using UUID v5.
 * This ensures consistent UUID generation for the same NBA.com game ID.
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

/**
 * Namespace UUID for NBA game IDs
 * Generated once and used consistently for all game ID mappings
 * This ensures UUIDs are deterministic and unique to our application
 */
const NBA_GAME_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // UUID v4 namespace for NBA games

/**
 * Converts a UUID string to a buffer (for UUID v5 generation)
 */
function uuidToBuffer(uuid: string): Buffer {
  // Remove dashes and convert hex string to buffer
  const hex = uuid.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

/**
 * Converts a buffer to UUID string format
 */
function bufferToUuid(buffer: Buffer): string {
  const hex = buffer.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

/**
 * Generates a deterministic UUID v5 from NBA.com numeric game ID
 * 
 * UUID v5 uses SHA-1 hashing with a namespace UUID to generate
 * deterministic UUIDs. The same input always produces the same UUID.
 * 
 * @param nbaGameId - NBA.com numeric game ID (e.g., "0022300123")
 * @returns UUID string (e.g., "a1b2c3d4-e5f6-5678-9abc-def012345678")
 * 
 * @example
 * nbaGameIdToUuid("0022300123")
 * // Returns: "a1b2c3d4-e5f6-5678-9abc-def012345678" (deterministic)
 */
export function nbaGameIdToUuid(nbaGameId: string): string {
  // Normalize input (remove any whitespace, ensure string)
  const normalizedId = String(nbaGameId).trim();
  
  if (!normalizedId) {
    throw new Error('NBA game ID cannot be empty');
  }
  
  // Create namespace buffer
  const namespace = uuidToBuffer(NBA_GAME_ID_NAMESPACE);
  
  // Create name buffer (NBA game ID as UTF-8)
  const name = Buffer.from(normalizedId, 'utf8');
  
  // Create SHA-1 hash of namespace + name
  const hash = createHash('sha1');
  hash.update(namespace);
  hash.update(name);
  const hashBuffer = hash.digest();
  
  // Convert to UUID v5 format
  // Set version (5) and variant bits according to RFC 4122
  hashBuffer[6] = (hashBuffer[6] & 0x0f) | 0x50; // Version 5
  hashBuffer[8] = (hashBuffer[8] & 0x3f) | 0x80; // Variant 10
  
  return bufferToUuid(hashBuffer);
}

/**
 * Validates if a string is a valid UUID format
 * 
 * @param uuid - String to validate
 * @returns true if valid UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Checks if a string looks like an NBA.com numeric game ID
 * 
 * NBA.com game IDs are typically 10-digit strings (e.g., "0022300123")
 * 
 * @param id - String to check
 * @returns true if looks like NBA game ID
 */
export function isNbaGameId(id: string): boolean {
  // NBA.com game IDs are typically 10-digit numeric strings
  return /^\d{10}$/.test(id);
}

/**
 * Converts a UUID back to NBA.com game ID (if it was generated from one)
 * 
 * Note: This is a one-way operation - we can't reverse the hash.
 * This function would need a lookup table or the UUID would need to
 * encode the original ID. For now, we'll store the mapping in the
 * database or use a different approach.
 * 
 * @deprecated This is not possible without a mapping table
 */
export function uuidToNbaGameId(uuid: string): string | null {
  // This is not possible without storing a mapping
  // We'll need to store the original NBA game ID in the database
  return null;
}

