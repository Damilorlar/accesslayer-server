import { Router } from 'express';
import {
   httpGetDividendDistributions,
   httpGetDividendHolders,
} from './dividend.controllers';

const dividendRouter = Router();

/**
 * GET /keys/:keyId/dividends
 * Public endpoint - no authentication required
 * Returns all past dividend distributions for a creator key
 */
dividendRouter.get('/:keyId/dividends', httpGetDividendDistributions);

/**
 * GET /keys/:keyId/dividends/:distributionId/holders
 * Public endpoint - no authentication required
 * Returns per-holder payout breakdown for a specific distribution
 */
dividendRouter.get(
   '/:keyId/dividends/:distributionId/holders',
   httpGetDividendHolders
);

export default dividendRouter;
