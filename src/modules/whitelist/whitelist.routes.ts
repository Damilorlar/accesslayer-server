import { Router } from 'express';
import { httpGetWhitelistStatus } from './whitelist.controllers';

const whitelistRouter = Router();

/**
 * GET /keys/:keyId/whitelist
 * Public endpoint - no authentication required
 * Returns whitelist status and wallet approval status
 */
whitelistRouter.get('/:keyId/whitelist', httpGetWhitelistStatus);

export default whitelistRouter;
