/**
 * Sensitive field masking utility for structured log writes.
 *
 * Prevents callback URLs, wallet addresses, and other sensitive values from
 * appearing in plain text in log output. Any key matching the sensitive key
 * list has its value replaced with `[REDACTED]` before the object is passed
 * to a logger call.
 *
 * Masking is applied recursively so nested objects are also sanitised.
 */

/**
 * Field names that must never appear in plain text in log output.
 *
 * Matching is case-insensitive exact key comparison.
 * Add new names here when introducing log context that carries sensitive data.
 */
const SENSITIVE_KEYS = new Set([
   'url',
   'callback',
   'address',
   'webhook_url',
   'recipient',
]);

/**
 * Returns true when the given key should be redacted.
 */
function isSensitiveKey(key: string): boolean {
   return SENSITIVE_KEYS.has(key.toLowerCase());
}

/**
 * Returns a deep copy of `obj` with every sensitive field value replaced by
 * the string `'[REDACTED]'`.
 *
 * Rules:
 * - Keys matching the sensitive list → value set to `'[REDACTED]'` (regardless of depth)
 * - Non-sensitive keys → value left unchanged
 * - Nested plain objects → recursed into
 * - Arrays → each element recursed into
 * - Primitives / null / undefined → returned as-is
 *
 * The original object is never mutated.
 *
 * @example
 * maskSensitive({ url: 'https://secret.example.com', count: 5 })
 * // → { url: '[REDACTED]', count: 5 }
 *
 * maskSensitive({ nested: { address: 'GABC...', label: 'wallet' } })
 * // → { nested: { address: '[REDACTED]', label: 'wallet' } }
 */
export function maskSensitive(
   obj: Record<string, unknown>
): Record<string, unknown> {
   return maskValue(obj) as Record<string, unknown>;
}

function maskValue(value: unknown): unknown {
   if (value === null || value === undefined) {
      return value;
   }

   if (Array.isArray(value)) {
      return value.map(item => maskValue(item));
   }

   if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
         value as Record<string, unknown>
      )) {
         result[key] = isSensitiveKey(key) ? '[REDACTED]' : maskValue(val);
      }
      return result;
   }

   return value;
}
