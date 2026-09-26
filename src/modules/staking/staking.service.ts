// src/modules/staking/staking.service.ts
// Read-model service for staking NFT positions (#932).
//
// Ownership is written by the indexer (staking-indexer.service.ts) when
// StakeNFTMinted and StakeNFTTransferred contract events are processed.
// This module is read-only — it never writes to the DB directly.

import { prisma } from '../../utils/prisma.utils';
import { cacheGetJson, cacheSetJson } from '../../utils/redis.utils';
import { buildOffsetPaginationMeta } from '../../utils/pagination.utils';

// ── Cache TTLs ───────────────────────────────────────────────

const WALLET_NFTS_CACHE_TTL_SECONDS = 60;
const NFT_METADATA_CACHE_TTL_SECONDS = 120;
const NFT_TRANSFERS_CACHE_TTL_SECONDS = 60;

// ── Error classes ─────────────────────────────────────────────

export class StakingNftNotFoundError extends Error {
   constructor(nftId: string) {
      super(`Staking NFT not found: ${nftId}`);
      this.name = 'StakingNftNotFoundError';
   }
}

// ── Shared item shape ─────────────────────────────────────────

export interface StakingNftItem {
   id: string;
   tokenId: string;
   ownerAddress: string;
   keyId: string;
   /** String-encoded Decimal to preserve full precision for the client. */
   stakedAmount: string;
   lockExpiryLedger: number | null;
   lockExpiresAt: string | null;
   burned: boolean;
   burnedAt: string | null;
   mintLedger: number;
   mintTxHash: string;
   createdAt: string;
   updatedAt: string;
}

export interface StakingNftTransferItem {
   id: string;
   nftId: string;
   fromAddress: string | null;
   toAddress: string;
   ledger: number;
   txHash: string;
   occurredAt: string;
}

// ── Wallet NFT list ───────────────────────────────────────────

export interface WalletNftsQuery {
   wallet: string;
   /** Include burned (redeemed) NFTs in the results. Default: false. */
   includeBurned?: boolean;
   limit: number;
   offset: number;
}

export interface WalletNftsResult {
   items: StakingNftItem[];
   meta: ReturnType<typeof buildOffsetPaginationMeta>;
}

/**
 * List all staking NFTs currently owned by a wallet, sorted by creation date
 * descending (most recently minted first). Non-burned positions only by
 * default; pass `includeBurned: true` to include redeemed receipts.
 *
 * Cached per (wallet, includeBurned, limit, offset) for 60 s.
 */
export async function getWalletStakingNfts(
   query: WalletNftsQuery
): Promise<WalletNftsResult> {
   const { wallet, includeBurned = false, limit, offset } = query;
   const cacheKey = `staking:nfts:wallet:${wallet}:burned_${includeBurned}:${limit}:${offset}`;
   const cached = await cacheGetJson<WalletNftsResult>(cacheKey);
   if (cached) return cached;

   const where = {
      ownerAddress: wallet,
      ...(includeBurned ? {} : { burned: false }),
   };

   const [rows, total] = await Promise.all([
      prisma.stakingNft.findMany({
         where,
         orderBy: { createdAt: 'desc' },
         skip: offset,
         take: limit,
      }),
      prisma.stakingNft.count({ where }),
   ]);

   const result: WalletNftsResult = {
      items: rows.map(mapNftRow),
      meta: buildOffsetPaginationMeta({ limit, offset, total }),
   };

   await cacheSetJson(cacheKey, result, WALLET_NFTS_CACHE_TTL_SECONDS);
   return result;
}

// ── Single NFT metadata ───────────────────────────────────────

/**
 * Fetch full metadata for a single staking NFT by its DB id or on-chain
 * tokenId. Publicly accessible (no auth required at the service layer).
 *
 * Cached per NFT id/tokenId for 120 s.
 *
 * @throws {StakingNftNotFoundError} when no matching NFT exists.
 */
export async function getStakingNftById(
   nftIdOrTokenId: string
): Promise<StakingNftItem> {
   const cacheKey = `staking:nfts:meta:${nftIdOrTokenId}`;
   const cached = await cacheGetJson<StakingNftItem>(cacheKey);
   if (cached) return cached;

   const row = await prisma.stakingNft.findFirst({
      where: {
         OR: [{ id: nftIdOrTokenId }, { tokenId: nftIdOrTokenId }],
      },
   });

   if (!row) {
      throw new StakingNftNotFoundError(nftIdOrTokenId);
   }

   const result = mapNftRow(row);
   await cacheSetJson(cacheKey, result, NFT_METADATA_CACHE_TTL_SECONDS);
   return result;
}

