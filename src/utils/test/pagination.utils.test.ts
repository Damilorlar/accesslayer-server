import { paginateQuery, buildPaginatedResponse } from '../pagination.utils';

describe('paginateQuery', () => {
   const mockData = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
      { id: 4, name: 'David' },
      { id: 5, name: 'Eve' },
   ];

   const mockQueryFn = jest
      .fn()
      .mockImplementation(async ({ take, skip, cursor }) => {
         let startIndex = 0;
         if (cursor) {
            startIndex = mockData.findIndex(item => item.id === cursor);
            if (startIndex === -1) return [];
         }
         if (skip) startIndex += skip;

         return mockData.slice(startIndex, startIndex + take);
      });

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('returns first page with no cursor', async () => {
      const result = await paginateQuery(mockQueryFn, { limit: 2 });

      expect(mockQueryFn).toHaveBeenCalledWith({ take: 3 });
      expect(result.data).toHaveLength(2);
      expect(result.data).toEqual([
         { id: 1, name: 'Alice' },
         { id: 2, name: 'Bob' },
      ]);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(2);
   });

   it('returns subsequent page with cursor', async () => {
      const result = await paginateQuery(mockQueryFn, { cursor: 2, limit: 2 });

      expect(mockQueryFn).toHaveBeenCalledWith({ take: 3, skip: 1, cursor: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.data).toEqual([
         { id: 3, name: 'Charlie' },
         { id: 4, name: 'David' },
      ]);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(4);
   });

   it('returns last page where hasMore is false', async () => {
      const result = await paginateQuery(mockQueryFn, { cursor: 4, limit: 2 });

      expect(mockQueryFn).toHaveBeenCalledWith({ take: 3, skip: 1, cursor: 4 });
      expect(result.data).toHaveLength(1);
      expect(result.data).toEqual([{ id: 5, name: 'Eve' }]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
   });
});

describe('paginateQuery - multi-page coverage with 15 trade records', () => {
   const TOTAL = 15;
   const PAGE_SIZE = 5;

   interface TradeRecord {
      id: number;
      ledger: number;
      tx_hash: string;
   }

   const allTrades: TradeRecord[] = Array.from({ length: TOTAL }, (_, i) => ({
      id: i + 1,
      ledger: 500_000 + i,
      tx_hash: `0x${String(i + 1).padStart(64, '0')}`,
   }));

   const mockQueryFn = jest
      .fn()
      .mockImplementation(
         async ({
            take,
            skip,
            cursor,
         }: {
            take: number;
            skip?: number;
            cursor?: number;
         }): Promise<TradeRecord[]> => {
            let startIndex = 0;
            if (cursor !== undefined) {
               startIndex = allTrades.findIndex(r => r.id === cursor);
               if (startIndex === -1) return [];
            }
            if (skip) startIndex += skip;
            return allTrades.slice(startIndex, startIndex + take);
         }
      );

   afterEach(() => {
      jest.clearAllMocks();
   });

   it('covers all 15 records across three pages with no duplicates', async () => {
      const allSeen: TradeRecord[] = [];

      const page1 = await paginateQuery<TradeRecord>(mockQueryFn, {
         limit: PAGE_SIZE,
      });
      expect(page1.data).toHaveLength(PAGE_SIZE);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();
      allSeen.push(...page1.data);

      const page2 = await paginateQuery<TradeRecord>(mockQueryFn, {
         cursor: page1.nextCursor,
         limit: PAGE_SIZE,
      });
      expect(page2.data).toHaveLength(PAGE_SIZE);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).toBeDefined();
      allSeen.push(...page2.data);

      const page3 = await paginateQuery<TradeRecord>(mockQueryFn, {
         cursor: page2.nextCursor,
         limit: PAGE_SIZE,
      });
      expect(page3.data).toHaveLength(PAGE_SIZE);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeUndefined();
      allSeen.push(...page3.data);

      expect(allSeen).toHaveLength(TOTAL);
      expect(new Set(allSeen.map(r => r.id)).size).toBe(TOTAL);
   });

   it('each page cursor correctly advances to the next set', async () => {
      const page1 = await paginateQuery<TradeRecord>(mockQueryFn, {
         limit: PAGE_SIZE,
      });
      expect(page1.data.map(r => r.id)).toEqual([1, 2, 3, 4, 5]);
      expect(page1.nextCursor).toBe(5);

      const page2 = await paginateQuery<TradeRecord>(mockQueryFn, {
         cursor: page1.nextCursor,
         limit: PAGE_SIZE,
      });
      expect(page2.data.map(r => r.id)).toEqual([6, 7, 8, 9, 10]);
      expect(page2.nextCursor).toBe(10);

      const page3 = await paginateQuery<TradeRecord>(mockQueryFn, {
         cursor: page2.nextCursor,
         limit: PAGE_SIZE,
      });
      expect(page3.data.map(r => r.id)).toEqual([11, 12, 13, 14, 15]);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeUndefined();
   });

   it('final page returns hasMore false', async () => {
      const page2 = await paginateQuery<TradeRecord>(mockQueryFn, {
         cursor: 10,
         limit: PAGE_SIZE,
      });
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeUndefined();
   });

   it('no records are skipped between pages', async () => {
      const page1 = await paginateQuery<TradeRecord>(mockQueryFn, {
         limit: PAGE_SIZE,
      });
      const page2 = await paginateQuery<TradeRecord>(mockQueryFn, {
         cursor: page1.nextCursor,
         limit: PAGE_SIZE,
      });

      const allIds = [
         ...page1.data.map(r => r.id),
         ...page2.data.map(r => r.id),
      ];
      const expectedIds = Array.from(
         { length: page1.data.length + page2.data.length },
         (_, i) => i + 1
      );
      expect(allIds).toEqual(expectedIds);
   });
});

describe('buildPaginatedResponse', () => {
   const items = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
   ];
   const cursorFn = (item: { id: number }) => String(item.id);

   it('returns has_more: false and next_cursor: null when items are under the limit', () => {
      const result = buildPaginatedResponse(items.slice(0, 2), 5, cursorFn);

      expect(result.items).toEqual(items.slice(0, 2));
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
   });

   it('returns has_more: false and next_cursor: null when items exactly match the limit', () => {
      const result = buildPaginatedResponse(items, 3, cursorFn);

      expect(result.items).toEqual(items);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
   });

   it('pops the extra item and sets next_cursor when items exceed the limit', () => {
      const result = buildPaginatedResponse(items, 2, cursorFn);

      expect(result.items).toEqual(items.slice(0, 2));
      expect(result.has_more).toBe(true);
      expect(result.next_cursor).toBe('2');
   });

   it('returns an empty items array with has_more: false for an empty result set', () => {
      const result = buildPaginatedResponse([], 5, cursorFn);

      expect(result.items).toEqual([]);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
   });

   it('returns has_more: true with 1 item when limit is 1 and there are 2 results', () => {
      const result = buildPaginatedResponse(items.slice(0, 2), 1, cursorFn);

      expect(result.items).toEqual(items.slice(0, 1));
      expect(result.has_more).toBe(true);
      expect(result.next_cursor).toBe('1');
   });

   it('returns has_more: false with the single item when limit is 1 and there is exactly 1 result', () => {
      const result = buildPaginatedResponse(items.slice(0, 1), 1, cursorFn);

      expect(result.items).toEqual(items.slice(0, 1));
      expect(result.items).toHaveLength(1);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
   });
});
