// src/modules/keys/key-analytics.service.ts
// Payment-asset analytics for key purchase tracking (#934).
//
// Two query surfaces:
//
//   getKeyPaymentAssetAnalytics(keyId)
//     Per-key breakdown: trade count, unique buyers, and total price (stroops)
//     grouped by paymentAsset. Used by GET /keys/:keyId/analytics.
//
//   getPlatformPaymentAssetDistribution()
//     Platform-wide: same aggregation across ALL keys plus a percentage share
//     per asset. Used by GET /keys/analytics/payment-assets (admin).
//
// Both surfaces read from the Trade table directly — it is the canonical
// source of truth for payment asset data. Activity.payload.payment_asset is
// written in parallel by the indexer (for event-stream consumers) but is not
// queried here to avoid parsing Json.
//
// Caching: both results are cached in Redis for 5 minutes. Cache is
// invalidated by keyId after each successful trade write (the trade-indexer
// already calls invalidateCreatorDashboardCache; callers should also call
// invalidateKeyAnalyticsCache).

import { prisma } from '../../utils/prisma.utils';
import { cacheGetJson, cacheSetJson, cacheInvalidate } from '../../utils/redis.utils';

// ── Constants ─────────────────────────────────────────────────

const KEY_ANALYTICS_TTL = 300;        // 5 min
const PLATFORM_ANALYTICS_TTL = 300;   // 5 min

const KEY_ANALYTICS_CACHE_PREFIX = 'key:analytics:payment-assets';
const PLATFORM_ANALYTICS_CACHE_KEY = 'platform:analytics:payment-assets';

// ── Cache helpers (exported for route-layer invalidation) ─────

export function buildKeyAnalyticsCacheKey(keyId: string): string {
   return `${KEY_ANALYTICS_CACHE_PREFIX}:${keyId}`;
}

export async function invalidateKeyAnalyticsCache(keyId: string): Promise<void> {
   await cacheInvalidate(
      buildKeyAnalyticsCacheKey(keyId),
      PLATFORM_ANALYTICS_CACHE_KEY,
   );
}

// ── Shared item shapes ────────────────────────────────────────

export interface PaymentAssetBreakdownItem {
   /** Normalised asset code, e.g. 'XLM', 'USDC'. */
   paymentAsset: string;
   tradeCount: number;
   uniqueBuyers: number;
   /** Sum of the raw `price` field (stroops) as a string to preserve precision. */
   totalPriceStroops: string;
}

export interface KeyPaymentAssetAnalytics {
   keyId: string;
   generatedAt: string;
   breakdown: PaymentAssetBreakdownItem[];
}

export interface PlatformPaymentAssetEntry extends PaymentAssetBreakdownItem {
   /** Percentage share of total platform trade count, rounded to 4 dp. */
   sharePercent: number;
}

export interface PlatformPaymentAssetDistribution {
   generatedAt: string;
   totalTrades: number;
   breakdown: PlatformPaymentAssetEntry[];
}

// ── Per-key analytics ─────────────────────────────────────────

/**
 * Return trade counts, unique buyers, and total price grouped by paymentAsset
 * for a single creator key.
 *
 * Trades with no paymentAsset (pre-migration rows) have DEFAULT 'XLM' so they
 * are automatically included in the XLM bucket.
 *
 * Cached for 5 minutes per keyId.
 */
