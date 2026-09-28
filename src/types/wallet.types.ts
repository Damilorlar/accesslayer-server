import { StellarWallet, User } from '@prisma/client';

/**
 * Represent a Stellar wallet identity mapping.
 */
export type StellarWalletIdentity = StellarWallet;

/**
 * Represent a Stellar wallet identity with associated user profile.
 */
export type StellarWalletWithUser = StellarWallet & {
   user: User;
};

/**
 * Interface for the wallet service boundary.
 */
export interface IStellarWalletService {
   upsertStellarWallet(userId: string, address: string): Promise<StellarWallet>;
   getStellarWalletByUserId(userId: string): Promise<StellarWallet | null>;
   getUserByStellarAddress(
      address: string
   ): Promise<StellarWalletWithUser | null>;
   isStellarAddressRegistered(address: string): Promise<boolean>;
}
