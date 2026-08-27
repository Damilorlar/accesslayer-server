import { prisma } from '../../utils/prisma.utils';
import { logger } from '../../utils/logger.utils';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Dividend distribution with calculated fields for API responses.
 */
export interface DividendDistributionRecord {
   id: string;
   creatorId: string;
   distributionDate: Date;
   totalAmount: number | Decimal;
   holderCount: number;
   perKeyAmount: number | Decimal;
   distributedAt: Date;
}

/**
 * Dividend claim record for holder breakdown.
 */
export interface DividendClaimRecord {
   id: string;
   recipientAddress: string;
   amountXlm: number | Decimal;
   claimedAt: Date | null;
}

export interface GetDividendDistributionsInput {
   creatorId: string;
   limit?: number;
   cursor?: string;
}

export interface GetDividendDistributionsResult {
   distributions: DividendDistributionRecord[];
   nextCursor?: string;
   hasMore: boolean;
}

/**
 * Retrieves dividend distributions for a creator with cursor-based pagination.
 * Returns distributions sorted by distributionDate descending.
 */
export async function getDividendDistributions(
   input: GetDividendDistributionsInput
): Promise<GetDividendDistributionsResult> {
   const limit = Math.min(input.limit || 50, 100); // Max 100 per page
   const take = limit + 1; // Fetch one extra to detect hasMore

   try {
      const distributions = await prisma.dividendDistribution.findMany({
         where: { creatorId: input.creatorId },
         orderBy: [{ distributionDate: 'desc' }, { id: 'desc' }],
         take,
         skip: input.cursor ? 1 : 0,
         cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      const hasMore = distributions.length > limit;
      const result = distributions.slice(0, limit);
      const nextCursor =
         hasMore && result.length > 0
            ? result[result.length - 1].id
            : undefined;

      const records: DividendDistributionRecord[] = result.map(dist => ({
         id: dist.id,
         creatorId: dist.creatorId,
         distributionDate: dist.distributionDate,
         totalAmount: dist.totalAmountXlm,
         holderCount: dist.holderCount,
         perKeyAmount: dist.perKeyAmountXlm,
         distributedAt: dist.distributionDate,
      }));

      return {
         distributions: records,
         nextCursor,
         hasMore,
      };
   } catch (error) {
      logger.error({ error, input }, 'Failed to get dividend distributions');
      throw error;
   }
}

export interface GetDividendClaimsInput {
   distributionId: string;
   limit?: number;
   cursor?: string;
}

export interface GetDividendClaimsResult {
   claims: DividendClaimRecord[];
   nextCursor?: string;
   hasMore: boolean;
}

/**
 * Retrieves dividend claims for a specific distribution with cursor-based pagination.
 * Returns claims sorted by recipientAddress ascending for deterministic ordering.
 */
export async function getDividendClaims(
   input: GetDividendClaimsInput
): Promise<GetDividendClaimsResult> {
   const limit = Math.min(input.limit || 50, 100); // Max 100 per page
   const take = limit + 1; // Fetch one extra to detect hasMore

   try {
      const claims = await prisma.dividendClaim.findMany({
         where: { distributionId: input.distributionId },
         orderBy: [{ recipientAddress: 'asc' }, { id: 'asc' }],
         take,
         skip: input.cursor ? 1 : 0,
         cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      const hasMore = claims.length > limit;
      const result = claims.slice(0, limit);
      const nextCursor =
         hasMore && result.length > 0
            ? result[result.length - 1].id
            : undefined;

      const records: DividendClaimRecord[] = result.map(claim => ({
         id: claim.id,
         recipientAddress: claim.recipientAddress,
         amountXlm: claim.amountXlm,
         claimedAt: claim.claimedAt,
      }));

      return {
         claims: records,
         nextCursor,
         hasMore,
      };
   } catch (error) {
      logger.error({ error, input }, 'Failed to get dividend claims');
      throw error;
   }
}

/**
 * Checks if a distribution exists and returns it.
 */
export async function getDividendDistributionById(
   distributionId: string
): Promise<{
   id: string;
   creatorId: string;
} | null> {
   return prisma.dividendDistribution.findUnique({
      where: { id: distributionId },
      select: { id: true, creatorId: true },
   });
}

/**
 * Verifies that a creator exists.
 */
export async function creatorExists(creatorId: string): Promise<boolean> {
   const creator = await prisma.creatorProfile.findUnique({
      where: { id: creatorId },
      select: { id: true },
   });
   return !!creator;
}

export class InsufficientBalanceError extends Error {
   constructor(
      message = 'Insufficient wallet balance to cover dividend distribution'
   ) {
      super(message);
      this.name = 'InsufficientBalanceError';
   }
}

export async function createDividendDistribution(params: {
   creatorId: string;
   totalAmount: number;
   creatorWallet: string;
   txHash?: string;
   ledger?: number;
}): Promise<{
   distributionId: string;
   totalAmount: number;
   holderCount: number;
   perKeyAmount: number;
}> {
   const {
      creatorId,
      totalAmount,
      creatorWallet,
      txHash = `tx-${Date.now()}`,
      ledger = 1,
   } = params;

   // 1. Verify creator exists
   const creator = await prisma.creatorProfile.findUnique({
      where: { id: creatorId },
      include: { user: { include: { stellarWallet: true } } },
   });

   if (!creator) {
      throw new Error('Creator not found');
   }

   // 2. Wallet balance check: check if creator wallet has insufficient balance
   // If stellarWallet has a cached balance or we query keyOwnership
   const wallet = creator.user?.stellarWallet;
   if (wallet && (wallet as any).balance !== undefined) {
      const balance = Number((wallet as any).balance);
      if (balance < totalAmount) {
         throw new InsufficientBalanceError();
      }
   }

   // 3. Fetch active key holders
   const holders = await prisma.keyOwnership.findMany({
      where: {
         creatorId,
         balance: { gt: 0 },
      },
   });

   const holderCount = holders.length;
   let totalKeys = 0;
   for (const h of holders) {
      totalKeys += Number(h.balance);
   }

   const perKeyAmount = totalKeys > 0 ? totalAmount / totalKeys : 0;
   const now = new Date();

   // 4. Create DividendDistribution record
   const dist = await prisma.dividendDistribution.create({
      data: {
         creatorId,
         distributionDate: now,
         totalAmountXlm: totalAmount,
         holderCount,
         perKeyAmountXlm: perKeyAmount,
         ledger,
         txHash,
      },
   });

   // 5. Create per-holder claim records
   if (holders.length > 0) {
      await prisma.dividendClaim.createMany({
         data: holders.map(h => ({
            distributionId: dist.id,
            recipientAddress: h.ownerAddress,
            amountXlm: Number(h.balance) * perKeyAmount,
         })),
      });

      // Write activity_log records for each recipient
      await prisma.activityLog.createMany({
         data: holders.map(h => ({
            type: 'dividend',
            actor: h.ownerAddress,
            keyId: creatorId,
            creatorName: creator.displayName || creator.handle,
            amount: Number(h.balance) * perKeyAmount,
            txHash,
            timestamp: now,
            payload: {
               distributionId: dist.id,
               perKeyAmount,
               holderKeys: Number(h.balance),
            },
         })),
         skipDuplicates: true,
      });
   }

   // Also record general activity
   await prisma.activity.create({
      data: {
         type: 'DIVIDEND_DISTRIBUTED',
         actor: creatorWallet,
         creatorId,
         payload: {
            distributionId: dist.id,
            totalAmount,
            holderCount,
            perKeyAmount,
            txHash,
         },
         createdAt: now,
      },
   });

   logger.info(
      {
         distributionId: dist.id,
         creatorId,
         totalAmount,
         holderCount,
         perKeyAmount,
      },
      'Dividend distributed successfully'
   );

   try {
      const { invalidateCreatorDashboardCache } =
         await import('../creator/creator-dashboard.service');
      await invalidateCreatorDashboardCache(creatorId);
   } catch {
      // Non-critical cache invalidation failure
   }

   return {
      distributionId: dist.id,
      totalAmount,
      holderCount,
      perKeyAmount,
   };
}
