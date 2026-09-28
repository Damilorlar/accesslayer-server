import { prisma } from './prisma.utils';
import { logger } from './logger.utils';

/**
 * Computes the 24h trading volume for a creator by summing all trades
 * (KEY_BOUGHT and KEY_SOLD) within the last 24 hours.
 *
 * The time window is rolling — based on current time minus 24 hours, not calendar day boundaries.
 *
 * @param creatorId - The ID of the creator
 * @returns Promise resolving to the sum of prices (in stroops) for all trades within the window
 */
export async function compute24hVolume(creatorId: string): Promise<bigint> {
   try {
      // Calculate the 24-hour cutoff timestamp
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Query all trades (KEY_BOUGHT and KEY_SOLD) for the creator within the window
      const trades = await prisma.activity.findMany({
         where: {
            creatorId,
            type: { in: ['KEY_BOUGHT', 'KEY_SOLD'] },
            createdAt: {
               gte: twentyFourHoursAgo,
               lte: now,
            },
         },
         select: {
            payload: true,
         },
      });

      // Sum the price field from each trade's payload
      let totalVolume = 0n;

      for (const trade of trades) {
         const payload = trade.payload as Record<string, any>;
         if (payload && typeof payload.price !== 'undefined') {
            const price = BigInt(payload.price);
            totalVolume += price;
         }
      }

      return totalVolume;
   } catch (error) {
      logger.error(
         {
            error: error instanceof Error ? error.message : String(error),
            creatorId,
         },
         'Failed to compute 24h trading volume'
      );
      throw error;
   }
}
