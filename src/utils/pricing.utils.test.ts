import { computeBuyCost } from './pricing.utils';

describe('computeBuyCost', () => {
   it('amount 1 at supply 0 returns base cost only', () => {
      // 10_000_000n base + 0
      const cost = computeBuyCost(0, 1, 0);
      expect(cost).toBe(10_000_000n);
   });

   it('amount 5 at supply 10 calculates correct base cost without fees', () => {
      const cost = computeBuyCost(10, 5, 0);
      // Cost of each key: 
      // 10: 10_000_000 + 10_000_000 = 20_000_000
      // 11: 10_000_000 + 11_000_000 = 21_000_000
      // 12: 10_000_000 + 12_000_000 = 22_000_000
      // 13: 10_000_000 + 13_000_000 = 23_000_000
      // 14: 10_000_000 + 14_000_000 = 24_000_000
      // sum = 110_000_000n
      expect(cost).toBe(110_000_000n);
   });

   it('includes protocol fee correctly', () => {
      // fee = 100 bps (1%)
      // Cost at 0 for 1 key is 10,000,000. 1% is 100,000. Total = 10,100,000
      const cost = computeBuyCost(0, 1, 100);
      expect(cost).toBe(10_100_000n);
   });

   it('never returns a negative value for any valid input', () => {
      const cost = computeBuyCost(100, 0, 500);
      expect(cost).toBeGreaterThanOrEqual(0n);
   });
});
