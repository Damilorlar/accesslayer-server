// src/modules/staking/staking.routes.ts
// HTTP route handlers for staking NFT position endpoints (#932).
//
// Endpoints:
//
//   GET /api/v1/staking/nfts
//     Authenticated. Returns all staking NFTs for the JWT wallet.
//     Query: limit, offset, includeBurned.
//
//   GET /api/v1/staking/nfts/:id
//     Public. Returns full metadata for a single NFT (by DB id or tokenId).
//
//   GET /api/v1/staking/nfts/:id/transfers
//     Public. Returns the full ownership history for a single NFT.
//
// Route ordering: static paths (/nfts) are registered before parameterised
// paths (/:id and /:id/transfers) to avoid shadowing.

import { Router } from 'express';
import { z } from 'zod';
import {
   sendNotFound,
   sendSuccess,
   sendValidationError,
   zodIssuesToDetails,
} from '../../utils/api-response.utils';
import {
   requireJwtAuth,
   AuthenticatedRequest,
} from '../../middlewares/jwt-auth.middleware';
import { logger } from '../../utils/logger.utils';
import {
   getWalletStakingNfts,
   getStakingNftById,
   getStakingNftTransfers,
   StakingNftNotFoundError,
} from './staking.service';

const stakingRouter = Router();

// ── Shared pagination constants ──────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ── Zod schemas ───────────────────────────────────────────────

const walletNftsQuerySchema = z.object({
   limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(DEFAULT_LIMIT),
   offset: z.coerce.number().int().min(0).default(0),
   includeBurned: z
      .enum(['true', 'false'])
      .optional()
      .transform(v => v === 'true'),
});

const nftPaginationQuerySchema = z.object({
   limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .default(DEFAULT_LIMIT),
   offset: z.coerce.number().int().min(0).default(0),
});

// ── GET /staking/nfts ─────────────────────────────────────────

/**
 * GET /api/v1/staking/nfts
 *
 * Returns all staking NFT positions owned by the authenticated wallet,
 * sorted by mint date descending (most recently minted first).
 *
 * Auth: Bearer JWT (wallet from token is the owner filter).
 *
 * Query parameters:
 *   limit        — max items per page (1–100, default 20)
 *   offset       — items to skip (default 0)
 *   includeBurned — include redeemed/burned NFTs (default false)
 *
 * Responses:
 *   200 — { items: StakingNftItem[], meta: OffsetPaginationMeta }
 *   400 — invalid query parameters
 *   401 — missing or invalid JWT
 */
stakingRouter.get(
   '/nfts',
   requireJwtAuth,
   async (req: AuthenticatedRequest, res, next) => {
      const parsed = walletNftsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
         sendValidationError(
            res,
            'Invalid query parameters',
            zodIssuesToDetails(parsed.error.issues)
         );
         return;
      }

      try {
         const result = await getWalletStakingNfts({
            wallet: req.user!.wallet,
            ...parsed.data,
         });
         sendSuccess(res, result);
      } catch (error) {
         logger.error(
            { error, wallet: req.user?.wallet },
            'GET /staking/nfts failed'
         );
         next(error);
      }
   }
);

stakingRouter.all('/nfts', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

// ── GET /staking/nfts/:id/transfers ──────────────────────────
// Must be registered BEFORE /:id so Express does not treat "transfers"
// as the :id param value and fall through to the metadata handler.

/**
 * GET /api/v1/staking/nfts/:id/transfers
 *
 * Returns the full ownership-transfer history for a single staking NFT,
 * sorted by transfer date descending (most recent first). The initial mint
 * appears as the last entry (fromAddress = null). Publicly accessible.
 *
 * Path parameters:
 *   id — the NFT's DB id or on-chain tokenId
 *
 * Query parameters:
 *   limit  — max items per page (1–100, default 20)
 *   offset — items to skip (default 0)
 *
 * Responses:
 *   200 — { nft: StakingNftItem, items: StakingNftTransferItem[], meta: OffsetPaginationMeta }
 *   400 — invalid query parameters
 *   404 — NFT not found
 */
stakingRouter.get('/:id/transfers', async (req, res, next) => {
   const parsed = nftPaginationQuerySchema.safeParse(req.query);
   if (!parsed.success) {
      sendValidationError(
         res,
         'Invalid query parameters',
         zodIssuesToDetails(parsed.error.issues)
      );
      return;
   }

   try {
      const result = await getStakingNftTransfers({
         nftIdOrTokenId: String(req.params.id),
         ...parsed.data,
      });
      sendSuccess(res, result);
   } catch (error) {
      if (error instanceof StakingNftNotFoundError) {
         sendNotFound(res, 'Staking NFT');
         return;
      }
      logger.error(
         { error, id: req.params.id },
         'GET /staking/nfts/:id/transfers failed'
      );
      next(error);
   }
});

stakingRouter.all('/:id/transfers', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

// ── GET /staking/nfts/:id ─────────────────────────────────────

/**
 * GET /api/v1/staking/nfts/:id
 *
 * Returns full metadata for a single staking NFT. Resolves by DB id or
 * on-chain tokenId. Publicly accessible — no auth required.
 *
 * Path parameters:
 *   id — the NFT's DB id or on-chain tokenId
 *
 * Responses:
 *   200 — StakingNftItem
 *   404 — NFT not found
 */
stakingRouter.get('/:id', async (req, res, next) => {
   try {
      const nft = await getStakingNftById(String(req.params.id));
      sendSuccess(res, nft);
   } catch (error) {
      if (error instanceof StakingNftNotFoundError) {
         sendNotFound(res, 'Staking NFT');
         return;
      }
      logger.error({ error, id: req.params.id }, 'GET /staking/nfts/:id failed');
      next(error);
   }
});

stakingRouter.all('/:id', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

export default stakingRouter;
