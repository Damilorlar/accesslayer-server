import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';

describe('GET /api/v1/creators/:id/holders empty list', () => {
   let creatorId: string;

   beforeAll(async () => {
      const user = await prisma.user.create({
         data: {
            id: 'holder-empty-test-user',
            email: 'holder-empty-test@example.com',
            passwordHash: 'dummy-hash',
            firstName: 'Holder',
            lastName: 'EmptyTest',
         },
      });

      const creator = await prisma.creatorProfile.create({
         data: {
            userId: user.id,
            handle: 'holder-empty-creator',
            displayName: 'Holder Empty Creator',
         },
      });
      creatorId = creator.id;
   });

   afterAll(async () => {
      await prisma.creatorProfile.delete({
         where: { id: creatorId },
      });
      await prisma.user.delete({
         where: { id: 'holder-empty-test-user' },
      });
      await prisma.$disconnect();
   });

   it('returns 200 with empty items array for a creator with no holders', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators/${creatorId}/holders`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.meta).toMatchObject({
         total: 0,
         hasMore: false,
      });
   });
});
