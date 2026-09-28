import { Router } from 'express';
import { httpMultiBuy } from './multi-buy.controllers';

const tradingRouter = Router();

tradingRouter.post('/multi-buy', httpMultiBuy);

export default tradingRouter;
