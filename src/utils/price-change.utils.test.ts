// src/utils/price-change.utils.test.ts

import { computePriceChange } from './price-change.utils';
import type { PrismaClient } from '@prisma/client';

describe('computePriceChange()', () => {
   const creatorId = 'creator-test-1';
   const windowMs = 3_600_000; // 1 hour

   let findManyMock: jest.Mock;
   let db: jest.Mocked<Pick<PrismaClient, 'creatorPriceHistory'>>;

   beforeEach(() => {
      findManyMock = jest.fn();
      db = {
         creatorPriceHistory: {
            findMany: findManyMock,
         } as any,
      };
   });

   it('returns a positive percentage when the price increased', async () => {
      findManyMock.mockResolvedValue([
         { price: BigInt(100) },
         { price: BigInt(150) },
      ]);

      const result = await computePriceChange(creatorId, windowMs, db as any);

      expect(result).toBe(50);
   });

   it('returns a negative percentage when the price decreased', async () => {
      findManyMock.mockResolvedValue([
         { price: BigInt(200) },
         { price: BigInt(120) },
      ]);

      const result = await computePriceChange(creatorId, windowMs, db as any);

      expect(result).toBe(-40);
   });

   it('returns null when fewer than two snapshots exist', async () => {
      findManyMock.mockResolvedValue([{ price: BigInt(100) }]);

      const result = await computePriceChange(creatorId, windowMs, db as any);

      expect(result).toBeNull();
   });

   it('returns null when no snapshots exist', async () => {
      findManyMock.mockResolvedValue([]);

      const result = await computePriceChange(creatorId, windowMs, db as any);

      expect(result).toBeNull();
   });

   it('rounds the percentage to two decimal places', async () => {
      findManyMock.mockResolvedValue([
         { price: BigInt(300) },
         { price: BigInt(100) },
      ]);

      const result = await computePriceChange(creatorId, windowMs, db as any);

      expect(result).toBeCloseTo(-66.67, 2);
   });
});
