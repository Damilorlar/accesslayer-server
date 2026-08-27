import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';
import { seedCreatorMarketFixture } from '../../utils/test/seeded-creator-fixtures.utils';

describe('GET /api/v1/creators - price sort stability across pages', () => {
   const PRICE = 1_000_000n;
   const PAGE_SIZE = 2;
   const PREFIX = 'creator-price-sort-stability';
   const SEED_ORDER = [3, 1, 2];

   const seededFixtures: Array<{ userId: string; creatorId: string }> = [];

   beforeAll(async () => {
      await prisma.creatorPriceSnapshot.deleteMany({
         where: { creatorId: { startsWith: `${PREFIX}-creator-` } },
      });
      await prisma.creatorProfile.deleteMany({
         where: { handle: { startsWith: `${PREFIX}-handle-` } },
      });
      await prisma.user.deleteMany({
         where: { id: { startsWith: `${PREFIX}-user-` } },
      });

      for (const seed of SEED_ORDER) {
         const fixture = await seedCreatorMarketFixture(prisma, seed, {
            prefix: PREFIX,
            price: PRICE,
            displayName: `Price Sort Creator ${seed}`,
         });
         seededFixtures.push(fixture);
      }
   });

   afterAll(async () => {
      const creatorIds = seededFixtures.map(fixture => fixture.creatorId);
      const userIds = seededFixtures.map(fixture => fixture.userId);

      await prisma.creatorPriceSnapshot.deleteMany({
         where: { creatorId: { in: creatorIds } },
      });
      await prisma.creatorProfile.deleteMany({
         where: { id: { in: creatorIds } },
      });
      await prisma.user.deleteMany({
         where: { id: { in: userIds } },
      });
      await prisma.$disconnect();
   });

   async function fetchPage(offset: number) {
      const res = await supertest(app).get(
         `/api/v1/creators?sort=price&order=desc&limit=${PAGE_SIZE}&offset=${offset}`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      return res.body.data;
   }

   it('returns each tied creator exactly once across pages in a stable order', async () => {
      const firstPassPageOne = await fetchPage(0);
      const firstPassPageTwo = await fetchPage(PAGE_SIZE);

      const secondPassPageOne = await fetchPage(0);
      const secondPassPageTwo = await fetchPage(PAGE_SIZE);

      expect(firstPassPageOne.meta.hasMore).toBe(true);
      expect(firstPassPageTwo.meta.hasMore).toBe(false);

      expect(firstPassPageOne.items.map((item: any) => item.id)).toEqual(
         secondPassPageOne.items.map((item: any) => item.id)
      );
      expect(firstPassPageTwo.items.map((item: any) => item.id)).toEqual(
         secondPassPageTwo.items.map((item: any) => item.id)
      );

      const combinedIds = [
         ...firstPassPageOne.items.map((item: any) => item.id),
         ...firstPassPageTwo.items.map((item: any) => item.id),
      ];

      expect(combinedIds).toHaveLength(3);
      expect(new Set(combinedIds).size).toBe(3);
      expect(combinedIds).toEqual(
         seededFixtures
            .map(fixture => fixture.creatorId)
            .sort((a, b) => a.localeCompare(b))
      );
   });
});
