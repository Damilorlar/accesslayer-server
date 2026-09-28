import request from 'supertest';

// Prisma is stubbed so importing the app does not construct a real client.
// Every case here is rejected by address validation before the handler runs,
// so no query is ever issued.
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

describe('GET /api/v1/wallets/:address/activity - Malformed Stellar Address', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('should return 400 for address with wrong prefix', async () => {
      const response = await request(app)
         .get(
            '/api/v1/wallets/XBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB/activity'
         )
         .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.details).toBeDefined();
      expect(
         response.body.error.details.some((d: any) => d.field === 'address')
      ).toBeTruthy();
   });

   it('should return 400 for too-short address', async () => {
      const response = await request(app)
         .get('/api/v1/wallets/GASHORT/activity')
         .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.details).toBeDefined();
      expect(
         response.body.error.details.some((d: any) => d.field === 'address')
      ).toBeTruthy();
   });

   it('should return 400 for address with invalid characters', async () => {
      const response = await request(app)
         .get(
            '/api/v1/wallets/GA!!!INVALID!!!CHARACTERS!!!HERE!!!AAAAAAAAAAAAAAAAA/activity'
         )
         .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.details).toBeDefined();
      expect(
         response.body.error.details.some((d: any) => d.field === 'address')
      ).toBeTruthy();
   });

   it('should return 400 for completely invalid address format', async () => {
      const response = await request(app)
         .get('/api/v1/wallets/not-a-stellar-address/activity')
         .expect(400);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.details).toBeDefined();
      expect(
         response.body.error.details.some((d: any) => d.field === 'address')
      ).toBeTruthy();
   });

   // The valid-address-with-no-trades case used to live here. It is not about
   // malformed addresses, and it asserted only part of the empty-page
   // contract, so it moved to wallet-activity-empty-history.integration.test.ts
   // (#642), which covers it in full.
});
