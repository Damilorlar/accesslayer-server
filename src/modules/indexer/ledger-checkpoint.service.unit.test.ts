// src/modules/indexer/ledger-checkpoint.service.unit.test.ts
import { computeBatchHash } from './ledger-checkpoint.service';

describe('computeBatchHash', () => {
   it('returns consistent hash for same event IDs', () => {
      const events = ['tx1:0', 'tx1:1', 'tx2:0'];
      const hash1 = computeBatchHash(events);
      const hash2 = computeBatchHash(events);
      expect(hash1).toBe(hash2);
   });

   it('returns same hash regardless of input order', () => {
      const events = ['tx2:0', 'tx1:1', 'tx1:0'];
      const hash1 = computeBatchHash(['tx1:0', 'tx1:1', 'tx2:0']);
      const hash2 = computeBatchHash(events);
      expect(hash1).toBe(hash2);
   });

   it('returns different hash for different event IDs', () => {
      const hash1 = computeBatchHash(['tx1:0', 'tx1:1']);
      const hash2 = computeBatchHash(['tx1:0', 'tx2:0']);
      expect(hash1).not.toBe(hash2);
   });

   it('returns different hash for empty vs non-empty', () => {
      const hash1 = computeBatchHash([]);
      const hash2 = computeBatchHash(['tx1:0']);
      expect(hash1).not.toBe(hash2);
   });
});
