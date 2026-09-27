// Integration test: creator profile key stats (supply, holder count,
// current price) after a buy transaction (#678).
//
// Follows the same conventions as
// creator-detail-holder-count-sequential.integration.test.ts: the
// controller and the real ownership.service.ts are exercised directly,
// with prisma calls backed by in-memory fixtures instead of a live
// database.

import { httpGetCreatorStats } from './creators.controllers';
import { updateOwnership } from '../ownership/ownership.service';
import { prisma } from '../../utils/prisma.utils';

function makeReq(creatorId: string): any {
   return {
      params: { id: creatorId },
   };
}

function makeRes(): any {
   const res: any = {};
   res.status = jest.fn().mockReturnValue(res);
   res.json = jest.fn().mockReturnValue(res);
   res.setHeader = jest.fn().mockReturnValue(res);
   res.set = jest.fn().mockReturnValue(res);
   return res;
}

function makeNext(): jest.Mock {
   return jest.fn();
}

describe('#678 Integration test: creator profile key stats after a buy transaction', () => {
   const creatorId = '456';
   const holderA = 'GHOLDERA111111111111111111111111111111111111111111111111';
   const holderB = 'GHOLDERB222222222222222222222222222222222222222222222222';
   const holderC = 'GHOLDERC333333333333333333333333333333333333333333333333';
   const newInvestor =
      'GINVESTORD44444444444444444444444444444444444444444444444';

   const INITIAL_PRICE = 1_000_000n;
   const POST_BUY_PRICE = 1_250_000n;

   // In-memory stand-ins for the ownership read model and the price
   // snapshot read model, keyed the same way the real Prisma calls are.
   const ownershipStore = new Map<string, number>();
   let currentSnapshotPrice: bigint | null = null;

   beforeEach(() => {
      jest.restoreAllMocks();
      ownershipStore.clear();
      currentSnapshotPrice = null;

      (prisma.creatorProfile.findFirst as any) = jest.fn(async () => ({
         id: creatorId,
      }));

      (prisma.keyOwnership.count as any) = jest.fn(async (args: any) => {
         let count = 0;
         for (const [key, bal] of ownershipStore.entries()) {
            if (key.endsWith(`:${args.where.creatorId}`) && bal > 0) {
               count++;
            }
         }
         return count;
      });

      (prisma.keyOwnership.findFirst as any) = jest.fn(async (args: any) => {
         const { ownerAddress, creatorId: cid } = args.where;
         const key = `${ownerAddress}:${cid}`;
         const bal = ownershipStore.get(key) || 0;
         return { balance: bal } as any;
      });

      (prisma.keyOwnership.upsert as any) = jest.fn(async (args: any) => {
         const { ownerAddress, creatorId: cid } = args.create;
         const key = `${ownerAddress}:${cid}`;
         const current = ownershipStore.get(key) || 0;
         const change = args.update.balance.increment;
         const newBal = current + change;
         ownershipStore.set(key, newBal);
         return { ownerAddress, creatorId: cid, balance: newBal } as any;
      });

      (prisma.keyOwnership.aggregate as any) = jest.fn(async (args: any) => {
         let sum = 0;
         for (const [key, bal] of ownershipStore.entries()) {
            if (key.endsWith(`:${args.where.creatorId}`)) {
               sum += bal;
            }
         }
         return { _sum: { balance: sum } } as any;
      });

      (prisma.creatorPriceSnapshot.findUnique as any) = jest.fn(async () => {
         if (currentSnapshotPrice === null) return null;
         return { currentPrice: currentSnapshotPrice } as any;
      });
   });

   it('reflects supply, holder count, and price after a buy transaction', async () => {
      // ── Seed: initial supply of 10 keys held by 3 holders ──────────────
      await updateOwnership(holderA, creatorId, 4);
      await updateOwnership(holderB, creatorId, 3);
      await updateOwnership(holderC, creatorId, 3);
      currentSnapshotPrice = INITIAL_PRICE;

      const reqBefore = makeReq(creatorId);
      const resBefore = makeRes();
      await httpGetCreatorStats(reqBefore, resBefore, makeNext());

      const before = resBefore.json.mock.calls[0][0].data;
      expect(resBefore.status).toHaveBeenCalledWith(200);
      expect(before.totalSupply).toBe(10);
      expect(before.holderCount).toBe(3);
      expect(before.currentPrice).toBe(INITIAL_PRICE.toString());

      // ── Simulate a buy of 5 keys by a new investor ─────────────────────
      await updateOwnership(newInvestor, creatorId, 5);
      // The indexer records the trade's price on the bonding curve as the
      // new current price once the buy lands.
      currentSnapshotPrice = POST_BUY_PRICE;

      const reqAfter = makeReq(creatorId);
      const resAfter = makeRes();
      await httpGetCreatorStats(reqAfter, resAfter, makeNext());

      expect(resAfter.status).toHaveBeenCalledWith(200);
      const after = resAfter.json.mock.calls[0][0].data;

      // Supply incremented correctly after the buy (10 + 5 = 15).
      expect(after.totalSupply).toBe(15);
      // Holder count incremented since the new investor is a first-time buyer.
      expect(after.holderCount).toBe(4);
      expect(after.holder_count).toBe(4);
      // Price reflects the updated bonding-curve supply.
      expect(after.currentPrice).toBe(POST_BUY_PRICE.toString());
      expect(after.currentPrice).not.toBe(before.currentPrice);
   });

   it('does not change holder count when an existing holder buys more keys', async () => {
      await updateOwnership(holderA, creatorId, 4);
      await updateOwnership(holderB, creatorId, 3);
      await updateOwnership(holderC, creatorId, 3);
      currentSnapshotPrice = INITIAL_PRICE;

      // An existing holder (not a new investor) buys more keys.
      await updateOwnership(holderA, creatorId, 5);

      const req = makeReq(creatorId);
      const res = makeRes();
      await httpGetCreatorStats(req, res, makeNext());

      const data = res.json.mock.calls[0][0].data;
      expect(data.totalSupply).toBe(15);
      expect(data.holderCount).toBe(3);
   });
});
