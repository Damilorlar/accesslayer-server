import { compute24hPriceChange } from '../price.utils';

describe('compute24hPriceChange()', () => {
   it('returns a positive percentage when the price increases (oldest 100, latest 150 → 50.00)', () => {
      expect(compute24hPriceChange(150n, 100n)).toBe(50);
   });

   it('returns a negative percentage when the price decreases (oldest 200, latest 100 → -50.00)', () => {
      expect(compute24hPriceChange(100n, 200n)).toBe(-50);
   });

   it('returns 0 when the price is unchanged (oldest 100, latest 100 → 0.00)', () => {
      expect(compute24hPriceChange(100n, 100n)).toBe(0);
   });

   it('returns 0 when the previous price is zero', () => {
      expect(compute24hPriceChange(100n, 0n)).toBe(0);
   });

   it('rounds fractional result to two decimal places (oldest 3, latest 4 → 33.33)', () => {
      expect(compute24hPriceChange(4n, 3n)).toBe(33.33);
   });
});
