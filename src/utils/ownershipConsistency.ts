export interface OwnershipConsistencyCheckParams {
   creatorId: string;
   storedSupply: number;
   holderBalances: number[];
   detectedAt: Date;
   logError: (entry: Record<string, unknown>) => void;
}

export function checkOwnershipReadModelConsistency({
   creatorId,
   storedSupply,
   holderBalances,
   detectedAt,
   logError,
}: OwnershipConsistencyCheckParams): boolean {
   const computedHolderSum = holderBalances.reduce(
      (sum, balance) => sum + balance,
      0
   );
   const discrepancy = computedHolderSum - storedSupply;

   if (discrepancy === 0) {
      return false;
   }

   logError({
      creator_id: creatorId,
      stored_supply: storedSupply,
      computed_holder_sum: computedHolderSum,
      discrepancy,
      detected_at: detectedAt.toISOString(),
   });

   return true;
}
