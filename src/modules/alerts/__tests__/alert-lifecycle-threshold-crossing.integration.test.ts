// Integration test for the full price alert lifecycle: registering an alert,
// evaluating a price snapshot update that crosses the threshold, and
// confirming the alert is not re-queued on a subsequent snapshot update.

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

const CREATOR_ID = 'creator-threshold-test';
const WALLET_ADDRESS =
   'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CALLBACK_URL = 'https://hooks.example.com/price-alert';
const TARGET_PRICE = 500;

describe('price alert lifecycle: create -> threshold crossing -> delivery', () => {
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
         id: 'alert-threshold-crossing',
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

   it('creates an alert at threshold 500, dispatches delivery when price moves from 400 to 600, and marks it triggered', async () => {
      const alert = await createAlert({
         creator_id: CREATOR_ID,
         wallet_address: WALLET_ADDRESS,
         target_price: TARGET_PRICE,
         direction: 'above',
         callback_url: CALLBACK_URL,
      });

      expect(mockPrisma.priceAlert.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               creatorId: CREATOR_ID,
               targetPrice: TARGET_PRICE,
               direction: 'above',
            }),
         })
      );

      // The snapshot update crosses the threshold (400 -> 600).
      mockPrisma.priceAlert.findMany.mockResolvedValueOnce([createdAlert]);
      mockPrisma.priceAlert.update.mockResolvedValue({});

      await evaluatePriceAlertsForMovement({
         creatorId: CREATOR_ID,
         previousPrice: 400,
         currentPrice: 600,
      });

      // Delivery job (webhook dispatch) was attempted for the crossing.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
         CALLBACK_URL,
         expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse(
         (global.fetch as jest.Mock).mock.calls[0][1].body
      );
      expect(body.alert_id).toBe(alert.id);
      expect(body.target_price).toBe(TARGET_PRICE);
      expect(body.current_price).toBe(600);

      // Alert is marked triggered.
      expect(mockPrisma.priceAlert.update).toHaveBeenCalledWith({
         where: { id: createdAlert.id },
         data: expect.objectContaining({
            isActive: false,
            triggeredAt: expect.any(Date),
         }),
      });
   });

   it('does not re-queue delivery on the next snapshot update after the alert has triggered', async () => {
      await createAlert({
         creator_id: CREATOR_ID,
         wallet_address: WALLET_ADDRESS,
         target_price: TARGET_PRICE,
         direction: 'above',
         callback_url: CALLBACK_URL,
      });

      // First crossing: 400 -> 600 triggers delivery and marks the alert inactive.
      mockPrisma.priceAlert.findMany.mockResolvedValueOnce([createdAlert]);
      mockPrisma.priceAlert.update.mockResolvedValue({});

      await evaluatePriceAlertsForMovement({
         creatorId: CREATOR_ID,
         previousPrice: 400,
         currentPrice: 600,
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Next snapshot update: the alert is no longer active/untriggered, so the
      // query that scopes to isActive+untriggered alerts returns nothing.
      mockPrisma.priceAlert.findMany.mockResolvedValueOnce([]);

      await evaluatePriceAlertsForMovement({
         creatorId: CREATOR_ID,
         previousPrice: 600,
         currentPrice: 700,
      });

      // No additional delivery or update calls.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(mockPrisma.priceAlert.update).toHaveBeenCalledTimes(1);
   });

   it('does not dispatch delivery when the price moves but does not cross the threshold', async () => {
      await createAlert({
         creator_id: CREATOR_ID,
         wallet_address: WALLET_ADDRESS,
         target_price: TARGET_PRICE,
         direction: 'above',
         callback_url: CALLBACK_URL,
      });

      mockPrisma.priceAlert.findMany.mockResolvedValueOnce([createdAlert]);

      await evaluatePriceAlertsForMovement({
         creatorId: CREATOR_ID,
         previousPrice: 400,
         currentPrice: 450,
      });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockPrisma.priceAlert.update).not.toHaveBeenCalled();
   });
});
