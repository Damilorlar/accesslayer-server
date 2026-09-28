import {
   MAX_PAGE_SIZE,
   MIN_PAGE_SIZE,
} from '../constants/pagination.constants';

/**
 * Error thrown when page size exceeds the maximum allowed limit.
 */
export class PageSizeExceededError extends Error {
   constructor(limit: number, maxLimit: number = MAX_PAGE_SIZE) {
      super(`Page size limit (${limit}) exceeds maximum allowed (${maxLimit})`);
      this.name = 'PageSizeExceededError';
   }
}

/**
 * Error thrown when page size is below the minimum allowed limit.
 */
export class PageSizeTooSmallError extends Error {
   constructor(limit: number, minLimit: number = MIN_PAGE_SIZE) {
      super(
         `Page size limit (${limit}) is below minimum allowed (${minLimit})`
      );
      this.name = 'PageSizeTooSmallError';
   }
}

/**
 * Validates that a page size limit is within allowed bounds.
 *
 * @param limit - The page size limit to validate
 * @param options - Optional configuration for custom min/max values
 * @returns The validated limit (unchanged)
 * @throws {PageSizeExceededError} If limit exceeds maximum
 * @throws {PageSizeTooSmallError} If limit is below minimum
 *
 * @example
 * // Basic usage with default bounds
 * validatePageSize(50); // returns 50
 * validatePageSize(150); // throws PageSizeExceededError
 *
 * @example
 * // Custom bounds
 * validatePageSize(30, { max: 50 }); // returns 30
 */
export function validatePageSize(
   limit: number,
   options: { min?: number; max?: number } = {}
): number {
   const min = options.min ?? MIN_PAGE_SIZE;
   const max = options.max ?? MAX_PAGE_SIZE;

   if (limit < min) {
      throw new PageSizeTooSmallError(limit, min);
   }

   if (limit > max) {
      throw new PageSizeExceededError(limit, max);
   }

   return limit;
}

/**
 * Clamps a page size limit to the allowed range.
 *
 * Unlike validatePageSize, this function will not throw errors.
 * Instead, it returns a clamped value within the valid range.
 *
 * @param limit - The page size limit to clamp
 * @param options - Optional configuration for custom min/max values
 * @returns The clamped limit within valid range
 *
 * @example
 * // Basic usage
 * clampPageSize(150); // returns 100
 * clampPageSize(0); // returns 1
 * clampPageSize(50); // returns 50
 *
 * @example
 * // Custom bounds
 * clampPageSize(200, { max: 50 }); // returns 50
 */
export function clampPageSize(
   limit: number,
   options: { min?: number; max?: number } = {}
): number {
   const min = options.min ?? MIN_PAGE_SIZE;
   const max = options.max ?? MAX_PAGE_SIZE;

   return Math.max(min, Math.min(limit, max));
}