export async function getKeyPaymentAssetAnalytics(
   keyId: string
): Promise<KeyPaymentAssetAnalytics> {
   const cacheKey = buildKeyAnalyticsCacheKey(keyId);
   const cached = await cacheGetJson<KeyPaymentAssetAnalytics>(cacheKey);
   if (cached) return cached;

   // Resolve by id OR handle so the route can pass either.
   const profile = await prisma.creatorProfile.findFirst({
      where: { OR: [{ id: keyId }, { handle: keyId }] },
      select: { id: true },
   });
   const resolvedId = profile?.id ?? keyId;

   // groupBy paymentAsset, counting rows and summing price.
   const rows = await prisma.trade.groupBy({
      by: ['paymentAsset'],
      where: { creatorId: resolvedId },
      _count: { _all: true },
      _sum:   { price: false } as any, // price is String — handled via raw below
   });

   // Prisma groupBy can't SUM a String field, so we fetch the raw sums with
   // findMany and aggregate in JS. The dataset per key is bounded; for very
   // high volume keys this is still fast because we only pull (paymentAsset,
   // price, buyer) tuples.
   const trades = await prisma.trade.findMany({
      where: { creatorId: resolvedId },
      select: { paymentAsset: true, price: true, buyer: true },
   });

   const assetMap = new Map<string, { count: number; buyers: Set<string>; totalStroops: bigint }>();

   for (const t of trades) {
      const asset = t.paymentAsset;
      if (!assetMap.has(asset)) {
         assetMap.set(asset, { count: 0, buyers: new Set(), totalStroops: 0n });
      }
      const bucket = assetMap.get(asset)!;
      bucket.count++;
      bucket.buyers.add(t.buyer);
      try {
         bucket.totalStroops += BigInt(t.price);
      } catch {
         // non-numeric price — skip sum contribution
      }
   }

   const breakdown: PaymentAssetBreakdownItem[] = Array.from(assetMap.entries())
      .map(([paymentAsset, b]) => ({
         paymentAsset,
         tradeCount: b.count,
         uniqueBuyers: b.buyers.size,
         totalPriceStroops: b.totalStroops.toString(),
      }))
      .sort((a, b) => b.tradeCount - a.tradeCount);

   const result: KeyPaymentAssetAnalytics = {
      keyId: resolvedId,
      generatedAt: new Date().toISOString(),
      breakdown,
   };

   await cacheSetJson(cacheKey, result, KEY_ANALYTICS_TTL);
   return result;
}

// ── Platform-wide distribution ────────────────────────────────

/**
 * Return the platform-wide payment-asset distribution across all trades.
 *
 * Each entry includes a `sharePercent` (percentage of total trade count).
 * Sorted by tradeCount descending so the dominant asset appears first.
 *
 * Cached for 5 minutes (single key, no per-key variation).
 */
export async function getPlatformPaymentAssetDistribution(): Promise<PlatformPaymentAssetDistribution> {
   const cached = await cacheGetJson<PlatformPaymentAssetDistribution>(PLATFORM_ANALYTICS_CACHE_KEY);
   if (cached) return cached;

   const trades = await prisma.trade.findMany({
      select: { paymentAsset: true, price: true, buyer: true },
   });

   const assetMap = new Map<string, { count: number; buyers: Set<string>; totalStroops: bigint }>();

   for (const t of trades) {
      const asset = t.paymentAsset;
      if (!assetMap.has(asset)) {
         assetMap.set(asset, { count: 0, buyers: new Set(), totalStroops: 0n });
      }
      const bucket = assetMap.get(asset)!;
      bucket.count++;
      bucket.buyers.add(t.buyer);
      try {
         bucket.totalStroops += BigInt(t.price);
      } catch {
         // non-numeric price — skip
      }
   }

   const totalTrades = trades.length;

   const breakdown: PlatformPaymentAssetEntry[] = Array.from(assetMap.entries())
      .map(([paymentAsset, b]) => ({
         paymentAsset,
         tradeCount: b.count,
         uniqueBuyers: b.buyers.size,
         totalPriceStroops: b.totalStroops.toString(),
         sharePercent:
            totalTrades > 0
               ? Math.round((b.count / totalTrades) * 100 * 10_000) / 10_000
               : 0,
      }))
      .sort((a, b) => b.tradeCount - a.tradeCount);

   const result: PlatformPaymentAssetDistribution = {
      generatedAt: new Date().toISOString(),
      totalTrades,
      breakdown,
   };

   await cacheSetJson(PLATFORM_ANALYTICS_CACHE_KEY, result, PLATFORM_ANALYTICS_TTL);
   return result;
}
