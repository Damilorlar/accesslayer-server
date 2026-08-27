export type PaginationMeta = {
   page: number;
   pageSize: number;
   totalItems: number;
   totalPages: number;
   hasNextPage: boolean;
   hasPreviousPage: boolean;
};

export type PaginationMetaParams = {
   page: number;
   pageSize: number;
   totalItems: number;
};

export type OffsetPaginationMeta = {
   limit: number;
   offset: number;
   total: number;
   hasMore: boolean;
   searchTerm?: string;
};

export type OffsetPaginationMetaParams = {
   limit: number;
   offset: number;
   total: number;
   searchTerm?: string;
};

export const buildPaginationMeta = ({
   page,
   pageSize,
   totalItems,
}: PaginationMetaParams): PaginationMeta => {
   const safePageSize = Math.max(1, Math.floor(pageSize));
   const safeTotalItems = Math.max(0, Math.floor(totalItems));
   const totalPages = Math.ceil(safeTotalItems / safePageSize);
   const safePage =
      totalPages === 0
         ? 1
         : Math.min(totalPages, Math.max(1, Math.floor(page)));

   return {
      page: safePage,
      pageSize: safePageSize,
      totalItems: safeTotalItems,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
   };
};

export const buildOffsetPaginationMeta = ({
   limit,
   offset,
   total,
   searchTerm,
}: OffsetPaginationMetaParams): OffsetPaginationMeta => {
   const safeLimit = Math.max(1, Math.floor(limit));
   const safeOffset = Math.max(0, Math.floor(offset));
   const safeTotal = Math.max(0, Math.floor(total));

   return {
      limit: safeLimit,
      offset: safeOffset,
      total: safeTotal,
      hasMore: safeOffset + safeLimit < safeTotal,
      ...(searchTerm !== undefined ? { searchTerm } : {}),
   };
};

export type CursorPaginationOptions = {
   cursor?: any;
   limit: number;
};

export type CursorPaginationResult<T> = {
   data: T[];
   nextCursor?: any;
   hasMore: boolean;
};

/**
 * Helper for cursor-based pagination.
 * Appends cursor filtering and limit to a query function.
 *
 * @param query A function that accepts pagination args and executes the DB query
 * @param options Pagination options containing cursor and limit
 * @param getCursor Optional function to extract the cursor from the last item. Defaults to extracting the `id` property.
 */
export async function paginateQuery<T>(
   query: (args: { take: number; skip?: number; cursor?: any }) => Promise<T[]>,
   { cursor, limit }: CursorPaginationOptions,
   getCursor?: (item: T) => any
): Promise<CursorPaginationResult<T>> {
   const take = limit + 1;
   const args: { take: number; skip?: number; cursor?: any } = { take };

   if (cursor) {
      args.cursor = cursor;
      args.skip = 1;
   }

   const results = await query(args);

   const hasMore = results.length > limit;
   const data = hasMore ? results.slice(0, limit) : results;

   let nextCursor = undefined;
   if (data.length > 0 && hasMore) {
      const lastItem = data[data.length - 1];
      nextCursor = getCursor ? getCursor(lastItem) : (lastItem as any).id;
   }

   return { data, nextCursor, hasMore };
}

export type PaginatedResponse<T> = {
   items: T[];
   has_more: boolean;
   next_cursor: string | null;
};

/**
 * Builds a paginated response envelope from an over-fetched result set.
 *
 * Callers fetch up to `limit + 1` items; if the extra item is present, it is
 * popped off and used to derive `next_cursor` for the next page.
 *
 * @param items Result set, expected to contain up to `limit + 1` items
 * @param limit The page size requested by the caller
 * @param cursorFn Extracts the cursor value from the last item kept on the page
 */
export function buildPaginatedResponse<T>(
   items: T[],
   limit: number,
   cursorFn: (item: T) => string
): PaginatedResponse<T> {
   if (items.length > limit) {
      const page = items.slice(0, limit);
      return {
         items: page,
         has_more: true,
         next_cursor: cursorFn(page[page.length - 1]),
      };
   }

   return {
      items,
      has_more: false,
      next_cursor: null,
   };
}
