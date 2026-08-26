import { prisma } from '../../utils/prisma.utils';
import { logger } from '../../utils/logger.utils';
import { OwnershipQueryType } from './ownership.schemas';

type KeyOwnership = NonNullable<
   Awaited<ReturnType<typeof prisma.keyOwnership.findFirst>>
>;

import { truncateWallet } from '../../utils/wallet-display.utils';
export async function fetchOwnership(
   query: OwnershipQueryType
): Promise<KeyOwnership[]> {
   const { ownerAddress, creatorId } = query;

   const where: any = {};
   if (ownerAddress) where.ownerAddress = ownerAddress;
   if (creatorId) where.creatorId = creatorId;

   return prisma.keyOwnership.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
   });
}

export interface OwnershipUpdateContext {
   event_type?: 'buy' | 'sell';
   ledger_sequence?: number;
}

export async function updateOwnership(
   ownerAddress: string,
   creatorId: string,
   balanceChange: number,
   ctx: OwnershipUpdateContext = {}
): Promise<KeyOwnership> {
   const existing = await prisma.keyOwnership.findFirst({
      where: { ownerAddress, creatorId },
      select: { balance: true },
   });
   const previousBalance = existing ? Number(existing.balance) : 0;

   const result = await prisma.keyOwnership.upsert({
      where: {
         ownerAddress_creatorId: {
            ownerAddress,
            creatorId,
         },
      },
      update: {
         balance: { increment: balanceChange },
      },
      create: {
         ownerAddress,
         creatorId,
         balance: balanceChange,
      },
   });

   logger.debug(
      {
         creator_id: creatorId,
         wallet_address: truncateWallet(ownerAddress),
         previous_balance: previousBalance,
         new_balance: Number(result.balance),
         event_type: ctx.event_type,
         ledger_sequence: ctx.ledger_sequence,
      },
      'Ownership read model updated'
   );

   return result;
}

/**
 * Record a key buy, updating balance, weighted-average cost basis and
 * lastBuyAt. Buy ingestion paths must call this (and invalidate the caches
 * exposed by analytics/holdings/referrals modules) so portfolio data stays
 * accurate.
 */
export async function recordKeyPurchase(
    ownerAddress: string,
    creatorId: string,
    quantityBought: number,
    pricePerKeyXlm: number,
    boughtAt: Date = new Date()
): Promise<KeyOwnership> {
    const existing = await prisma.keyOwnership.findUnique({
        where: {
            ownerAddress_creatorId: { ownerAddress, creatorId },
        },
        select: { balance: true, costBasis: true },
    });

    const currentBalance = Number(existing?.balance ?? 0);
    const currentCostBasis = Number(existing?.costBasis ?? 0);

    const newBalance = Math.max(0, currentBalance + quantityBought);
    // Weighted average cost across the open position; resets when flat.
    const newCostBasis =
        newBalance === 0
            ? 0
            : (currentCostBasis * currentBalance + pricePerKeyXlm * quantityBought) /
              newBalance;

    return prisma.keyOwnership.upsert({
        where: {
            ownerAddress_creatorId: { ownerAddress, creatorId },
        },
        update: {
            balance: { increment: quantityBought },
            costBasis: newCostBasis,
            lastBuyAt: boughtAt,
        },
        create: {
            ownerAddress,
            creatorId,
            balance: quantityBought,
            costBasis: pricePerKeyXlm,
            lastBuyAt: boughtAt,
        },
    });
}
