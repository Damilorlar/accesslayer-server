import supertest from 'supertest';
import app from '../../app';
import { prisma } from '../../utils/prisma.utils';

const FIXTURE_SIZE = 105; // More than MAX_PAGE_SIZE (100)
const MAX_PAGE_SIZE = 100;

describe('GET /api/v1/creators — limit boundary integration', () => {
   beforeAll(async () => {
      // Seed test users
      const usersToCreate = Array.from({ length: FIXTURE_SIZE }).map(
         (_, i) => ({
            id: `limit-test-user-${i}`,
            email: `limit-test-user-${i}@example.com`,
            passwordHash: 'dummy-hash',
            firstName: 'Limit',
            lastName: `TestUser ${i}`,
         })
      );

      await prisma.user.createMany({
         data: usersToCreate,
         skipDuplicates: true,
      });

      // Seed test creators
      const creatorsToCreate = Array.from({ length: FIXTURE_SIZE }).map(
         (_, i) => ({
            userId: `limit-test-user-${i}`,
            handle: `limit-test-creator-${i}`,
            displayName: `Limit Test Creator ${i}`,
         })
      );

      await prisma.creatorProfile.createMany({
         data: creatorsToCreate,
         skipDuplicates: true,
      });
   });

   afterAll(async () => {
      // Cleanup
      await prisma.creatorProfile.deleteMany({
         where: { handle: { startsWith: 'limit-test-creator-' } },
      });

      await prisma.user.deleteMany({
         where: { id: { startsWith: 'limit-test-user-' } },
      });

      await prisma.$disconnect();
   });

   it('accepts limit equal to MAX_PAGE_SIZE and returns HTTP 200', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators?limit=${MAX_PAGE_SIZE}`
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(MAX_PAGE_SIZE);
      expect(res.body.data.meta.limit).toBe(MAX_PAGE_SIZE);
   });

   it('rejects limit one above MAX_PAGE_SIZE with HTTP 400', async () => {
      const res = await supertest(app).get(
         `/api/v1/creators?limit=${MAX_PAGE_SIZE + 1}`
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();

      // Assert the details explicitly name the 'limit' field and message
      const limitError = res.body.error.details.find(
         (d: any) => d.field === 'limit'
      );
      expect(limitError).toBeDefined();
      expect(limitError.message).toContain('Limit must be an integer between');
   });

   it('rejects a very large limit (e.g. 9999) with HTTP 400', async () => {
      const res = await supertest(app).get('/api/v1/creators?limit=9999');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      const limitError = res.body.error.details.find(
         (d: any) => d.field === 'limit'
      );
      expect(limitError).toBeDefined();
   });

   it('asserts the returned count never exceeds the maximum page size when using default limit', async () => {
      // When no limit param is provided, it should default to a size <= MAX_PAGE_SIZE (e.g. 20)
      const res = await supertest(app).get('/api/v1/creators');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
   });
});
