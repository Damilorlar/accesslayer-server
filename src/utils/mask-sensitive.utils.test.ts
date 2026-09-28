/**
 * Unit tests for maskSensitive helper (#600).
 *
 * Verifies:
 * - All listed sensitive key names are masked to '[REDACTED]'
 * - Non-sensitive keys are left unchanged
 * - Nested objects are masked recursively
 * - Original object is not mutated
 */

import { maskSensitive } from './mask-sensitive.utils';

// ── Sensitive key masking ─────────────────────────────────────────────────────

describe('maskSensitive — sensitive keys masked to [REDACTED]', () => {
   it('masks "url" key', () => {
      expect(maskSensitive({ url: 'https://secret.example.com' })).toEqual({
         url: '[REDACTED]',
      });
   });

   it('masks "callback" key', () => {
      expect(
         maskSensitive({ callback: 'https://hooks.example.com/cb' })
      ).toEqual({
         callback: '[REDACTED]',
      });
   });

   it('masks "address" key', () => {
      expect(
         maskSensitive({
            address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
         })
      ).toEqual({ address: '[REDACTED]' });
   });

   it('masks "webhook_url" key', () => {
      expect(
         maskSensitive({
            webhook_url: 'https://discord.com/api/webhooks/123/abc',
         })
      ).toEqual({
         webhook_url: '[REDACTED]',
      });
   });

   it('masks "recipient" key', () => {
      expect(maskSensitive({ recipient: 'user@example.com' })).toEqual({
         recipient: '[REDACTED]',
      });
   });

   it('masks a string value to [REDACTED]', () => {
      const result = maskSensitive({ url: 'some-value' });
      expect(result.url).toBe('[REDACTED]');
   });

   it('masks a numeric value to [REDACTED]', () => {
      const result = maskSensitive({ address: 12345 } as any);
      expect(result.address).toBe('[REDACTED]');
   });

   it('masks a null value to [REDACTED]', () => {
      const result = maskSensitive({ url: null } as any);
      expect(result.url).toBe('[REDACTED]');
   });
});

// ── Non-sensitive keys unchanged ──────────────────────────────────────────────

describe('maskSensitive — non-sensitive keys unchanged', () => {
   it('leaves a plain string field unchanged', () => {
      const result = maskSensitive({ name: 'alice' });
      expect(result.name).toBe('alice');
   });

   it('leaves a numeric field unchanged', () => {
      const result = maskSensitive({ count: 42 });
      expect(result.count).toBe(42);
   });

   it('leaves a boolean field unchanged', () => {
      const result = maskSensitive({ active: true });
      expect(result.active).toBe(true);
   });

   it('leaves null field value unchanged when key is not sensitive', () => {
      const result = maskSensitive({ label: null } as any);
      expect(result.label).toBeNull();
   });

   it('returns the full object with only sensitive fields redacted', () => {
      const result = maskSensitive({
         event: 'trade_completed',
         url: 'https://secret.example.com',
         creator_id: 'creator-1',
         amount: 10,
      });
      expect(result).toEqual({
         event: 'trade_completed',
         url: '[REDACTED]',
         creator_id: 'creator-1',
         amount: 10,
      });
   });
});

// ── Nested objects masked recursively ─────────────────────────────────────────

describe('maskSensitive — nested objects', () => {
   it('masks a sensitive key inside a nested object', () => {
      const result = maskSensitive({
         meta: { address: 'GXYZ', label: 'wallet' },
      });
      expect(result).toEqual({
         meta: { address: '[REDACTED]', label: 'wallet' },
      });
   });

   it('masks sensitive key "url" inside nested webhook object', () => {
      const result = maskSensitive({
         webhook: { url: 'https://example.com' },
      });
      expect(result).toEqual({
         webhook: { url: '[REDACTED]' },
      });
   });

   it('masks callback values inside array of objects', () => {
      const result = maskSensitive({
         hooks: [{ callback: 'x' }, { callback: 'y' }],
      });
      expect(result).toEqual({
         hooks: [{ callback: '[REDACTED]' }, { callback: '[REDACTED]' }],
      });
   });

   it('preserves non-sensitive nested keys', () => {
      const result = maskSensitive({
         meta: { count: 5 },
      });
      expect(result).toEqual({
         meta: { count: 5 },
      });
   });

   it('masks a deeply nested sensitive key at 3 levels', () => {
      const result = maskSensitive({
         level1: {
            level2: {
               level3: {
                  url: 'https://deep.example.com',
                  safe: 'keep-me',
               },
            },
         },
      });
      expect(result).toEqual({
         level1: {
            level2: {
               level3: {
                  url: '[REDACTED]',
                  safe: 'keep-me',
               },
            },
         },
      });
   });

   it('masks sensitive keys inside array elements', () => {
      const result = maskSensitive({
         hooks: [
            { webhook_url: 'https://hook1.example.com', id: 'h1' },
            { webhook_url: 'https://hook2.example.com', id: 'h2' },
         ],
      });
      expect(result).toEqual({
         hooks: [
            { webhook_url: '[REDACTED]', id: 'h1' },
            { webhook_url: '[REDACTED]', id: 'h2' },
         ],
      });
   });

   it('handles an empty nested object', () => {
      const result = maskSensitive({ context: {} });
      expect(result).toEqual({ context: {} });
   });
});

// ── Immutability ──────────────────────────────────────────────────────────────

describe('maskSensitive — does not mutate original', () => {
   it('does not modify the input object', () => {
      const input = {
         url: 'https://secret.example.com',
         name: 'alice',
      };
      maskSensitive(input);
      expect(input.url).toBe('https://secret.example.com');
      expect(input.name).toBe('alice');
   });

   it('does not modify nested objects in the input', () => {
      const input = {
         meta: { address: 'GABC', safe: 'ok' },
      };
      maskSensitive(input);
      expect(input.meta.address).toBe('GABC');
   });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('maskSensitive — edge cases', () => {
   it('handles an empty object', () => {
      expect(maskSensitive({})).toEqual({});
   });

   it('is case-insensitive: masks "URL" key', () => {
      const result = maskSensitive({ URL: 'https://example.com' } as any);
      expect(result.URL).toBe('[REDACTED]');
   });

   it('is case-insensitive: masks "Address" key', () => {
      const result = maskSensitive({ Address: 'GABC' } as any);
      expect(result.Address).toBe('[REDACTED]');
   });
});
