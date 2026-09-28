export interface BuyGateway {
   getXlmBalance(walletAddress: string): Promise<number>;
   submitBuy(input: {
      walletAddress: string;
      creatorId: string;
      quantity: number;
   }): Promise<{ transactionHash: string }>;
}

export const buyGateway: BuyGateway = {
   async getXlmBalance() {
      throw new Error('Horizon balance adapter is not configured');
   },
   async submitBuy() {
      throw new Error('Stellar buy adapter is not configured');
   },
};
