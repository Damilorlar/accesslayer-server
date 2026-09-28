// Unit tests for isValidStellarAddress and StellarAddressSchema (#447, #682)

import { isValidStellarAddress, StellarAddressSchema } from '../wallet.utils';

// 56-character valid Stellar G address (real Ed25519 public key with a
// correct StrKey checksum — required now that isValidStellarAddress
// verifies the checksum rather than only the surface format).
const VALID_ADDRESS =
   'GCZURJAWEEAYDCIIUFMCGVDIKBASNKQQ7ZCX33BP2DZHFF52SG6BLW6J';

// A second real, checksum-valid address that happens to contain Base32
// digits (2-7) as well as letters, used to prove digit characters are
// accepted and not just letters.
const VALID_ADDRESS_WITH_DIGITS =
   'GCIL2FILIIYMNU2H2TGOW6WS22RPGL5HVEUIK7CHIDX45BLLC2DG5RVF';

describe('isValidStellarAddress', () => {
   it('returns true for a valid Stellar G... address', () => {
      expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
   });

   it('returns true for an address using digits 2-7', () => {
      expect(/[2-7]/.test(VALID_ADDRESS_WITH_DIGITS)).toBe(true);
      expect(isValidStellarAddress(VALID_ADDRESS_WITH_DIGITS)).toBe(true);
   });

   it('returns false when the address does not start with G', () => {
      const addr = 'A' + 'A'.repeat(55);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false when the address is too short (55 chars)', () => {
      const addr = 'G' + 'A'.repeat(54);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false when the address is too long (57 chars)', () => {
      const addr = 'G' + 'A'.repeat(56);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false when the address contains invalid characters (lowercase)', () => {
      const addr = 'G' + 'a'.repeat(55);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false when the address contains invalid digits (0, 1, 8, 9)', () => {
      const addr = 'G' + '0'.repeat(55);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false for an empty string', () => {
      expect(isValidStellarAddress('')).toBe(false);
   });

   it('returns false for a random non-address string', () => {
      expect(isValidStellarAddress('not-a-stellar-address')).toBe(false);
   });

   // Adjacent invalid formats seen in real API submissions (#638)

   it('returns false for an otherwise-valid address with one lowercase character', () => {
      const addr = 'G' + 'a' + 'A'.repeat(54);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false for an address starting with G that contains a 0 (not valid base32)', () => {
      const addr = 'G' + '0' + 'A'.repeat(54);
      expect(isValidStellarAddress(addr)).toBe(false);
   });

   it('returns false for a valid address with a leading space', () => {
      expect(isValidStellarAddress(' ' + VALID_ADDRESS)).toBe(false);
   });

   it('returns false for a valid address with a trailing newline', () => {
      expect(isValidStellarAddress(VALID_ADDRESS + '\n')).toBe(false);
   });

   it('returns true for the existing valid address (regression guard)', () => {
      expect(isValidStellarAddress(VALID_ADDRESS)).toBe(true);
   });

   // #682 — malformed / wrong-network address coverage

   it('returns false for an address with an invalid checksum (well-formed but corrupted)', () => {
      // Flip the final two characters of an otherwise valid, correctly
      // formatted address. The result still matches the surface shape
      // (56 chars, G-prefixed, Base32 charset) but its StrKey checksum
      // no longer verifies against the payload.
      const lastTwo = VALID_ADDRESS.slice(-2);
      const flipped = lastTwo === 'AA' ? 'AB' : 'AA';
      const tampered = VALID_ADDRESS.slice(0, -2) + flipped;

      expect(tampered).toHaveLength(VALID_ADDRESS.length);
      expect(tampered).toMatch(/^G[A-Z2-7]{55}$/);
      expect(isValidStellarAddress(tampered)).toBe(false);
   });

   it('returns false for a well-formed testnet/muxed-style address starting with M', () => {
      // M-prefixed StrKey addresses encode muxed accounts, not a plain
      // Ed25519 public key, and must be rejected by this validator.
      const muxedAddress =
         'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJUQ';
      expect(isValidStellarAddress(muxedAddress)).toBe(false);
   });
});

describe('StellarAddressSchema', () => {
   it('passes for a valid Stellar address', () => {
      const result = StellarAddressSchema.safeParse(VALID_ADDRESS);
      expect(result.success).toBe(true);
   });

   it('fails with the correct message for a wrong first character', () => {
      const result = StellarAddressSchema.safeParse('A' + 'A'.repeat(55));
      expect(result.success).toBe(false);
      if (!result.success) {
         expect(result.error.issues[0].message).toBe(
            'Invalid Stellar wallet address'
         );
      }
   });

   it('fails for wrong length', () => {
      const result = StellarAddressSchema.safeParse('G' + 'A'.repeat(54));
      expect(result.success).toBe(false);
   });

   it('fails for invalid characters', () => {
      const result = StellarAddressSchema.safeParse('G' + '!'.repeat(55));
      expect(result.success).toBe(false);
   });

   it('fails for an empty string', () => {
      const result = StellarAddressSchema.safeParse('');
      expect(result.success).toBe(false);
   });
});
