import { logSellTransactionConfirmed } from './sell-transaction-logger.utils';
import { logger } from './logger.utils';

jest.mock('./logger.utils', () => ({
   logger: {
      info: jest.fn(),
   },
}));

describe('logSellTransactionConfirmed', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   const baseFields = {
      sellerWallet: 'GSELLER1234567890000000000000000000000000000000000000',
      creatorWallet: 'GCREATOR1234567890000000000000000000000000000000000000',
      keyAmount: 3,
      xlmReceivedStroops: 125_000_000n,
      newSupply: 42,
      txHash: 'abcd1234efgh5678',
      confirmedAt: new Date('2026-01-01T00:00:00.000Z'),
   };

   it('emits exactly one info-level log', () => {
      logSellTransactionConfirmed(baseFields);
      expect(logger.info).toHaveBeenCalledTimes(1);
   });

   it('includes all seven required fields with the expected values', () => {
      logSellTransactionConfirmed(baseFields);

      const [logFields, message] = (logger.info as jest.Mock).mock.calls[0];

      expect(message).toBe('Sell transaction confirmed on-chain');
      expect(logFields).toMatchObject({
         seller_wallet: baseFields.sellerWallet,
         creator_wallet: baseFields.creatorWallet,
         key_amount: baseFields.keyAmount,
         xlm_received: '+12.5000000 XLM',
         new_supply: baseFields.newSupply,
         tx_hash: baseFields.txHash,
      });
      expect(logFields).toHaveProperty(
         'confirmed_at',
         baseFields.confirmedAt.toISOString()
      );
   });

   it('formats xlm_received as a signed XLM string, not raw stroops', () => {
      logSellTransactionConfirmed(baseFields);

      const [logFields] = (logger.info as jest.Mock).mock.calls[0];
      expect(logFields.xlm_received).toMatch(/^\+\d+\.\d{7} XLM$/);
   });

   it('never includes private key material or signing secrets', () => {
      logSellTransactionConfirmed(baseFields);

      const [logFields] = (logger.info as jest.Mock).mock.calls[0];
      expect(logFields).not.toHaveProperty('secret');
      expect(logFields).not.toHaveProperty('secretKey');
      expect(logFields).not.toHaveProperty('privateKey');
      expect(logFields).not.toHaveProperty('signingKey');
   });
});
