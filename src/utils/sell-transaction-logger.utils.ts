import { logger } from './logger.utils';
import { buildLogFields } from './log-fields.utils';
import { formatXlmDelta } from './xlm-delta.utils';

export interface SellTransactionConfirmedFields {
   /** Wallet address of the seller (the actor who sold keys) */
   sellerWallet: string;
   /** Wallet address of the creator whose keys were sold */
   creatorWallet: string;
   /** Number of keys sold */
   keyAmount: number;
   /** XLM received by the seller, in stroops */
   xlmReceivedStroops: bigint;
   /** Total key supply for the creator after this sell is applied */
   newSupply: number;
   /** Stellar transaction hash the sell was confirmed in */
   txHash: string;
   /** Timestamp the transaction was confirmed on-chain */
   confirmedAt: Date;
}

/**
 * Emits a structured info-level log for a sell transaction after it has
 * been confirmed on-chain. Mirrors the existing buy-side trade logging so
 * operators get a complete view of marketplace activity in both directions.
 *
 * Must only be called after on-chain confirmation, never on submission.
 * Never logs private key material or signing secrets.
 */
export function logSellTransactionConfirmed(
   fields: SellTransactionConfirmedFields
): void {
   logger.info(
      buildLogFields({
         type: 'sell_transaction_confirmed',
         seller_wallet: fields.sellerWallet,
         creator_wallet: fields.creatorWallet,
         key_amount: fields.keyAmount,
         xlm_received: formatXlmDelta(fields.xlmReceivedStroops, 'in'),
         new_supply: fields.newSupply,
         tx_hash: fields.txHash,
         confirmed_at: fields.confirmedAt,
      }),
      'Sell transaction confirmed on-chain'
   );
}
