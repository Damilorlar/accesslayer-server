import { logger } from './logger.utils';

/**
 * Shared state for tracking rate limit thresholds per wallet per window.
 * Key format: `${walletAddress}:${windowStart}`
 * Value: { requestCount, thresholdsLogged: Set<'80%' | '100%'> }
 */
const rateLimitState = new Map<
   string,
   { requestCount: number; thresholdsLogged: Set<'80%' | '100%'> }
>();

import { truncateWallet } from './wallet-display.utils';

/**
 * Emits warn logs when a wallet's request count crosses 80% or 100% of the rate limit.
 *
 * - Logs are emitted once per threshold per window
 * - Wallet address is truncated in the log
 * - Includes all required fields: wallet_address, request_count, limit, window_reset_at, threshold
 *
 * @param walletAddress - The wallet address making the request
 * @param requestCount - Current request count within the window
 * @param limit - The rate limit (max requests per window)
 * @param windowResetAt - ISO timestamp when the current window resets
 */
export function checkRateLimitThresholds(
   walletAddress: string,
   requestCount: number,
   limit: number,
   windowResetAt: Date
): void {
   if (!walletAddress || requestCount <= 0 || limit <= 0) {
      return;
   }

   // Create a key that includes the window reset time to allow fresh thresholds per window
   const windowKey = `${walletAddress}:${windowResetAt.getTime()}`;

   // Get or initialize tracking state for this wallet+window
   let state = rateLimitState.get(windowKey);
   if (!state) {
      state = { requestCount, thresholdsLogged: new Set() };
      rateLimitState.set(windowKey, state);
   }
   state.requestCount = requestCount;

   const percentage = (requestCount / limit) * 100;
   const truncatedAddress = truncateWallet(walletAddress);

   // Check 80% threshold
   if (percentage >= 80 && !state.thresholdsLogged.has('80%')) {
      state.thresholdsLogged.add('80%');
      logger.warn(
         {
            wallet_address: truncatedAddress,
            request_count: requestCount,
            limit,
            window_reset_at: windowResetAt.toISOString(),
            threshold: '80%',
         },
         'Wallet approaching rate limit (80% of limit)'
      );
   }

   // Check 100% threshold
   if (percentage >= 100 && !state.thresholdsLogged.has('100%')) {
      state.thresholdsLogged.add('100%');
      logger.warn(
         {
            wallet_address: truncatedAddress,
            request_count: requestCount,
            limit,
            window_reset_at: windowResetAt.toISOString(),
            threshold: '100%',
         },
         'Wallet hit rate limit (100% of limit)'
      );
   }
}

/**
 * Cleans up old tracking state to prevent memory leaks.
 * Should be called periodically or when windows reset.
 *
 * @param olderThanTime - Remove entries older than this timestamp (ms)
 */
export function cleanupRateLimitState(olderThanTime: number): void {
   for (const [key] of rateLimitState.entries()) {
      // Key format: `${walletAddress}:${windowStart}`
      const windowStart = Number(key.split(':').pop());
      if (windowStart < olderThanTime) {
         rateLimitState.delete(key);
      }
   }
}

/**
 * Resets all tracking state (useful for testing).
 */
export function resetRateLimitState(): void {
   rateLimitState.clear();
}
