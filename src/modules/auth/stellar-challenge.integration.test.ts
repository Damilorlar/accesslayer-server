import express from 'express';
import request from 'supertest';
import {
   Keypair,
   Networks,
   Transaction,
   TransactionBuilder,
} from '@stellar/stellar-base';
import {
   getChallengeServerPublicKey,
   httpStellarChallenge,
} from './stellar-challenge.controller';

const app = express();
app.use(express.json());
app.post('/api/v1/auth/challenge', httpStellarChallenge);

describe('wallet authentication challenge', () => {
   it('returns a signed XDR with web_auth_domain and a unique nonce memo', async () => {
      const walletAddress = Keypair.random().publicKey();
      const first = await request(app)
         .post('/api/v1/auth/challenge')
         .send({ wallet_address: walletAddress });
      const second = await request(app)
         .post('/api/v1/auth/challenge')
         .send({ wallet_address: walletAddress });

      expect(first.status).toBe(200);
      const transaction = TransactionBuilder.fromXDR(
         first.body.data.transaction,
         Networks.TESTNET
      ) as Transaction;
      expect(transaction.operations).toEqual(
         expect.arrayContaining([
            expect.objectContaining({
               type: 'manageData',
               name: 'web_auth_domain',
            }),
         ])
      );
      expect(transaction.memo.type).toBe('text');
      expect(transaction.memo.value).toBeTruthy();
      const secondTransaction = TransactionBuilder.fromXDR(
         second.body.data.transaction,
         Networks.TESTNET
      ) as Transaction;
      expect(secondTransaction.memo.value).not.toBe(transaction.memo.value);

      expect(transaction.signatures).toHaveLength(1);
      const server = Keypair.fromPublicKey(getChallengeServerPublicKey());
      expect(
         server.verify(
            transaction.hash(),
            transaction.signatures[0].signature()
         )
      ).toBe(true);
   });

   it('returns 422 for an invalid wallet address', async () => {
      const response = await request(app)
         .post('/api/v1/auth/challenge')
         .send({ wallet_address: 'invalid' });
      expect(response.status).toBe(422);
   });
});
