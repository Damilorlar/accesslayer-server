import crypto from 'crypto';
import { verifyWebhookSignature } from './webhook-signature.utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

const secret = 'test-webhook-signing-secret';
const payload = Buffer.from(
   JSON.stringify({ event_type: 'buy', amount: '10' })
);

function computeValidHeader(): string {
   const hex = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
   return `sha256=${hex}`;
}

function flipHexChar(char: string): string {
   return char === '0' ? '1' : '0';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
   it('returns true for a valid signature', () => {
      expect(
         verifyWebhookSignature(payload, computeValidHeader(), secret)
      ).toBe(true);
   });

   it('returns false for a tampered payload', () => {
      const tamperedPayload = Buffer.from(
         JSON.stringify({ event_type: 'buy', amount: '999' })
      );
      expect(
         verifyWebhookSignature(tamperedPayload, computeValidHeader(), secret)
      ).toBe(false);
   });

   it('returns false when the signature differs in the last character', () => {
      const header = computeValidHeader();
      const tampered =
         header.slice(0, -1) + flipHexChar(header[header.length - 1]);

      expect(verifyWebhookSignature(payload, tampered, secret)).toBe(false);
   });

   it('returns false when the signature differs in the first character', () => {
      const header = computeValidHeader();
      const prefix = 'sha256=';
      const firstHexChar = header[prefix.length];
      const tampered =
         prefix + flipHexChar(firstHexChar) + header.slice(prefix.length + 1);

      expect(verifyWebhookSignature(payload, tampered, secret)).toBe(false);
   });

   it('returns false without throwing when the signature is one character shorter than expected', () => {
      const header = computeValidHeader();
      const shortened = header.slice(0, -1);

      expect(() =>
         verifyWebhookSignature(payload, shortened, secret)
      ).not.toThrow();
      expect(verifyWebhookSignature(payload, shortened, secret)).toBe(false);
   });

   it('returns false without throwing when the signature is one character longer than expected', () => {
      const header = computeValidHeader();
      const lengthened = `${header}a`;

      expect(() =>
         verifyWebhookSignature(payload, lengthened, secret)
      ).not.toThrow();
      expect(verifyWebhookSignature(payload, lengthened, secret)).toBe(false);
   });

   it('returns false without throwing for a malformed header', () => {
      expect(() =>
         verifyWebhookSignature(payload, 'not-a-valid-header', secret)
      ).not.toThrow();
      expect(
         verifyWebhookSignature(payload, 'not-a-valid-header', secret)
      ).toBe(false);
   });

   it('returns false for an empty header', () => {
      expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
   });
});
