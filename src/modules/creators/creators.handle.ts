// src/modules/creators/creators.handle.ts
// Helper for normalizing creator handles before use in API responses or lookups.

/**
 * Normalize a creator handle for consistent storage and lookup.
 *
 * - Trims leading/trailing whitespace
 * - Converts to lowercase
 * - Collapses internal whitespace to a single underscore
 * - Strips characters that are not alphanumeric, hyphens, or underscores
 *
 * Repeated calls with the same input always return the same result (idempotent).
 *
 * @param handle - Raw handle input
 * @returns Normalized handle string
 *
 * @example
 * normalizeCreatorHandle('  JazzKing  ')  // 'jazzking'
 * normalizeCreatorHandle('Jazz King')     // 'jazz_king'
 * normalizeCreatorHandle('Jazz--King')    // 'jazz--king' → 'jazz-king'
 * normalizeCreatorHandle('Jazz__King')    // 'jazz__king' → 'jazz_king'
 */
export function normalizeCreatorHandle(handle: string): string {
   return handle
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_') // internal spaces → underscore
      .replace(/[^a-z0-9_-]/g, '') // strip unsupported characters
      .replace(/-{2,}/g, '-') // collapse consecutive hyphens
      .replace(/_{2,}/g, '_'); // collapse consecutive underscores
}
