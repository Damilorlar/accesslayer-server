// Integration test: trade history endpoint returns an empty page for a
// wallet with no trades (#642)
//
// Scope:
//   - Calls GET /api/v1/wallets/:address/activity for a valid Stellar
//     address that has no Activity rows
//   - Asserts 200 — an untraded wallet is a valid wallet, not a missing one,
//     so it must not surface as 404 or as an error envelope
//   - Asserts items is an empty array
//   - Asserts meta.hasMore is false and meta.nextCursor is null
//
// Note on field names: the issue describes these as `has_more` and
// `next_cursor`. The endpoint serializes pagination metadata in camelCase
// (`hasMore`, `nextCursor`) nested under `data.meta`, which is what these
// assertions pin. See the PR description.
//
// Requests go through the real Express app via supertest, so routing,
// address validation, the controller, the service and JSON serialization all
// participate. Only Prisma is mocked — no database required.

import request from 'supertest';
import { prisma } from '../../utils/prisma.utils';

jest.mock('../../utils/prisma.utils', () => ({
   prisma: {
      activity: {
         findMany: jest.fn(),
         count: jest.fn(),
      },
      creatorProfile: {
         findMany: jest.fn(),
      },
   },
}));

import app from '../../app';

const mockPrisma = prisma as unknown as {
   activity: { findMany: jest.Mock; count: jest.Mock };
   creatorProfile: { findMany: jest.Mock };
};

// A structurally valid Stellar address that owns no trades.
const WALLET_WITHOUT_TRADES =
   'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const ACTIVITY_PATH = `/api/v1/wallets/${WALLET_WITHOUT_TRADES}/activity`;

/**
 * Stubs Prisma as a database holding no Activity rows for this wallet.
 */
function givenWalletHasNoTrades(): void {
   mockPrisma.activity.findMany.mockResolvedValue([]);
   mockPrisma.activity.count.mockResolvedValue(0);
   mockPrisma.creatorProfile.findMany.mockResolvedValue([]);
}

/**
 * Asserts the full empty-page contract from the acceptance criteria.
 *
 * `nextCursor` is checked with toHaveProperty rather than a plain equality
 * against null, because the two failure modes are different and only one of
 * them is caught by equality: a key that is absent from the payload reads
 * back as undefined, and a client doing `meta.nextCursor === null` to decide
 * whether to stop paging would behave differently than one checking for a
 * falsy value. The criterion is that the key is present and null, so that is
 * what gets asserted.
 */
function expectEmptyActivityPage(body: any): void {
   expect(body.success).toBe(true);
   expect(body.data.items).toEqual([]);
   expect(body.data.meta.hasMore).toBe(false);
   expect(body.data.meta).toHaveProperty('nextCursor', null);
}

describe('GET /api/v1/wallets/:address/activity — wallet with no trades (#642)', () => {
   beforeEach(() => {
      jest.clearAllMocks();
      givenWalletHasNoTrades();
   });

   it('returns 200 with an empty page rather than 404', async () => {
      const response = await request(app).get(ACTIVITY_PATH);

      expect(response.status).toBe(200);
      expectEmptyActivityPage(response.body);
   });

   it('reports zero total and no error envelope', async () => {
      const response = await request(app).get(ACTIVITY_PATH).expect(200);

      expect(response.body.data.meta.total).toBe(0);
      // An empty result is a success, so the error envelope must be absent
      // entirely — not present-but-empty.
      expect(response.body.error).toBeUndefined();
   });

   it('queries trade activity scoped to the requested wallet', async () => {
      await request(app).get(ACTIVITY_PATH).expect(200);

      // Without this, the assertions above would still pass if the handler
      // queried some other wallet, or none at all — the empty page would be
      // incidental rather than a real answer about this address.
      expect(mockPrisma.activity.findMany).toHaveBeenCalledTimes(1);
      const where = mockPrisma.activity.findMany.mock.calls[0][0].where;
      expect(where.actor).toBe(WALLET_WITHOUT_TRADES);
      expect(where.type).toEqual({ in: ['KEY_BOUGHT', 'KEY_SOLD'] });
   });

   it('serializes nextCursor as a literal null in the response body', async () => {
      const response = await request(app).get(ACTIVITY_PATH).expect(200);

      // Guards the wire format directly: a serializer that drops null-valued
      // keys would satisfy an assertion made against a re-parsed object in
      // some shapes, but changes what the client actually receives.
      expect(response.text).toContain('"nextCursor":null');
   });

   // The empty-page contract must not depend on which optional filters were
   // supplied — a filter that happens to match nothing is the same situation
   // as a wallet that has never traded, and both are the case this endpoint
   // is most likely to hit in production.
   describe.each([
      ['type=buy', '?type=buy'],
      ['type=sell', '?type=sell'],
      ['creator_id', '?creator_id=creator-with-no-trades'],
      ['explicit pagination', '?limit=50&offset=0'],
      ['offset past the end', '?limit=20&offset=500'],
      ['combined filters', '?type=buy&creator_id=creator-1&limit=5'],
   ])('with %s', (_label, queryString) => {
      it('still returns 200 and the same empty page', async () => {
         const response = await request(app).get(
            `${ACTIVITY_PATH}${queryString}`
         );

         expect(response.status).toBe(200);
         expectEmptyActivityPage(response.body);
      });
   });

   it('returns an empty page when a cursor is supplied but matches nothing', async () => {
      // Cursor-based paging takes a different branch in the service than
      // offset paging, and it computes hasMore from the returned row count
      // rather than from the total — so it needs its own case.
      const cursor = Buffer.from(
         JSON.stringify({ id: 'activity-that-no-longer-exists' })
      ).toString('base64url');

      const response = await request(app).get(
         `${ACTIVITY_PATH}?cursor=${cursor}`
      );

      expect(response.status).toBe(200);
      expectEmptyActivityPage(response.body);
   });
});
