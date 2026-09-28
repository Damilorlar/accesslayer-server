export type LogFields = Record<string, unknown>;

const TRUNCATE_LIMIT = 500;
const TRUNCATE_SUFFIX = '[TRUNCATED]';

/**
 * Converts a string from camelCase or PascalCase to snake_case.
 */
export function toSnakeCase(key: string): string {
   return key
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
}

/**
 * Formats a value for structured logging according to repository standards:
 * - Date instances are converted to ISO 8601 strings.
 * - Strings exceeding 500 characters are truncated with '[TRUNCATED]' suffix.
 * - Nested objects and arrays are recursively processed.
 */
export function formatLogFieldValue(value: unknown): unknown {
   if (value === null || value === undefined) {
      return value;
   }

   if (value instanceof Date) {
      return value.toISOString();
   }

   if (typeof value === 'string') {
      if (value.length > TRUNCATE_LIMIT) {
         return `${value.slice(0, TRUNCATE_LIMIT)}${TRUNCATE_SUFFIX}`;
      }
      return value;
   }

   if (Array.isArray(value)) {
      return value.map(item => formatLogFieldValue(item));
   }

   if (typeof value === 'object') {
      const formattedObj: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
         formattedObj[toSnakeCase(key)] = formatLogFieldValue(val);
      }
      return formattedObj;
   }

   return value;
}

/**
 * Helper for formatting structured log fields consistently across all server modules.
 *
 * Enforces:
 * - snake_case key naming across all fields
 * - ISO 8601 timestamp string formatting for dates
 * - Truncation of any string value > 500 characters with a [TRUNCATED] suffix
 *
 * @param base - Raw log fields object
 * @returns Standardised log fields record ready for logger emission
 */
export function buildLogFields(base: LogFields): Record<string, unknown> {
   if (!base || typeof base !== 'object') {
      return {};
   }

   const result: Record<string, unknown> = {};
   for (const [key, value] of Object.entries(base)) {
      const snakeKey = toSnakeCase(key);
      result[snakeKey] = formatLogFieldValue(value);
   }

   return result;
}
