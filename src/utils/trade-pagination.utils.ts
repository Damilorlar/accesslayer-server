import { encodeCursor, decodeCursor } from './cursor.utils';

export interface TradeRecord {
   id: string;
   buyer: string;
   creatorId: string;
   quantity: string;
   price: string;
   ledger: number;
   txHash: string;
   timestamp: Date;
}

export interface TradeCursorPayload {
   ledger: number;
   tx_hash: string;
}

export interface PaginatedTradesResult {
   items: TradeRecord[];
   cursor: string | null;
   has_more: boolean;
}

/**
 * Keyset cursor helper for standardising pagination across all trade history queries.
 *
 * @param creatorId - The target creator's ID
 * @param cursor - Encoded (ledger, tx_hash) cursor or null for first page
 * @param limit - Page size limit
 * @param db - Prisma client instance
 */
export async function queryTradesPage(
   creatorId: string,
   cursor: string | null,
   limit: number,
   db: any
): Promise<PaginatedTradesResult> {
   const take = Math.max(1, limit);

   let whereClause: any = { creatorId };

   if (cursor) {
      const decoded = decodeCursor<TradeCursorPayload>(cursor);
      whereClause = {
         creatorId,
         OR: [
            { ledger: { lt: decoded.ledger } },
            {
               ledger: decoded.ledger,
               txHash: { lt: decoded.tx_hash },
            },
         ],
      };
   }

   const records: TradeRecord[] = await db.trade.findMany({
      where: whereClause,
      orderBy: [{ ledger: 'desc' }, { txHash: 'desc' }],
      take: take + 1,
   });

   const has_more = records.length > take;
   const items = has_more ? records.slice(0, take) : records;

   let nextCursor: string | null = null;
   if (items.length > 0 && has_more) {
      const lastItem = items[items.length - 1];
      nextCursor = encodeCursor<TradeCursorPayload>({
         ledger: lastItem.ledger,
         tx_hash: lastItem.txHash,
      });
   }

   return {
      items,
      cursor: nextCursor,
      has_more,
   };
}
