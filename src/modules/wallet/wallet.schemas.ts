import { z } from 'zod';

/**
 * Validation assumptions for Stellar wallet addresses:
 * 1. Must be exactly 56 characters long.
 * 2. Must start with 'G' (Stellar public key identifier).
 * 3. Must follow Base32 encoding (A-Z, 2-7).
 */
export const StellarAddressSchema = z
   .string()
   .length(56, 'Stellar address must be exactly 56 characters long')
   .regex(
      /^G[A-Z2-7]{55}$/,
      'Invalid Stellar public key format (must start with G and use Base32 characters)'
   );

export const MapUserToWalletSchema = z.object({
   userId: z.string().cuid('Invalid user ID format (CUID expected)'),
   address: StellarAddressSchema,
});

export type MapUserToWalletType = z.infer<typeof MapUserToWalletSchema>;
