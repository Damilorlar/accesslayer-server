import { signJwt } from '../../utils/jwt.utils';
import {
   refreshAccessToken,
   REFRESH_WINDOW_SECONDS,
} from './token-refresh.utils';

describe('refreshAccessToken', () => {
   it('issues a new token when the current token has 10 minutes remaining (inside the refresh window)', () => {
      const token = signJwt({ sub: 'user-123' }, 10 * 60);

      const result = refreshAccessToken(token);

      expect(result.success).toBe(true);
      if (result.success) {
         expect(typeof result.token).toBe('string');
         expect(result.token).not.toBe(token);
      }
   });

   it('returns 400 refresh_not_due for a token with 2 hours remaining (outside the refresh window)', () => {
      const token = signJwt({ sub: 'user-123' }, 2 * 60 * 60);

      const result = refreshAccessToken(token);

      expect(result.success).toBe(false);
      if (!result.success) {
         expect(result.status).toBe(400);
         expect(result.code).toBe('refresh_not_due');
      }
   });

   it('returns 401 token_expired for an already-expired token', () => {
      const token = signJwt({ sub: 'user-123' }, -60);

      const result = refreshAccessToken(token);

      expect(result.success).toBe(false);
      if (!result.success) {
         expect(result.status).toBe(401);
         expect(result.code).toBe('token_expired');
      }
   });

   it("the new token's sub matches the original token's sub", () => {
      const token = signJwt({ sub: 'user-abc-999' }, 5 * 60);

      const result = refreshAccessToken(token);

      expect(result.success).toBe(true);
      if (result.success) {
         expect(result.sub).toBe('user-abc-999');
      }
   });

   it('does not invalidate the old token after refresh (stateless refresh)', () => {
      const token = signJwt({ sub: 'user-123' }, 10 * 60);

      const firstRefresh = refreshAccessToken(token);
      expect(firstRefresh.success).toBe(true);

      // The original token is not tracked/blacklisted, so refreshing again
      // with the same original token still succeeds.
      const secondRefresh = refreshAccessToken(token);
      expect(secondRefresh.success).toBe(true);
   });

   it('treats a token exactly at the edge of the refresh window as due for refresh', () => {
      const token = signJwt({ sub: 'user-123' }, REFRESH_WINDOW_SECONDS - 1);

      const result = refreshAccessToken(token);

      expect(result.success).toBe(true);
   });

   it('returns 401 invalid_token for a malformed token', () => {
      const result = refreshAccessToken('not-a-real-token');

      expect(result.success).toBe(false);
      if (!result.success) {
         expect(result.status).toBe(401);
         expect(result.code).toBe('invalid_token');
      }
   });
});
