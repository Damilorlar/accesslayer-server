// Integration test: GET /api/v1/creators/:id/holders — key count sort (#692)
//
// Verifies holders are returned sorted descending by key count, that ties
// are broken alphabetically by wallet address, and that each entry includes
// wallet_address, key_count, share_percent, and rank.

import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';

const WALLET_A = '0xAAAA000000000000000000000000000000000A'; // 10 keys
const WALLET_B = '0xBBBB000000000000000000000000000000000B'; // 5 keys
const WALLET_C = '0xCCCC000000000000000000000000000000000C'; // 10 keys, ties with A

describe('GET /api/v1/creators/:id/holders — key count descending (#692)', () => {
   let creatorId: string;

   beforeAll(async () => {
      const user = await prisma.user.create({
         data: {
            id: 'holder-key-count-sort-user',
            email: 'holder-key-count-sort@example.com',
            passwordHash: 'dummy-hash',
            firstName: 'HolderKeyCount',
            lastName: 'SortTest',
         },
      });

      const creator = await prisma.creatorProfile.create({
         data: {
            userId: user.id,
            handle: 'holder-key-count-sort-creator',
            displayName: 'Holder Key Count Sort Creator',
         },
      });
      creatorId = creator.id;

      await prisma.keyOwnership.createMany({
         data: [
            { ownerAddress: WALLET_B, creatorId, balance: 5 },
            { ownerAddress: WALLET_C, creatorId, balance: 10 },
            { ownerAddress: WALLET_A, creatorId, balance: 10 },
         ],
      });
   });

   afterAll(async () => {
      await prisma.keyOwnership.deleteMany({ where: { creatorId } });
      await prisma.creatorProfile.delete({ where: { id: creatorId } });
      await prisma.user.delete({ where: { id: 'holder-key-count-sort-user' } });
      await prisma.$disconnect();
   });

   it('sorts holders descending by key count with A and C before B', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${creatorId}/holders`
      );

      expect(res.status).toBe(200);
      const items = res.body.data.items;
      expect(items.map((i: any) => i.wallet_address)).toEqual([
         WALLET_A,
         WALLET_C,
         WALLET_B,
      ]);
   });

   it('breaks the tie between A and C alphabetically by wallet address', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${creatorId}/holders`
      );

      const [first, second] = res.body.data.items;
      expect(first.wallet_address).toBe(WALLET_A);
      expect(second.wallet_address).toBe(WALLET_C);
      expect(WALLET_A < WALLET_C).toBe(true);
   });

   it('each entry includes wallet_address, key_count, share_percent, and rank', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${creatorId}/holders`
      );

      const items = res.body.data.items;
      expect(items).toHaveLength(3);
      for (const item of items) {
         expect(item).toHaveProperty('wallet_address');
         expect(item).toHaveProperty('key_count');
         expect(item).toHaveProperty('share_percent');
         expect(item).toHaveProperty('rank');
      }

      expect(items.map((i: any) => i.rank)).toEqual([1, 2, 3]);
      expect(items.map((i: any) => i.key_count)).toEqual([10, 10, 5]);
   });

   it('share percentages across all holders sum to 100%', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${creatorId}/holders`
      );

      const items = res.body.data.items;
      const totalShare = items.reduce(
         (sum: number, i: any) => sum + i.share_percent,
         0
      );
      expect(totalShare).toBeCloseTo(100, 5);
   });
});
