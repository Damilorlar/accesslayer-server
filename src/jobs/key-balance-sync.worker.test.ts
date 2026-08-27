import {
   runKeyBalanceSync,
   type BalanceRecord,
   type KeyBalanceSyncDependencies,
} from './key-balance-sync.worker';

function createDependencies(
   records: BalanceRecord[],
   chainBalances: Record<string, number | null>
) {
   const updateBalance = jest.fn().mockResolvedValue(undefined);
   const logCorrection = jest.fn();
   const dependencies: KeyBalanceSyncDependencies = {
      listBalances: jest.fn().mockResolvedValue(records),
      getOnChainBalance: jest.fn((owner, creator) =>
         Promise.resolve(chainBalances[`${owner}:${creator}`] ?? null)
      ),
      updateBalance,
      logCorrection,
   };
   return { dependencies, updateBalance, logCorrection };
}

describe('key balance sync worker', () => {
   it('updates stale balances and logs old and new values', async () => {
      const { dependencies, updateBalance, logCorrection } = createDependencies(
         [
            {
               id: '1',
               ownerAddress: 'wallet-a',
               creatorId: 'creator-a',
               balance: 5,
            },
         ],
         { 'wallet-a:creator-a': 8 }
      );

      await expect(runKeyBalanceSync(dependencies)).resolves.toBe(1);
      expect(updateBalance).toHaveBeenCalledWith('1', 8);
      expect(logCorrection).toHaveBeenCalledWith(
         expect.objectContaining({ oldBalance: 5, newBalance: 8 })
      );
   });

   it('does not write when the database already matches the chain', async () => {
      const { dependencies, updateBalance, logCorrection } = createDependencies(
         [
            {
               id: '1',
               ownerAddress: 'wallet-a',
               creatorId: 'creator-a',
               balance: 5,
            },
         ],
         { 'wallet-a:creator-a': 5 }
      );
      await expect(runKeyBalanceSync(dependencies)).resolves.toBe(0);
      expect(updateBalance).not.toHaveBeenCalled();
      expect(logCorrection).not.toHaveBeenCalled();
   });

   it('sets a missing on-chain balance to zero', async () => {
      const { dependencies, updateBalance } = createDependencies(
         [
            {
               id: '1',
               ownerAddress: 'wallet-a',
               creatorId: 'creator-a',
               balance: 5,
            },
         ],
         { 'wallet-a:creator-a': null }
      );
      await runKeyBalanceSync(dependencies);
      expect(updateBalance).toHaveBeenCalledWith('1', 0);
   });

   it('processes multiple wallets independently', async () => {
      const { dependencies, updateBalance } = createDependencies(
         [
            {
               id: '1',
               ownerAddress: 'wallet-a',
               creatorId: 'creator-a',
               balance: 1,
            },
            {
               id: '2',
               ownerAddress: 'wallet-b',
               creatorId: 'creator-b',
               balance: 2,
            },
         ],
         { 'wallet-a:creator-a': 3, 'wallet-b:creator-b': 4 }
      );
      await expect(runKeyBalanceSync(dependencies)).resolves.toBe(2);
      expect(updateBalance).toHaveBeenNthCalledWith(1, '1', 3);
      expect(updateBalance).toHaveBeenNthCalledWith(2, '2', 4);
   });
});
