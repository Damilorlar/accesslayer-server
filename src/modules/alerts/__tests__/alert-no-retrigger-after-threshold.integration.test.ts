// Integration test: price alert must not re-trigger after the threshold has
// already been crossed once. A subsequent snapshot that remains above the
// threshold should NOT cause an additional delivery.

import { createAlert, evaluatePriceAlertsForMovement } from '../alert.service';
import { prisma } from '../../../utils/prisma.utils';

jest.mock('../../../utils/prisma.utils', () => ({
   prisma: {
      priceAlert: {
         findFirst: jest.fn(),
         create: jest.fn(),
         findMany: jest.fn(),
         update: jest.fn(),
      },
   },
}));

const mockPrisma = prisma as unknown as {
   priceAlert: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
   };
};

const CREATOR_ID = 'creator-no-retrigger';
const WALLET_ADDRESS =
   'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CALLBACK_URL = 'https://hooks.example.com/price-alert';
const TARGET_PRICE = 500;

describe('price alert does not re-trigger after threshold crossing', () => {
   let createdAlert: {
      id: string;
      creatorId: string;
      walletAddress: string;
      targetPrice: number;
      direction: 'above' | 'below';
      callbackUrl: string;
      isActive: boolean;
      triggeredAt: Date | null;
      createdAt: Date;
   };

   beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      createdAlert = {
         id: 'alert-no-retrigger',
         creatorId: CREATOR_ID,
         walletAddress: WALLET_ADDRESS,
         targetPrice: TARGET_PRICE,
         direction: 'above',
         callbackUrl: CALLBACK_URL,
         isActive: true,
         triggeredAt: null,
         createdAt: new Date('2026-07-01T00:00:00Z'),
      };

      mockPrisma.priceAlert.findFirst.mockResolvedValue(null);
      mockPrisma.priceAlert.create.mockResolvedValue(createdAlert);
   });

   it('enqueues delivery exactly once on first crossing and not again on subsequent above-threshold updates', async () => {
      await createAlert({
         creator_id: CREATOR_ID,
         wallet_address: WALLET_ADDRESS,
         target_price: TARGET_PRICE,
         direction: 'above',
         callback_url: CALLBACK_URL,
      });

      // First crossing: price moves from 400 to 600 (crosses threshold 500).
      mockPrisma.priceAlert.findMany.mockResolvedValueOnce([createdAlert]);
      mockPrisma.priceAlert.update.mockResolvedValue({});

      await evaluatePriceAlertsForMovement({
         creatorId: CREATOR_ID,
         previousPrice: 400,
         currentPrice: 600,
      });

      // Delivery job enqueued exactly once.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
         CALLBACK_URL,
         expect.objectContaining({ method: 'POST' })
      );

      // Alert record is marked triggered after the first crossing.
      expect(mockPrisma.priceAlert.update).toHaveBeenCalledWith({
         where: { id: createdAlert.id },
         data: expect.objectContaining({
            isActive: false,
            triggeredAt: expect.any(Date),
         }),
      });

      // Second update: price moves from 600 to 700 (still above threshold 500).
      // Because the alert is now inactive/triggered, findMany returns nothing.
      mockPrisma.priceAlert.findMany.mockResolvedValueOnce([]);

      await evaluatePriceAlertsForMovement({
         creatorId: CREATOR_ID,
         previousPrice: 600,
         currentPrice: 700,
      });

      // No second delivery jobs enqueued.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      // No additional update call for the alert record.
      expect(mockPrisma.priceAlert.update).toHaveBeenCalledTimes(1);
   });
});
