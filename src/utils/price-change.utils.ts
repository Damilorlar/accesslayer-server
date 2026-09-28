// src/utils/price-change.utils.ts

interface PriceHistoryClient {
   creatorPriceHistory?: {
      findMany(args: {
         where: { creatorId: string; recordedAt: { gte: Date } };
         orderBy: { recordedAt: 'asc' };
         select: { price: true };
      }): Promise<Array<{ price: bigint }>>;
   };
}

const OLDEST_RECORD_INDEX = 0;

/**
 * Compute the percentage change in a creator's key price over a given time window.
 *
 * Queries the price history table for records within `windowMs` and compares
 * the oldest and latest prices. Returns `null` when fewer than two records exist
 * in the window or when the oldest price is zero.
 *
 * @param creatorId - The creator to compute the change for.
 * @param windowMs - Time window in milliseconds (e.g. 3600000 for 1h).
 * @param db - Prisma client instance.
 *
 * @returns Signed percentage rounded to two decimal places, or `null`.
 */
export async function computePriceChange(
   creatorId: string,
   windowMs: number,
   db: PriceHistoryClient
): Promise<number | null> {
   if (!db.creatorPriceHistory) {
      return null;
   }

   const cutoff = new Date(Date.now() - windowMs);

   const snapshots = await db.creatorPriceHistory.findMany({
      where: {
         creatorId,
         recordedAt: { gte: cutoff },
      },
      orderBy: { recordedAt: 'asc' },
      select: { price: true },
   });

   if (snapshots.length < 2) {
      return null;
   }

   const oldestPrice = snapshots[OLDEST_RECORD_INDEX].price;
   const latestPrice = snapshots[snapshots.length - 1].price;

   if (oldestPrice === BigInt(0)) {
      return null;
   }

   const change = Number(latestPrice - oldestPrice);
   const base = Number(oldestPrice);
   const percentage = (change / base) * 100;

   return parseFloat(percentage.toFixed(2));
}
