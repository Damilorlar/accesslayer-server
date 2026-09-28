import { formatXlmDelta } from './xlm-delta.utils';

describe('formatXlmDelta', () => {
   it('formats an "in" delta with a positive sign', () => {
      expect(formatXlmDelta(10_000_000n, 'in')).toBe('+1.0000000 XLM');
   });

   it('formats an "out" delta with a negative sign', () => {
      expect(formatXlmDelta(10_000_000n, 'out')).toBe('-1.0000000 XLM');
   });

   it('formats a zero-stroop "in" delta', () => {
      expect(formatXlmDelta(0n, 'in')).toBe('+0.0000000 XLM');
   });

   it('formats a zero-stroop "out" delta', () => {
      expect(formatXlmDelta(0n, 'out')).toBe('-0.0000000 XLM');
   });

   it('formats sub-XLM stroop amounts with full precision', () => {
      expect(formatXlmDelta(1_234_567n, 'in')).toBe('+0.1234567 XLM');
   });

   it('formats large stroop amounts without losing precision', () => {
      expect(formatXlmDelta(123_456_789_012_345n, 'out')).toBe(
         '-12345678.9012345 XLM'
      );
   });

   it('always takes the absolute value regardless of sign of the input bigint', () => {
      expect(formatXlmDelta(-10_000_000n, 'in')).toBe('+1.0000000 XLM');
   });

   it('throws a TypeError when stroops is not a bigint', () => {
      // @ts-expect-error - intentionally passing a non-bigint to verify the guard
      expect(() => formatXlmDelta(10000000, 'in')).toThrow(TypeError);
   });
});
