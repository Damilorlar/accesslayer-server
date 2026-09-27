import { logger } from './logger.utils';
import { buildLogFields } from './log-fields.utils';

export interface IndexerTradeEventLogFields {
   event_type: 'buy' | 'sell';
   creator_id: string;
   ledger_sequence: number;
   actor_address: string;
   amount: string;
   processed_at: Date;
}

import { truncateWallet } from './wallet-display.utils';

/**
 * Emits a structured info log after a trade event is successfully written to
 * the database. Must only be called after the write succeeds — not on failure.
 */
export function logIndexerTradeEvent(fields: IndexerTradeEventLogFields): void {
   logger.info(
      buildLogFields({
         type: 'indexer_trade_processed',
         event_type: fields.event_type,
         creator_id: fields.creator_id,
         ledger_sequence: fields.ledger_sequence,
         actor_address: truncateWallet(fields.actor_address),
         amount: fields.amount,
         processed_at: fields.processed_at,
      }),
      'Indexer trade event processed'
   );
}
