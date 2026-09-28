import type { Request, Response } from 'express';
import {
   Account,
   Keypair,
   Memo,
   Networks,
   Operation,
   TransactionBuilder,
} from '@stellar/stellar-base';
import { randomBytes } from 'crypto';
import { envConfig } from '../../config';
import { StellarAddressSchema } from '../wallet/wallet.schemas';
import { ErrorCode } from '../../constants/error.constants';
import { sendError, sendSuccess } from '../../utils/api-response.utils';

const serverKeypair = envConfig.STELLAR_AUTH_SECRET
   ? Keypair.fromSecret(envConfig.STELLAR_AUTH_SECRET)
   : Keypair.random();

export function getChallengeServerPublicKey(): string {
   return serverKeypair.publicKey();
}

export async function httpStellarChallenge(
   req: Request,
   res: Response
): Promise<void> {
   const walletAddress = req.body?.wallet_address;
   if (!StellarAddressSchema.safeParse(walletAddress).success) {
      sendError(
         res,
         422,
         ErrorCode.VALIDATION_ERROR,
         'A valid Stellar wallet_address is required'
      );
      return;
   }

   const nonce = randomBytes(12).toString('hex');
   const networkPassphrase =
      envConfig.STELLAR_NETWORK === 'mainnet'
         ? Networks.PUBLIC
         : Networks.TESTNET;
   const webAuthDomain = new URL(envConfig.BACKEND_URL).host;
   const transaction = new TransactionBuilder(
      new Account(walletAddress, '-1'),
      { fee: '0', networkPassphrase }
   )
      .addOperation(
         Operation.manageData({
            name: 'web_auth_domain',
            value: webAuthDomain,
            source: serverKeypair.publicKey(),
         })
      )
      .addMemo(Memo.text(nonce))
      .setTimeout(300)
      .build();
   transaction.sign(serverKeypair);

   sendSuccess(res, {
      transaction: transaction.toXDR(),
      server_public_key: serverKeypair.publicKey(),
      network_passphrase: networkPassphrase,
   });
}
