const STROOPS_PER_XLM = 10_000_000n;

/**
 * Formats a bigint stroop amount as a signed XLM delta string for
 * transaction history display (e.g. '+12.5000000 XLM' or '-3.0000000 XLM').
 *
 * Uses bigint arithmetic throughout so large stroop values never lose
 * precision through floating-point conversion.
 *
 * @param stroops - The absolute amount, in stroops, as a non-negative bigint
 * @param direction - 'in' for incoming XLM (e.g. a sell), 'out' for outgoing XLM (e.g. a buy)
 * @returns A signed, fixed 7-decimal XLM string, e.g. '+1.0000000 XLM'
 */
export function formatXlmDelta(
   stroops: bigint,
   direction: 'in' | 'out'
): string {
   if (typeof stroops !== 'bigint') {
      throw new TypeError('stroops must be a bigint');
   }

   const absStroops = stroops < 0n ? -stroops : stroops;
   const sign = direction === 'in' ? '+' : '-';

   const whole = absStroops / STROOPS_PER_XLM;
   const fraction = absStroops % STROOPS_PER_XLM;
   const fractionStr = fraction.toString().padStart(7, '0');

   return `${sign}${whole.toString()}.${fractionStr} XLM`;
}
