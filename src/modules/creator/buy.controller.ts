import type { Response } from 'express';
import { z } from 'zod';
import type { StellarSignedRequest } from '../../middlewares/stellar-signature.middleware';
import { ErrorCode } from '../../constants/error.constants';
import { sendError, sendSuccess } from '../../utils/api-response.utils';
import { buyGateway } from './buy.service';
import { assertTradingActive, TradingPausedError } from '../keys/key-trading.service';

export const buySchema = z.object({
   quantity: z.number().int().positive(),
   key_cost_xlm: z.number().nonnegative(),
   fee_xlm: z.number().nonnegative().default(0),
});

export type BuyRequestBody = z.infer<typeof buySchema>;

export async function httpBuyCreatorKey(
   req: StellarSignedRequest,
   res: Response
): Promise<void> {
   // Body is already validated and stripped of unknown fields by the
   // validateBody(buySchema) middleware on this route.
   const body = req.body as BuyRequestBody;

   const walletAddress = req.walletAddress!;
   try {
      await assertTradingActive(String(req.params.id));
   } catch (error) {
      if (error instanceof TradingPausedError) {
         sendError(res, 503, ErrorCode.INTERNAL_ERROR, error.message);
         return;
      }
      throw error;
   }
   const required = body.key_cost_xlm * body.quantity + body.fee_xlm;
   const balance = await buyGateway.getXlmBalance(walletAddress);
   if (balance < required) {
      sendError(
         res,
         422,
         ErrorCode.INSUFFICIENT_BALANCE,
         'Wallet does not have enough XLM for the purchase and fees'
      );
      return;
   }

   const result = await buyGateway.submitBuy({
      walletAddress,
      creatorId: String(req.params.id),
      quantity: body.quantity,
   });
   sendSuccess(res, result, 200);
}
