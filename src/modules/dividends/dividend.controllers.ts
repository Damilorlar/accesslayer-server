import { AsyncController } from '../../types/auth.types';
import {
   sendSuccess,
   sendValidationError,
   sendNotFound,
} from '../../utils/api-response.utils';
import { Response } from 'express';
import {
   GetDividendDistributionsQuery,
   GetDividendDistributionsQuerySchema,
   GetDividendClaimsQuery,
   GetDividendClaimsQuerySchema,
} from './dividend.schemas';
import {
   getDividendDistributions,
   getDividendClaims,
   getDividendDistributionById,
   creatorExists,
} from './dividend.service';

/**
 * GET /keys/:keyId/dividends
 * Returns all past dividend distributions for a creator key with pagination.
 */
export const httpGetDividendDistributions: AsyncController = async (
   req,
   res,
   next
) => {
   try {
      const { keyId } = req.params as { keyId: string };

      if (!keyId) {
         return sendValidationError(res, 'Missing required parameters', [
            { field: 'keyId', message: 'Key ID is required' },
         ]);
      }

      // Verify creator exists
      const creatorId = keyId;
      const exists = await creatorExists(creatorId);
      if (!exists) {
         return sendNotFound(res, 'Creator not found', [
            { field: 'keyId', message: 'The specified key ID does not exist' },
         ]);
      }

      // Parse and validate query parameters
      const parsed = GetDividendDistributionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
         return sendValidationError(res, 'Invalid query parameters', [
            {
               field: 'query',
               message: 'Invalid pagination parameters',
            },
         ]);
      }

      const query = parsed.data as GetDividendDistributionsQuery;

      // Fetch distributions
      const result = await getDividendDistributions({
         creatorId,
         limit: query.limit,
         cursor: query.cursor,
      });

      // Format response
      const entries = result.distributions.map((dist) => ({
         distributionId: dist.id,
         totalAmount: Number(dist.totalAmount),
         holderCount: dist.holderCount,
         perKeyAmount: Number(dist.perKeyAmount),
         distributedAt: dist.distributedAt.toISOString(),
      }));

      return sendSuccess(res, {
         entries,
         pagination: {
            limit: query.limit,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
         },
      });
   } catch (error) {
      next(error);
   }
};

/**
 * GET /keys/:keyId/dividends/:distributionId/holders
 * Returns the per-holder payout breakdown for a specific distribution.
 */
export const httpGetDividendHolders: AsyncController = async (
   req,
   res,
   next
) => {
   try {
      const { keyId, distributionId } = req.params as {
         keyId: string;
         distributionId: string;
      };

      if (!keyId || !distributionId) {
         return sendValidationError(res, 'Missing required parameters', [
            ...(keyId ? [] : [{ field: 'keyId', message: 'Key ID is required' }]),
            ...(distributionId
               ? []
               : [{ field: 'distributionId', message: 'Distribution ID is required' }]),
         ]);
      }

      // Verify creator exists
      const creatorId = keyId;
      const exists = await creatorExists(creatorId);
      if (!exists) {
         return sendNotFound(res, 'Creator not found', [
            { field: 'keyId', message: 'The specified key ID does not exist' },
         ]);
      }

      // Verify distribution exists and belongs to this creator
      const distribution = await getDividendDistributionById(distributionId);
      if (!distribution) {
         return sendNotFound(res, 'Distribution not found', [
            {
               field: 'distributionId',
               message: 'The specified distribution does not exist',
            },
         ]);
      }

      if (distribution.creatorId !== creatorId) {
         return sendNotFound(res, 'Distribution not found', [
            {
               field: 'distributionId',
               message: 'The distribution does not belong to this creator',
            },
         ]);
      }

      // Parse and validate query parameters
      const parsed = GetDividendClaimsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
         return sendValidationError(res, 'Invalid query parameters', [
            {
               field: 'query',
               message: 'Invalid pagination parameters',
            },
         ]);
      }

      const query = parsed.data as GetDividendClaimsQuery;

      // Fetch claims
      const result = await getDividendClaims({
         distributionId,
         limit: query.limit,
         cursor: query.cursor,
      });

      // Format response
      const entries = result.claims.map((claim) => ({
         recipientWallet: claim.recipientAddress,
         amountXlm: Number(claim.amountXlm),
         claimedAt: claim.claimedAt ? claim.claimedAt.toISOString() : null,
      }));

      return sendSuccess(res, {
         entries,
         pagination: {
            limit: query.limit,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
         },
      });
   } catch (error) {
      next(error);
   }
};
