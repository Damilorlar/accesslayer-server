import { prisma } from '../../utils/prisma.utils';
import { updateIndexedLedger } from './ledger-gap-detection.service';
import { logger } from '../../utils/logger.utils';
import {
   processIndexerChainEvents,
   IndexerChainEvent,
} from '../../utils/indexer-event-processor.utils';
import { dedupeChainEvents } from '../../utils/indexer-dedupe.utils';

/**
 * Extended chain event interface for dividend distribution events.
 */
export interface DividendDistributedEvent extends IndexerChainEvent {
   eventType: 'DIVIDEND_DISTRIBUTED';
   creatorId: string;
   totalAmountXlm: string; // In stroops or XLM, as string for precision
   holdersCount: number;
   distributorAddress: string;
   distributedAt: string; // ISO timestamp
}

/**
 * Processes a batch of dividend distribution events (DIVIDEND_DISTRIBUTED).
 *
 * - Deduplicates the events based on txHash and eventIndex.
 * - Parses and validates each event.
 * - Creates a DividendDistribution record with calculated perKeyAmount.
 * - Creates DividendClaim records for all current key holders at distribution time.
 * - Creates an Activity record for audit trail.
 * - Writes a checkpoint record of the highest ledger processed.
 */
export async function processDividendEvents(
   events: IndexerChainEvent[]
): Promise<void> {
   await processIndexerChainEvents(events, async event => {
      // Validate event type
      if (event.eventType !== 'DIVIDEND_DISTRIBUTED') {
         return;
      }

      // Type guard and required field validation
      const typedEvent = event as DividendDistributedEvent;
      const requiredFields = [
         'creatorId',
         'totalAmountXlm',
         'holdersCount',
         'distributorAddress',
         'distributedAt',
         'ledger',
      ];

      for (const field of requiredFields) {
         if (
            typedEvent[field as keyof DividendDistributedEvent] === undefined ||
            typedEvent[field as keyof DividendDistributedEvent] === null ||
            typedEvent[field as keyof DividendDistributedEvent] === ''
         ) {
            logger.warn(
               {
                  eventId: `${event.txHash}:${event.eventIndex}`,
                  missingField: field,
               },
               'Skipping dividend event due to missing required field'
            );
            return;
         }
      }

      const {
         creatorId,
         totalAmountXlm,
         holdersCount,
         distributorAddress,
         distributedAt,
         ledger,
         txHash,
      } = typedEvent;

      // Calculate per-key amount
      let perKeyAmountXlm = '0';
      if (holdersCount > 0) {
         // Handle both decimal and integer inputs
         const totalAsDecimal =
            typeof totalAmountXlm === 'string'
               ? parseFloat(totalAmountXlm)
               : Number(totalAmountXlm);
         const perKeyAmount = totalAsDecimal / holdersCount;
         perKeyAmountXlm = perKeyAmount.toFixed(7); // 7 decimal places for Decimal(20,7)
      }

      // 1. Create DividendDistribution record
      const distribution = await prisma.dividendDistribution.create({
         data: {
            creatorId,
            distributionDate: new Date(distributedAt),
            totalAmountXlm: parseFloat(totalAmountXlm),
            holderCount: holdersCount,
            perKeyAmountXlm: parseFloat(perKeyAmountXlm),
            ledger: Number(ledger),
            txHash: String(txHash),
         },
      });

      // 2. Get all current key holders for this creator (balance > 0)
      const holders = await prisma.keyOwnership.findMany({
         where: {
            creatorId,
            balance: { gt: 0 },
         },
         select: {
            id: true,
            ownerAddress: true,
            balance: true,
         },
      });

      // 3. Create DividendClaim records for each holder
      if (holders.length > 0) {
         const claims = holders.map(holder => {
            // Calculate holder's payout: perKeyAmount * holderBalance
            const holderBalance =
               typeof holder.balance === 'string'
                  ? parseFloat(holder.balance)
                  : Number(holder.balance);
            const holderPayout = (
               parseFloat(perKeyAmountXlm) * holderBalance
            ).toFixed(7);

            return {
               distributionId: distribution.id,
               recipientAddress: holder.ownerAddress,
               amountXlm: parseFloat(holderPayout),
            };
         });

         await prisma.dividendClaim.createMany({
            data: claims,
            skipDuplicates: true,
         });
      }

      // 4. Create Activity record for audit trail
      await prisma.activity.create({
         data: {
            type: 'DIVIDEND_DISTRIBUTED',
            actor: distributorAddress,
            creatorId,
            payload: {
               total_amount_xlm: totalAmountXlm,
               per_key_amount_xlm: perKeyAmountXlm,
               holders_count: holdersCount,
               distribution_id: distribution.id,
               ledger_sequence: Number(ledger),
            },
            createdAt: new Date(distributedAt),
         },
      });

      logger.info(
         {
            distributionId: distribution.id,
            creatorId,
            totalAmountXlm,
            holderCount: holdersCount,
            perKeyAmountXlm,
            ledger: Number(ledger),
            txHash: String(txHash),
         },
         'Dividend distribution processed'
      );

      try {
         const { invalidateCreatorDashboardCache } =
            await import('../creator/creator-dashboard.service');
         await invalidateCreatorDashboardCache(creatorId);
      } catch {
         // Non-critical cache invalidation failure
      }
   });

   // Update checkpoint with highest ledger processed
   const uniqueEvents = dedupeChainEvents(events);
   const processedLedgers = uniqueEvents
      .map(e => e.ledger)
      .filter((l): l is number => typeof l === 'number');

   if (processedLedgers.length > 0) {
      const maxLedger = Math.max(...processedLedgers);
      // Compute batch hash for deduplication detection
      const identifiers = uniqueEvents
         .map(e => `${e.txHash}:${e.eventIndex}`)
         .sort()
         .join('|');
      const { createHash } = await import('crypto');
      const batchHash = createHash('sha256')
         .update(identifiers, 'utf8')
         .digest('hex')
         .slice(0, 16);
      const cursor = `${maxLedger}-000`;
      await updateIndexedLedger(maxLedger, cursor, batchHash);
   }
}
