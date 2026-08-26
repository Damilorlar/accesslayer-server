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
         orderBy: [
            { distributionDate: 'desc' },
            { id: 'desc' },
         ],
         take,
         skip: input.cursor ? 1 : 0,
         cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      const hasMore = distributions.length > limit;
      const result = distributions.slice(0, limit);
      const nextCursor =
         hasMore && result.length > 0 ? result[result.length - 1].id : undefined;

      const records: DividendDistributionRecord[] = result.map((dist) => ({
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
         orderBy: [
            { recipientAddress: 'asc' },
            { id: 'asc' },
         ],
         take,
         skip: input.cursor ? 1 : 0,
         cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      const hasMore = claims.length > limit;
      const result = claims.slice(0, limit);
      const nextCursor =
         hasMore && result.length > 0 ? result[result.length - 1].id : undefined;

      const records: DividendClaimRecord[] = result.map((claim) => ({
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
