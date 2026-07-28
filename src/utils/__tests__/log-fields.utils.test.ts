import { buildLogFields } from '../log-fields.utils';

describe('#631 buildLogFields — structured log formatting helper', () => {
   it('converts camelCase keys to snake_case', () => {
      const input = {
         creatorId: 'creator-123',
         ledgerSequence: 98765,
         actorAddress: 'GABC123',
         elapsedMs: 42,
      };

      const result = buildLogFields(input);

      expect(result).toEqual({
         creator_id: 'creator-123',
         ledger_sequence: 98765,
         actor_address: 'GABC123',
         elapsed_ms: 42,
      });
   });

   it('formats timestamp Date fields as ISO 8601 strings', () => {
      const date = new Date('2026-07-25T14:30:00.000Z');
      const input = {
         createdAt: date,
         processedAt: date,
      };

      const result = buildLogFields(input);

      expect(result).toEqual({
         created_at: '2026-07-25T14:30:00.000Z',
         processed_at: '2026-07-25T14:30:00.000Z',
      });
   });

   it('truncates long strings exceeding 500 characters with a [TRUNCATED] suffix', () => {
      const longString = 'a'.repeat(600);
      const input = {
         payload: longString,
      };

      const result = buildLogFields(input);
      const outputPayload = result.payload as string;

      expect(outputPayload).toHaveLength(500 + '[TRUNCATED]'.length);
      expect(outputPayload.slice(0, 500)).toBe('a'.repeat(500));
      expect(outputPayload.endsWith('[TRUNCATED]')).toBe(true);
   });

   it('leaves short strings at or under 500 characters unchanged', () => {
      const exact500String = 'b'.repeat(500);
      const shortString = 'Hello World';

      const input = {
         exactMsg: exact500String,
         shortMsg: shortString,
      };

      const result = buildLogFields(input);

      expect(result.exact_msg).toBe(exact500String);
      expect(result.short_msg).toBe(shortString);
   });

   it('handles nested objects and arrays correctly', () => {
      const input = {
         userInfo: {
            userHandle: 'alice',
            lastLogin: new Date('2026-01-01T00:00:00.000Z'),
         },
         itemTags: ['tagOne', 'tagTwo'],
      };

      const result = buildLogFields(input);

      expect(result).toEqual({
         user_info: {
            user_handle: 'alice',
            last_login: '2026-01-01T00:00:00.000Z',
         },
         item_tags: ['tagOne', 'tagTwo'],
      });
   });
});
