import { Router } from 'express';
import {
   httpGetKeyDiscovery,
   httpGetKeyLeaderboard,
   httpGlobalSearch,
} from './keys.controller';
import { normalizeTrailingSlash } from '../../middlewares/trailing-slash-normalizer.middleware';
import { cacheControl } from '../../middlewares/cache-control.middleware';

const keysRouter = Router();

keysRouter.use(normalizeTrailingSlash);

/**
 * GET /api/v1/keys/discovery (issue #901)
 *
 * Trending keys by 24h volume + the newest listings. Application-level cache
 * (60s TTL, invalidated on key creation), so no CDN cache-control here.
 */
keysRouter.get('/discovery', httpGetKeyDiscovery);

/**
 * GET /api/v1/keys/leaderboard (issue #896)
 *
 * Trading volume per creator key over a configurable window, ranked.
 * Application-level cache with a window-sized TTL.
 */
keysRouter.get('/leaderboard', httpGetKeyLeaderboard);

/**
 * GET /api/v1/search (issue #895)
 *
 * Unified search across keys, creators and governance proposals. Short
 * application-level TTL keeps repeated queries off the database.
 */
keysRouter.get(
   '/search',
   cacheControl({ maxAge: 30, type: 'public' }),
   httpGlobalSearch
);

export default keysRouter;
