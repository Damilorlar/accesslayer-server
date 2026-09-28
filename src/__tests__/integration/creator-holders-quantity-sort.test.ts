import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';

describe('GET /api/v1/creators/:id/holders — quantity descending order (#604)', () => {
   let creatorId: string;
   let singleHolderCreatorId: string;

   beforeAll(async () => {
      const user = await prisma.user.create({
         data: {
            id: 'holder-qty-sort-test-user',
            email: 'holder-qty-sort-test@example.com',
            passwordHash: 'dummy-hash',
            firstName: 'HolderQty',
            lastName: 'SortTest',
         },
      });

      const creator = await prisma.creatorProfile.create({
         data: {
            userId: user.id,
            handle: 'holder-qty-sort-creator',
            displayName: 'Holder Quantity Sort Creator',
         },
      });
      creatorId = creator.id;

      // Seed four holders with quantities 5, 1, 10, 3 for the same creator
      await prisma.keyOwnership.createMany({
         data: [
            { ownerAddress: '0xqty-5', creatorId: creator.id, balance: 5 },
            { ownerAddress: '0xqty-1', creatorId: creator.id, balance: 1 },
            { ownerAddress: '0xqty-10', creatorId: creator.id, balance: 10 },
            { ownerAddress: '0xqty-3', creatorId: creator.id, balance: 3 },
         ],
      });

      const singleUser = await prisma.user.create({
         data: {
            id: 'holder-qty-sort-single-user',
            email: 'holder-qty-sort-single@example.com',
            passwordHash: 'dummy-hash',
            firstName: 'HolderQtySingle',
            lastName: 'SortTest',
         },
      });

      const singleCreator = await prisma.creatorProfile.create({
         data: {
            userId: singleUser.id,
            handle: 'holder-qty-sort-single-creator',
            displayName: 'Holder Quantity Sort Single Creator',
         },
      });
      singleHolderCreatorId = singleCreator.id;

      await prisma.keyOwnership.create({
         data: {
            ownerAddress: '0xqty-single',
            creatorId: singleCreator.id,
            balance: 7,
         },
      });
   });

   afterAll(async () => {
      await prisma.keyOwnership.deleteMany({
         where: { creatorId: { in: [creatorId, singleHolderCreatorId] } },
      });
      await prisma.creatorProfile.deleteMany({
         where: { id: { in: [creatorId, singleHolderCreatorId] } },
      });
      await prisma.user.deleteMany({
         where: {
            id: {
               in: ['holder-qty-sort-test-user', 'holder-qty-sort-single-user'],
            },
         },
      });
      await prisma.$disconnect();
   });

   it('returns all four holders sorted by quantity descending: 10, 5, 3, 1', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${creatorId}/holders`
      );
      expect(res.status).toBe(200);

      const items = res.body.data.items;
      expect(items).toHaveLength(4);

      const quantities = items.map((item: any) => item.key_balance);
      expect(quantities).toEqual([10, 5, 3, 1]);

      const addresses = items.map((item: any) => item.wallet_address);
      expect(addresses).toEqual(['0xqty-10', '0xqty-5', '0xqty-3', '0xqty-1']);
   });

   it('handles a creator with a single holder correctly', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${singleHolderCreatorId}/holders`
      );
      expect(res.status).toBe(200);

      const items = res.body.data.items;
      expect(items).toHaveLength(1);
      expect(items[0].wallet_address).toBe('0xqty-single');
      expect(items[0].key_balance).toBe(7);
   });
});
