// src/modules/governance/governance.routes.ts
// HTTP route handlers for delegated governance voting (#933).
//
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────
//
//  GET /governance/delegation/:wallet
//    Public. Returns the current active delegate for a wallet.
//    Optional query param ?keyId= narrows to a specific creator key.
//    Returns { delegated: false } when no active delegation exists rather
//    than 404, so the frontend can display "not delegated" cleanly.
//
//  GET /governance/delegators/:wallet
//    Public. Returns all wallets that have delegated to this address (paginated).
//    Optional query param ?keyId= narrows to a specific creator key.
//
//  GET /governance/delegation/:wallet/history
//    Public. Returns the full event log of delegations set/revoked by or to
//    this wallet, newest first (paginated).
//    Optional query param ?keyId= narrows to a specific creator key.
//
// Route ordering: /:wallet/history must be registered BEFORE /:wallet so
// Express does not match "history" as the :wallet param value.

import { Router } from 'express';
import { z } from 'zod';
import {
   sendSuccess,
   sendValidationError,
   zodIssuesToDetails,
} from '../../utils/api-response.utils';
import { logger } from '../../utils/logger.utils';
import { StellarAddressSchema } from '../wallet/wallet.schemas';
import {
   getCurrentDelegate,
   getActiveDelegators,
   getDelegationHistory,
} from './governance-delegation.service';

const governanceRouter = Router();

// ── Shared constants ──────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ── Shared Zod schemas ────────────────────────────────────────

/** Optional keyId filter — any non-empty string is valid. */
const keyIdQuerySchema = z.object({
   keyId: z.string().min(1).optional(),
});

const paginationQuerySchema = z.object({
   limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
   offset: z.coerce.number().int().min(0).default(0),
   keyId: z.string().min(1).optional(),
});

const walletParamSchema = z.object({
   wallet: StellarAddressSchema,
});

// ── GET /governance/delegation/:wallet/history ────────────────
// Registered BEFORE /:wallet to avoid "history" matching as the :wallet param.

/**
 * GET /api/v1/governance/delegation/:wallet/history
 *
 * Returns the full event log (DelegationSet and DelegationRevoked) for a
 * wallet — both events where the wallet was the delegator and events where
 * it was the delegatee — newest first.
 *
 * This endpoint is publicly accessible: delegation history is a governance
 * transparency feature.
 *
 * Path parameters:
 *   wallet — Stellar address of the wallet
 *
 * Query parameters:
 *   keyId  — (optional) narrow to a specific creator key
 *   limit  — max items per page (1–100, default 20)
 *   offset — items to skip (default 0)
 *
 * Responses:
 *   200 — { items: DelegationHistoryItem[], meta: OffsetPaginationMeta }
 *   400 — invalid wallet address or query parameters
 */
governanceRouter.get('/:wallet/history', async (req, res, next) => {
   const walletParsed = walletParamSchema.safeParse(req.params);
   if (!walletParsed.success) {
      sendValidationError(
         res,
         'Invalid wallet address',
         zodIssuesToDetails(walletParsed.error.issues)
      );
      return;
   }

   const queryParsed = paginationQuerySchema.safeParse(req.query);
   if (!queryParsed.success) {
      sendValidationError(
         res,
         'Invalid query parameters',
         zodIssuesToDetails(queryParsed.error.issues)
      );
      return;
   }

   try {
      const result = await getDelegationHistory({
         wallet: walletParsed.data.wallet,
         keyId: queryParsed.data.keyId,
         limit: queryParsed.data.limit,
         offset: queryParsed.data.offset,
      });
      sendSuccess(res, result);
   } catch (error) {
      logger.error(
         { error, wallet: req.params.wallet },
         'GET /governance/delegation/:wallet/history failed'
      );
      next(error);
   }
});

