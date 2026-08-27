import supertest from 'supertest';
import { ErrorCode } from '../../constants/error.constants';

jest.mock('../../utils/prisma.utils', () => ({
   prisma: {
      $disconnect: jest.fn(),
   },
}));

jest.mock('../creator/creator-profile.service', () => ({
   creatorProfileExists: jest.fn().mockResolvedValue(false),
   getCreatorProfile: jest.fn(),
}));

describe('GET /api/v1/creators/:id — not found', () => {
   it('returns 404 with the standard error shape for a non-existent creator', async () => {
      const { default: app } = await import('../../app');

      const res = await supertest(app).get(
         '/api/v1/creators/non-existent-creator-for-404-test'
      );

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
         success: false,
         error: {
            code: ErrorCode.NOT_FOUND,
            message: expect.any(String),
         },
      });
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toMatch(/creator.*not found/i);
   });

   it('matches the standard 404 response shape used by other creator routes', async () => {
      const { default: app } = await import('../../app');

      const res = await supertest(app).get(
         '/api/v1/creators/non-existent-creator-for-404-test'
      );

      // Same envelope as GET /:id/holders and other 404s in the API:
      // exactly { success, error: { code, message } }, no extra fields.
      expect(res.body).toEqual({
         success: false,
         error: {
            code: 'NOT_FOUND',
            message: 'Creator not found',
         },
      });
   });

   it('does not leak database errors, table/model names, or stack traces', async () => {
      const { default: app } = await import('../../app');

      const res = await supertest(app).get(
         '/api/v1/creators/non-existent-creator-for-404-test'
      );

      const serializedBody = JSON.stringify(res.body).toLowerCase();

      const forbiddenPatterns = [
         'stack',
         'trace',
         'prisma',
         'creatorprofile',
         'creator_profile',
         'select ',
         'sql',
         '.ts:',
         '.js:',
         'node_modules',
         'at object',
         'errno',
         'econnrefused',
      ];

      for (const pattern of forbiddenPatterns) {
         expect(serializedBody).not.toContain(pattern);
      }

      // Only the documented error keys should be present—nothing
      // implementation-specific like a Prisma error `code`/`meta`/`clientVersion`.
      expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message']);
   });
});
