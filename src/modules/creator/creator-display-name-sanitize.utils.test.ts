import {
   sanitizeDisplayName,
   sanitizeAndValidateDisplayName,
   validateDisplayName,
} from './creator-display-name-sanitize.utils';

describe('creator display name sanitiser and validator', () => {
   describe('sanitizeDisplayName', () => {
      it('passes plain text name through unchanged', () => {
         expect(sanitizeDisplayName('Alice')).toBe('Alice');
         expect(sanitizeDisplayName('Creator Name')).toBe('Creator Name');
      });

      it('strips HTML tags leaving only text content', () => {
         expect(sanitizeDisplayName('<script>alert(1)</script>')).toBe(
            'alert(1)'
         );
         expect(sanitizeDisplayName('<b>Jane</b> <i>Doe</i>')).toBe('Jane Doe');
         expect(
            sanitizeDisplayName('<div class="profile"><h1>Alice</h1></div>')
         ).toBe('Alice');
      });

      it('normalizes extra whitespace and trims result', () => {
         expect(sanitizeDisplayName('   John   Doe   ')).toBe('John Doe');
         expect(sanitizeDisplayName('<b>  Alice  </b>')).toBe('Alice');
      });
   });

   describe('sanitizeAndValidateDisplayName', () => {
      it('passes a plain text name through unchanged', () => {
         const result = sanitizeAndValidateDisplayName('Creator Name');
         expect(result).toEqual({
            success: true,
            data: 'Creator Name',
         });
      });

      it('strips HTML tags and passes remaining text content', () => {
         const result = sanitizeAndValidateDisplayName(
            '<script>alert(1)</script>'
         );
         expect(result).toEqual({
            success: true,
            data: 'alert(1)',
         });
      });

      it('passes a name of exactly 50 characters', () => {
         const exactly50Chars = 'a'.repeat(50);
         const result = sanitizeAndValidateDisplayName(exactly50Chars);
         expect(result).toEqual({
            success: true,
            data: exactly50Chars,
         });
         expect((result as { success: true; data: string }).data.length).toBe(
            50
         );
      });

      it('fails a name of 51 characters with display_name_too_long', () => {
         const fiftyOneChars = 'a'.repeat(51);
         const result = sanitizeAndValidateDisplayName(fiftyOneChars);
         expect(result).toEqual({
            success: false,
            error: 'display_name_too_long',
         });
      });

      it('fails an empty string after stripping with display_name_empty', () => {
         expect(sanitizeAndValidateDisplayName('')).toEqual({
            success: false,
            error: 'display_name_empty',
         });
         expect(sanitizeAndValidateDisplayName('   ')).toEqual({
            success: false,
            error: 'display_name_empty',
         });
         expect(sanitizeAndValidateDisplayName('<script></script>')).toEqual({
            success: false,
            error: 'display_name_empty',
         });
         expect(sanitizeAndValidateDisplayName('<b>   </b>')).toEqual({
            success: false,
            error: 'display_name_empty',
         });
      });

      it('strips HTML tags before evaluating 50-character limit', () => {
         // Raw string is 57 characters, but after tag stripping it is 50 characters
         const rawWithTags = '<b>' + 'x'.repeat(50) + '</b>';
         const result = sanitizeAndValidateDisplayName(rawWithTags);
         expect(result).toEqual({
            success: true,
            data: 'x'.repeat(50),
         });
      });
   });

   describe('validateDisplayName helper', () => {
      it('returns sanitized string for valid input', () => {
         expect(validateDisplayName('<b>Alice</b>')).toBe('Alice');
      });

      it('throws Error with display_name_too_long when exceeding 50 chars', () => {
         expect(() => validateDisplayName('b'.repeat(51))).toThrow(
            'display_name_too_long'
         );
      });

      it('throws Error with display_name_empty when empty post-strip', () => {
         expect(() => validateDisplayName('<script></script>')).toThrow(
            'display_name_empty'
         );
      });
   });
});
