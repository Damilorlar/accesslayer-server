import { Router } from 'express';
import { httpClearDrift } from './sequencer.controllers';

const sequencerRouter = Router();

sequencerRouter.post('/sequencer/clear-drift/:creatorWallet', httpClearDrift);

export default sequencerRouter;