governanceRouter.all('/:wallet/history', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

// ── GET /governance/delegation/:wallet ────────────────────────

/**
 * GET /api/v1/governance/delegation/:wallet
 *
 * Returns the current active delegate for a wallet. When the wallet has no
 * active delegation, returns `{ delegated: false }` rather than 404 so the
 * frontend can render the "not delegated" state without error handling.
 *
 * Optionally scope to a specific creator key with `?keyId=`. Without it,
 * the most-recently-set active delegation is returned.
 *
 * Publicly accessible.
 *
 * Path parameters:
 *   wallet — Stellar address of the delegating wallet
 *
 * Query parameters:
 *   keyId — (optional) narrow to a specific creator key
 *
 * Responses:
 *   200 — { delegated: false } | { delegated: true, delegation: DelegationItem }
 *   400 — invalid wallet address or query parameters
 */
governanceRouter.get('/:wallet', async (req, res, next) => {
   const walletParsed = walletParamSchema.safeParse(req.params);
   if (!walletParsed.success) {
      sendValidationError(
         res,
         'Invalid wallet address',
         zodIssuesToDetails(walletParsed.error.issues)
      );
      return;
   }

   const queryParsed = keyIdQuerySchema.safeParse(req.query);
   if (!queryParsed.success) {
      sendValidationError(
         res,
         'Invalid query parameters',
         zodIssuesToDetails(queryParsed.error.issues)
      );
      return;
   }

   try {
      const result = await getCurrentDelegate({
         wallet: walletParsed.data.wallet,
         keyId: queryParsed.data.keyId,
      });
      sendSuccess(res, result);
   } catch (error) {
      logger.error(
         { error, wallet: req.params.wallet },
         'GET /governance/delegation/:wallet failed'
      );
      next(error);
   }
});

governanceRouter.all('/:wallet', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

export { governanceRouter as delegationRouter };

// ── /governance/delegators sub-router ────────────────────────
// Mounted separately in index.ts under /governance/delegators so the
// path shape matches the spec: GET /governance/delegators/:wallet

const delegatorsRouter = Router();

/**
 * GET /api/v1/governance/delegators/:wallet
 *
 * Returns all wallets that currently have an active delegation pointing to
 * this address, sorted by delegation date descending.
 *
 * Useful for showing a delegate how much aggregate vote weight they carry
 * and from whom.
 *
 * Optionally filter by creator key with `?keyId=`.
 *
 * Publicly accessible.
 *
 * Path parameters:
 *   wallet — Stellar address of the delegate (the recipient of delegations)
 *
 * Query parameters:
 *   keyId  — (optional) narrow to a specific creator key
 *   limit  — max items per page (1–100, default 20)
 *   offset — items to skip (default 0)
 *
 * Responses:
 *   200 — { items: DelegatorItem[], meta: OffsetPaginationMeta }
 *   400 — invalid wallet address or query parameters
 */
delegatorsRouter.get('/:wallet', async (req, res, next) => {
   const walletParsed = walletParamSchema.safeParse(req.params);
   if (!walletParsed.success) {
      sendValidationError(
         res,
         'Invalid wallet address',
         zodIssuesToDetails(walletParsed.error.issues)
      );
      return;
   }

   const queryParsed = paginationQuerySchema.safeParse(req.query);
   if (!queryParsed.success) {
      sendValidationError(
         res,
         'Invalid query parameters',
         zodIssuesToDetails(queryParsed.error.issues)
      );
      return;
   }

   try {
      const result = await getActiveDelegators({
         wallet: walletParsed.data.wallet,
         keyId: queryParsed.data.keyId,
         limit: queryParsed.data.limit,
         offset: queryParsed.data.offset,
      });
      sendSuccess(res, result);
   } catch (error) {
      logger.error(
         { error, wallet: req.params.wallet },
         'GET /governance/delegators/:wallet failed'
      );
      next(error);
   }
});

delegatorsRouter.all('/:wallet', (_req, res) => {
   res.set('Allow', 'GET').sendStatus(405);
});

export { delegatorsRouter };
export default governanceRouter;
