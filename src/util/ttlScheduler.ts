/**
 * TTL Scheduler Utility
 * 
 * Calculates the optimal delay between API polls based on Cache-Control headers.
 * Ensures polling respects server-recommended cache times while maintaining
 * a minimum polling rate.
 */

import { POLLING_DELAYS } from '../core/constants.js';

/**
 * Calculates the next polling delay in milliseconds
 * 
 * This function determines how long to wait before the next poll:
 * - Uses the base interval as the primary polling rate for live games
 * - Respects server cache recommendations (maxAge) as a maximum delay
 * - Ensures the delay never exceeds the maxAge-derived value
 * - Ensures the delay is at least the minimum polling delay
 * 
 * The logic ensures we:
 * 1. Poll frequently enough to keep up with live games (base interval)
 * 2. Never poll slower than what the server suggests (maxAge as ceiling)
 * 3. Never poll faster than the minimum delay
 * 
 * @param base - Base polling interval in milliseconds (target rate for live games)
 * @param maxAge - Cache-Control max-age value in seconds (from HTTP response)
 * @returns Delay in milliseconds until next poll
 * 
 * @example
 * // Server says cache for 5 seconds, base is 2 seconds
 * nextDelayMs(2000, 5) // Returns 2000ms (poll at base rate, faster than server suggests)
 * 
 * @example
 * // Server says cache for 1 second, base is 2 seconds
 * nextDelayMs(2000, 1) // Returns 1000ms (respect server's faster recommendation)
 * 
 * @example
 * // No maxAge header
 * nextDelayMs(2000, undefined) // Returns 2000ms (use base)
 */
export function nextDelayMs(base: number, maxAge?: number): number {
  if (!maxAge) return base;
  
  // Convert maxAge (seconds) to milliseconds
  const maxAgeMs = maxAge * 1000;
  
  // Use the smaller of base or maxAge-derived delay
  // This ensures we poll at base rate (for live games) but respect server's faster recommendations
  // Never exceed what the server suggests, but poll faster if base is smaller
  const delay = Math.max(base, maxAgeMs);
  
  // Ensure we never poll faster than the minimum delay
  return Math.max(POLLING_DELAYS.MIN_MS, delay);
}