// ── Transfer history ──────────────────────────────────────────

export interface NftTransfersQuery {
   nftIdOrTokenId: string;
   limit: number;
   offset: number;
}

export interface NftTransfersResult {
   nft: StakingNftItem;
   items: StakingNftTransferItem[];
   meta: ReturnType<typeof buildOffsetPaginationMeta>;
}

/**
 * Return the full ownership-history for a single staking NFT, most recent
 * transfer first.  Resolves by DB id or on-chain tokenId.
 *
 * Cached per (nftIdOrTokenId, limit, offset) for 60 s.
 *
 * @throws {StakingNftNotFoundError} when no matching NFT exists.
 */
export async function getStakingNftTransfers(
   query: NftTransfersQuery
): Promise<NftTransfersResult> {
   const { nftIdOrTokenId, limit, offset } = query;
   const cacheKey = `staking:nfts:transfers:${nftIdOrTokenId}:${limit}:${offset}`;
   const cached = await cacheGetJson<NftTransfersResult>(cacheKey);
   if (cached) return cached;

   // Resolve NFT first so we get a stable DB id for the transfer query.
   const nftRow = await prisma.stakingNft.findFirst({
      where: {
         OR: [{ id: nftIdOrTokenId }, { tokenId: nftIdOrTokenId }],
      },
   });

   if (!nftRow) {
      throw new StakingNftNotFoundError(nftIdOrTokenId);
   }

   const [transferRows, total] = await Promise.all([
      prisma.stakingNftTransfer.findMany({
         where: { nftId: nftRow.id },
         orderBy: { occurredAt: 'desc' },
         skip: offset,
         take: limit,
      }),
      prisma.stakingNftTransfer.count({ where: { nftId: nftRow.id } }),
   ]);

   const result: NftTransfersResult = {
      nft: mapNftRow(nftRow),
      items: transferRows.map(mapTransferRow),
      meta: buildOffsetPaginationMeta({ limit, offset, total }),
   };

   await cacheSetJson(cacheKey, result, NFT_TRANSFERS_CACHE_TTL_SECONDS);
   return result;
}

// ── Cache invalidation helper ─────────────────────────────────

/**
 * Invalidate all cached entries for a wallet's NFT list.  Called by the
 * indexer after processing a mint or transfer event so the wallet's position
 * list reflects the change within the next request.
 */
export function walletNftsCachePattern(wallet: string): string {
   return `staking:nfts:wallet:${wallet}:*`;
}

/**
 * Invalidate the per-NFT metadata and transfer-history caches.  Accepts both
 * the DB id and the on-chain tokenId so both cache key variants are cleared.
 */
export function nftMetaCachePattern(nftId: string): string {
   return `staking:nfts:meta:${nftId}`;
}

export function nftTransfersCachePattern(nftId: string): string {
   return `staking:nfts:transfers:${nftId}:*`;
}

// ── Row mappers ───────────────────────────────────────────────

function mapNftRow(row: {
   id: string;
   tokenId: string;
   ownerAddress: string;
   keyId: string;
   stakedAmount: { toString(): string };
   lockExpiryLedger: number | null;
   lockExpiresAt: Date | null;
   burned: boolean;
   burnedAt: Date | null;
   mintLedger: number;
   mintTxHash: string;
   createdAt: Date;
   updatedAt: Date;
}): StakingNftItem {
   return {
      id: row.id,
      tokenId: row.tokenId,
      ownerAddress: row.ownerAddress,
      keyId: row.keyId,
      stakedAmount: row.stakedAmount.toString(),
      lockExpiryLedger: row.lockExpiryLedger,
      lockExpiresAt: row.lockExpiresAt?.toISOString() ?? null,
      burned: row.burned,
      burnedAt: row.burnedAt?.toISOString() ?? null,
      mintLedger: row.mintLedger,
      mintTxHash: row.mintTxHash,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
   };
}

function mapTransferRow(row: {
   id: string;
   nftId: string;
   fromAddress: string | null;
   toAddress: string;
   ledger: number;
   txHash: string;
   occurredAt: Date;
}): StakingNftTransferItem {
   return {
      id: row.id,
      nftId: row.nftId,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      ledger: row.ledger,
      txHash: row.txHash,
      occurredAt: row.occurredAt.toISOString(),
   };
}
