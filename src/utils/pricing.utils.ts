/**
 * Helper for computing the XLM cost to buy N keys at the current supply using the bonding curve formula.
 * Note: This is a placeholder implementation since the real bonding curve math is trapped in an unmerged PR.
 * 
 * @param currentSupply - The current supply of keys
 * @param amount - The number of keys to buy
 * @param feeBps - The protocol fee in basis points (e.g. 500 = 5%)
 * @returns Total XLM cost in stroops as a bigint
 */
export function computeBuyCost(currentSupply: number, amount: number, feeBps: number): bigint {
   if (amount < 0 || currentSupply < 0) {
      throw new Error('Supply and amount must be non-negative');
   }
   
   if (amount === 0) {
      return 0n;
   }

   // Placeholder bonding curve math: Price = 10,000,000 stroops (1 XLM) base + 1,000,000 stroops per supply
   const BASE_COST = 10_000_000n;
   const STEP = 1_000_000n;

   let totalBaseCost = 0n;
   for (let i = 0; i < amount; i++) {
      const supplyAtPurchase = BigInt(currentSupply + i);
      totalBaseCost += BASE_COST + (supplyAtPurchase * STEP);
   }

   // Add fee
   const fee = (totalBaseCost * BigInt(feeBps)) / 10000n;
   const totalCost = totalBaseCost + fee;

   if (totalCost < 0n) {
      return 0n; // fallback to ensure it never returns negative
   }

   return totalCost;
}
