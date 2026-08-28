// src/modules/keys/price-moved.redis.ts
import { getRequiredRedisClient } from '../../utils/redis.utils';
import { prisma } from '../../utils/prisma.utils';
import {
   PRICE_MOVED_SET_TTL_SECONDS,
   REDIS_KEYS,
} from '../../constants/notifications.constants';

export async function writePriceMovedKeys(keyIds: string[]): Promise<void> {
   const redis = getRequiredRedisClient();
   const pipeline = redis.pipeline();
   pipeline.del(REDIS_KEYS.priceMovedSet);
   if (keyIds.length > 0) {
      pipeline.sadd(REDIS_KEYS.priceMovedSet, ...keyIds);
      pipeline.expire(REDIS_KEYS.priceMovedSet, PRICE_MOVED_SET_TTL_SECONDS);
   }
   await pipeline.exec();
}

export async function getPriceMovedKeyIds(): Promise<string[]> {
   return getRequiredRedisClient().smembers(REDIS_KEYS.priceMovedSet);
}

export async function markPriceMovedDelivered(
   keyId: string,
   walletAddress: string
): Promise<void> {
   const redis = getRequiredRedisClient();
   const deliveredKey = REDIS_KEYS.priceMovedDelivered(keyId);
   await redis.sadd(deliveredKey, walletAddress);
   await redis.expire(deliveredKey, PRICE_MOVED_SET_TTL_SECONDS);

   const [deliveredCount, holderCount] = await Promise.all([
      redis.scard(deliveredKey),
      prisma.keyOwnership.count({
         where: { creatorId: keyId, balance: { gt: 0 } },
      }),
   ]);

   if (holderCount > 0 && deliveredCount >= holderCount) {
      await redis.srem(REDIS_KEYS.priceMovedSet, keyId);
      await redis.del(deliveredKey);
   }
}
