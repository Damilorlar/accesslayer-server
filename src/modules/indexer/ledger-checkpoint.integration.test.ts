// src/modules/indexer/ledger-checkpoint.integration.test.ts
// Integration tests for #632 — idempotent ledger checkpoint system.

import { prisma } from '../../utils/prisma.utils';
import {
   writeCheckpoint,
   readLatestCheckpoint,
   readCheckpoint,
   validateBatchIntegrity,
   getResumePoint,
   computeBatchHash,
} from './ledger-checkpoint.service';

describe('#632 idempotent ledger checkpoint system', () => {
   afterAll(async () => {
      await prisma.ledgerCheckpoint.deleteMany({});
      await prisma.$disconnect();
   });

   describe('writeCheckpoint', () => {
      it('writes a new checkpoint', async () => {
         const batchHash = computeBatchHash(['tx1:0', 'tx1:1']);
         const result = await writeCheckpoint(100, 1, batchHash);

         expect(result).not.toBeNull();
         expect(result!.ledger).toBe(100);
         expect(result!.lastProcessedEventIndex).toBe(1);
         expect(result!.batchHash).toBe(batchHash);
      });

      it('upserts checkpoint for same ledger (idempotent)', async () => {
         const hash1 = computeBatchHash(['tx1:0']);
         const hash2 = computeBatchHash(['tx1:0', 'tx1:1']);

         await writeCheckpoint(200, 0, hash1);
         const updated = await writeCheckpoint(200, 1, hash2);

         expect(updated).not.toBeNull();
         expect(updated!.lastProcessedEventIndex).toBe(1);
         expect(updated!.batchHash).toBe(hash2);

         // Verify only one checkpoint for this ledger
         const checkpoints = await prisma.ledgerCheckpoint.findMany({
            where: { ledger: 200 },
         });
         expect(checkpoints).toHaveLength(1);
      });
   });

   describe('readLatestCheckpoint', () => {
      it('returns null when no checkpoints exist', async () => {
         await prisma.ledgerCheckpoint.deleteMany({});
         const latest = await readLatestCheckpoint();
         expect(latest).toBeNull();
      });

      it('returns the checkpoint with highest ledger', async () => {
         const hash = computeBatchHash(['tx1:0']);
         await writeCheckpoint(50, 0, hash);
         await writeCheckpoint(100, 2, hash);

         const latest = await readLatestCheckpoint();
         expect(latest).not.toBeNull();
         expect(latest!.ledger).toBe(100);
      });
   });

   describe('readCheckpoint', () => {
      it('returns specific checkpoint by ledger', async () => {
         const hash = computeBatchHash(['tx1:0']);
         await writeCheckpoint(300, 3, hash);

         const checkpoint = await readCheckpoint(300);
         expect(checkpoint).not.toBeNull();
         expect(checkpoint!.ledger).toBe(300);
         expect(checkpoint!.lastProcessedEventIndex).toBe(3);
      });

      it('returns null for non-existent ledger', async () => {
         const checkpoint = await readCheckpoint(99999);
         expect(checkpoint).toBeNull();
      });
   });

   describe('validateBatchIntegrity', () => {
      it('returns valid when no checkpoint exists', async () => {
         const result = await validateBatchIntegrity(500, 'somehash');
         expect(result.valid).toBe(true);
         expect(result.needsReprocess).toBe(false);
      });

      it('returns valid when batch hash matches', async () => {
         const hash = computeBatchHash(['tx1:0', 'tx1:1']);
         await writeCheckpoint(600, 1, hash);

         const result = await validateBatchIntegrity(600, hash);
         expect(result.valid).toBe(true);
         expect(result.needsReprocess).toBe(false);
      });

      it('returns invalid when batch hash mismatches', async () => {
         const hash = computeBatchHash(['tx1:0']);
         await writeCheckpoint(700, 0, hash);

         const result = await validateBatchIntegrity(700, 'differenthash');
         expect(result.valid).toBe(false);
         expect(result.needsReprocess).toBe(true);
      });
   });

   describe('getResumePoint', () => {
      it('returns 0 when no checkpoint exists', async () => {
         await prisma.ledgerCheckpoint.deleteMany({});
         const resume = await getResumePoint();
         expect(resume).toBe(0);
      });

      it('returns checkpoint.ledger + 1', async () => {
         const hash = computeBatchHash(['tx1:0']);
         await writeCheckpoint(450, 2, hash);

         const resume = await getResumePoint();
         expect(resume).toBe(451);
      });
   });
});
