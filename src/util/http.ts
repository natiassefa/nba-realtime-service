/**
 * HTTP Utility Module
 * 
 * Provides HTTP client functionality with support for:
 * - ETag headers for conditional requests
 * - Cache-Control max-age parsing for TTL calculation
 * - Custom headers (e.g., If-None-Match for conditional GET)
 */

import axios from 'axios';
import { ApiError } from '../errors/index.js';
import { logger } from '../core/logger.js';

/**
 * HTTP response structure
 * 
 * @template T - Type of the response data
 */
export interface HttpResponse<T> {
  status: number; // HTTP status code
  data?: T; // Response body (parsed)
  etag?: string; // ETag header value (for conditional requests)
  maxAge?: number; // Cache-Control max-age value in seconds (for TTL calculation)
}

/**
 * Performs an HTTP GET request with support for conditional headers and cache parsing
 * 
 * This function:
 * - Accepts custom headers (e.g., If-None-Match for conditional requests)
 * - Parses Cache-Control header to extract max-age value
 * - Extracts ETag header for future conditional requests
 * - Never throws on HTTP errors (validateStatus: () => true)
 * 
 * @param url - Full URL to request
 * @param headers - Optional headers to include in the request
 * @returns Promise resolving to HttpResponse with status, data, etag, and maxAge
 * 
 * @example
 * // Regular request
 * const res = await httpGet<Schedule>('https://api.example.com/schedule');
 * 
 * @example
 * // Conditional request with ETag
 * const res = await httpGet<Summary>('https://api.example.com/game/123', {
 *   'If-None-Match': 'previous-etag-value'
 * });
 * // Returns 304 if unchanged, 200 with new data if changed
 */
export async function httpGet<T>(url: string, headers: Record<string, string> = {}): Promise<HttpResponse<T>> {
  try {
  const res = await axios.get(url, { headers, validateStatus: () => true });
    
    // Log errors for non-2xx responses
    if (res.status >= 400) {
      logger.warn({ url, status: res.status }, 'HTTP request failed');
    }
  
  // Parse Cache-Control header to extract max-age value
  const cc = res.headers['cache-control'] as string | undefined;
  let maxAge: number | undefined;
  if (cc) {
    const m = cc.match(/max-age=(\d+)/);
    if (m) maxAge = Number(m[1]);
  }
  
  // Extract ETag header for conditional requests
  const etag = res.headers['etag'] as string | undefined;
  
  return { status: res.status, data: res.data as T, etag, maxAge };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw new ApiError(`HTTP request failed: ${error.message}`, url, 0, error);
  }
}
