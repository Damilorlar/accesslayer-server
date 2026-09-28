jest.mock('../../config', () => ({
   envConfig: {
      APP_SECRET: 'test_secret_for_hmac_123456789012',
   },
}));

import {
   encodeCursor,
   decodeCursor,
   generateCursorChecksum,
   CursorChecksumError,
} from '../cursor.utils';

describe('Cursor Utils', () => {
   const samplePayload = {
      id: 'user_123',
      createdAt: '2023-01-01T00:00:00.000Z',
   };

   describe('generateCursorChecksum', () => {
      it('should return a deterministic 64-character hex string for the same input', () => {
         const checksum1 = generateCursorChecksum('test_payload');
         const checksum2 = generateCursorChecksum('test_payload');

         expect(checksum1).toBe(checksum2);
         expect(checksum1).toHaveLength(64);
         expect(/^[0-9a-f]{64}$/.test(checksum1)).toBe(true);
      });

      it('should return different checksums for different inputs', () => {
         const checksum1 = generateCursorChecksum('test_payload_1');
         const checksum2 = generateCursorChecksum('test_payload_2');

         expect(checksum1).not.toBe(checksum2);
      });
   });

   describe('encodeCursor', () => {
      it('should generate a cursor containing exactly one dot delimiter', () => {
         const cursor = encodeCursor(samplePayload);
         expect(cursor).toContain('.');
         expect(cursor.split('.')).toHaveLength(2);
      });

      it('should generate consistent cursors for the same payload object', () => {
         const cursor1 = encodeCursor(samplePayload);
         const cursor2 = encodeCursor(samplePayload);
         expect(cursor1).toBe(cursor2);
      });
   });

   describe('decodeCursor', () => {
      it('should correctly decode a valid cursor', () => {
         const cursor = encodeCursor(samplePayload);
         const decoded = decodeCursor<typeof samplePayload>(cursor);
         expect(decoded).toEqual(samplePayload);
      });

      it('should throw CursorChecksumError for invalid formats with multiple dots', () => {
         expect(() => decodeCursor('foo.bar.baz')).toThrow(CursorChecksumError);
      });

      it('should correctly decode a valid legacy cursor without a checksum', () => {
         const legacyCursor = Buffer.from(
            JSON.stringify(samplePayload)
         ).toString('base64url');
         const decoded = decodeCursor<typeof samplePayload>(legacyCursor);
         expect(decoded).toEqual(samplePayload);
      });

      it('should throw CursorChecksumError when checksum is tampered', () => {
         const cursor = encodeCursor(samplePayload);
         const [payload, checksum] = cursor.split('.');
         const tamperedChecksum =
            checksum.substring(0, 63) + (checksum.endsWith('a') ? 'b' : 'a');
         const tamperedCursor = `${payload}.${tamperedChecksum}`;

         expect(() => decodeCursor(tamperedCursor)).toThrow(
            CursorChecksumError
         );
      });

      it('should throw CursorChecksumError when payload is tampered', () => {
         const cursor = encodeCursor(samplePayload);
         const [payload, checksum] = cursor.split('.');
         // Change base64 by modifying a character
         const tamperedPayload =
            payload.substring(0, payload.length - 1) +
            (payload.endsWith('a') ? 'b' : 'a');
         const tamperedCursor = `${tamperedPayload}.${checksum}`;

         expect(() => decodeCursor(tamperedCursor)).toThrow(
            CursorChecksumError
         );
      });

      it('should throw CursorChecksumError for empty string inputs', () => {
         expect(() => decodeCursor('')).toThrow(CursorChecksumError);
         expect(() => decodeCursor('.')).toThrow(CursorChecksumError);
         expect(() => decodeCursor('payload.')).toThrow(CursorChecksumError);
         expect(() => decodeCursor('.checksum')).toThrow(CursorChecksumError);
      });

      it('should throw CursorChecksumError for invalid target typed primitives', () => {
         expect(() => decodeCursor(123 as any)).toThrow(CursorChecksumError);
      });

      it('should throw CursorChecksumError for malformed JSON payload', () => {
         const badJsonStr = 'bad_json_string';
         const payload = Buffer.from(badJsonStr).toString('base64url');
         const checksum = generateCursorChecksum(payload);
         const cursor = `${payload}.${checksum}`;

         expect(() => decodeCursor(cursor)).toThrow(CursorChecksumError);
      });

      it('should round-trip a payload containing special characters (spaces, slashes, unicode)', () => {
         const specialPayload = {
            id: 'user 123/456',
            createdAt: '2023-01-01T00:00:00.000Z',
            note: 'a/b c?d&e=f café 名前',
         };

         const cursor = encodeCursor(specialPayload);
         const decoded = decodeCursor<typeof specialPayload>(cursor);

         expect(decoded).toEqual(specialPayload);
      });

      // #679 — round-trip coverage for the exact ID/sort-value type
      // combinations pagination callers rely on, with strict (not loose)
      // equality on the decoded values.

      it('round-trips an integer ID with a timestamp sort value without data loss', () => {
         const payload = {
            id: 42,
            createdAt: '2024-03-15T09:30:00.000Z',
         };

         const cursor = encodeCursor(payload);
         const decoded = decodeCursor<typeof payload>(cursor);

         expect(typeof decoded.id).toBe('number');
         expect(decoded.id).toBe(42);
         expect(decoded.createdAt).toBe('2024-03-15T09:30:00.000Z');
         expect(decoded).toStrictEqual(payload);
      });

      it('round-trips a string ID with a numeric sort value without data loss', () => {
         const payload = {
            id: 'creator_abc123',
            sortValue: 987654321,
         };

         const cursor = encodeCursor(payload);
         const decoded = decodeCursor<typeof payload>(cursor);

         expect(typeof decoded.id).toBe('string');
         expect(decoded.id).toBe('creator_abc123');
         expect(typeof decoded.sortValue).toBe('number');
         expect(decoded.sortValue).toBe(987654321);
         expect(decoded).toStrictEqual(payload);
      });

      it('throws CursorChecksumError for a base64-tampered cursor (mid-string modification)', () => {
         const payload = { id: 7, createdAt: '2024-01-01T00:00:00.000Z' };
         const cursor = encodeCursor(payload);
         const [base64Payload, checksum] = cursor.split('.');

         // Flip a character in the middle of the base64 payload segment
         // rather than at the edge, to prove tampering is caught
         // regardless of where in the string it occurs.
         const midpoint = Math.floor(base64Payload.length / 2);
         const midChar = base64Payload[midpoint];
         const replacement = midChar === 'A' ? 'B' : 'A';
         const tamperedPayload =
            base64Payload.slice(0, midpoint) +
            replacement +
            base64Payload.slice(midpoint + 1);
         const tamperedCursor = `${tamperedPayload}.${checksum}`;

         expect(tamperedCursor).not.toBe(cursor);
         expect(() => decodeCursor(tamperedCursor)).toThrow(
            CursorChecksumError
         );
      });

      it('throws CursorChecksumError for an empty string cursor', () => {
         expect(() => decodeCursor('')).toThrow(CursorChecksumError);
      });
   });
});
