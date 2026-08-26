// Integration test: transaction history endpoint sort order (#683)
//
// Verifies GET /api/v1/wallets/:address/activity always returns entries
// newest-first by createdAt, regardless of insertion order, and that the
// sort order is preserved across paginated pages.

import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';

const WALLET_ADDRESS =
   'GORDERTESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TEST_USER_ID = 'wallet-order-test-user';

describe('GET /api/v1/wallets/:address/activity — descending timestamp order', () => {
   let creatorId: string;

   // Timestamps intentionally inserted out of chronological order.
   const base = Date.now();
   const T_PLUS_30 = new Date(base + 30_000);
   const T_PLUS_10 = new Date(base + 10_000);
   const T_PLUS_20 = new Date(base + 20_000);

   beforeAll(async () => {
      const user = await prisma.user.create({
         data: {
            id: TEST_USER_ID,
            email: 'wallet-order-test@example.com',
            passwordHash: 'dummy-hash',
            firstName: 'Order',
            lastName: 'Test',
         },
      });

      const creator = await prisma.creatorProfile.create({
         data: {
            userId: user.id,
            handle: 'wallet-order-test-creator',
            displayName: 'Wallet Order Test Creator',
         },
      });
      creatorId = creator.id;

      // Insert out of order: +30s, then +10s, then +20s.
      for (const createdAt of [T_PLUS_30, T_PLUS_10, T_PLUS_20]) {
         await prisma.activity.create({
            data: {
               type: 'KEY_BOUGHT',
               actor: WALLET_ADDRESS,
               creatorId,
               payload: {
                  amount: '1',
                  price_at_trade: '1',
                  fee_paid: '0.01',
                  ledger_sequence: 1,
               },
               createdAt,
            },
         });
      }
   });

   afterAll(async () => {
      await prisma.activity.deleteMany({ where: { actor: WALLET_ADDRESS } });
      await prisma.creatorProfile.delete({ where: { id: creatorId } });
      await prisma.user.delete({ where: { id: TEST_USER_ID } });
      await prisma.$disconnect();
   });

   it('returns entries newest-first regardless of insertion order', async () => {
      const res = await supertest(app).get(
         `/api/v1/wallets/${WALLET_ADDRESS}/activity?limit=20&offset=0`
      );

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items).toHaveLength(3);
      expect(items.map((i: any) => i.timestamp)).toEqual([
         T_PLUS_30.toISOString(),
         T_PLUS_20.toISOString(),
         T_PLUS_10.toISOString(),
      ]);
   });

   it('maintains descending sort order across paginated pages', async () => {
      const pageOne = await supertest(app).get(
         `/api/v1/wallets/${WALLET_ADDRESS}/activity?limit=2&offset=0`
      );
      const pageTwo = await supertest(app).get(
         `/api/v1/wallets/${WALLET_ADDRESS}/activity?limit=2&offset=2`
      );

      expect(pageOne.body.data.items.map((i: any) => i.timestamp)).toEqual([
         T_PLUS_30.toISOString(),
         T_PLUS_20.toISOString(),
      ]);
      expect(pageTwo.body.data.items.map((i: any) => i.timestamp)).toEqual([
         T_PLUS_10.toISOString(),
      ]);
   });

   it('created_at (timestamp) of each entry matches the inserted database value', async () => {
      const res = await supertest(app).get(
         `/api/v1/wallets/${WALLET_ADDRESS}/activity?limit=20&offset=0`
      );

      const [first, second, third] = res.body.data.items;
      expect(new Date(first.timestamp)).toEqual(T_PLUS_30);
      expect(new Date(second.timestamp)).toEqual(T_PLUS_20);
      expect(new Date(third.timestamp)).toEqual(T_PLUS_10);
   });
});
