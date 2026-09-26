// src/modules/keys/key-proposal-votes.service.ts
import { prisma } from '../../utils/prisma.utils';
import { logger } from '../../utils/logger.utils';
import { Decimal } from '@prisma/client/runtime/library';
import { getDelegatedVoteWeight } from '../governance/governance-delegation.service';

export class HolderNotEligibleError extends Error {
   constructor(wallet: string) {
      super(`Wallet ${wallet} holds no keys and is not eligible to vote`);
      this.name = 'HolderNotEligibleError';
   }
}

export class DuplicateVoteError extends Error {
   constructor() {
      super('Wallet has already voted on this proposal');
      this.name = 'DuplicateVoteError';
   }
}

export class OptionIndexOutOfRangeError extends Error {
   constructor(optionIndex: number, optionCount: number) {
      super(
         `optionIndex ${optionIndex} is out of range; proposal has ${optionCount} options`
      );
      this.name = 'OptionIndexOutOfRangeError';
   }
}

export interface CastVoteResult {
   proposalId: string;
   optionIndex: number;
   option: string;
   /** Total vote weight including delegated weight from active delegators. */
   weight: string;
   /** The voter's own key balance. */
   ownWeight: string;
   /** Sum of delegated weight from all active delegators. */
   delegatedWeight: string;
   /** Number of active delegators whose weight was included. */
   delegatorCount: number;
}

/**
 * Load the proposal so the route can map outcomes to the correct HTTP
 * status codes (404 for missing/closed, 409 for duplicates, 422 for invalid
 * option index, 403 for non-holders).
 */
export async function getProposalForVoting(
   keyId: string,
   proposalId: string
): Promise<{
   exists: boolean;
   status?: 'active' | 'closed';
   options?: string[];
}> {
   const proposal = await prisma.governanceProposal.findFirst({
      where: { keyId, proposalId },
   });

   if (!proposal) {
      return { exists: false };
   }

   return {
      exists: true,
      status: proposal.status as 'active' | 'closed',
      options: proposal.options as string[],
   };
}

/**
 * Check whether a wallet has already voted on a proposal.
 */
export async function hasWalletVoted(
   keyId: string,
   proposalId: string,
   wallet: string
): Promise<boolean> {
   const vote = await prisma.governanceVote.findUnique({
      where: {
         keyId_proposalId_voter: { keyId, proposalId, voter: wallet },
      },
   });
   return !!vote;
}

/**
 * Submit a governance vote on behalf of a key holder and persist it.
 *
 * Vote weight = voter's own key balance + sum of key balances of all wallets
 * that have an active vote delegation pointing to this voter on the same key.
 * Revoked delegations are excluded from the weight calculation.
 *
 * The vote record is written to the `proposal_votes` table with the combined
 * weight.  A duplicate vote surfaces as a Prisma unique constraint violation
 * mapped by the route to 409.
 *
 * @returns CastVoteResult with the total weight broken down into ownWeight
 *   and delegatedWeight so callers can inspect the composition.
 */
export async function castKeyProposalVote(
   keyId: string,
   proposalId: string,
   optionIndex: number,
   wallet: string
): Promise<CastVoteResult> {
   const existing = await getProposalForVoting(keyId, proposalId);
   if (!existing.exists) {
      const err = new Error('Proposal not found or closed');
      err.name = 'ProposalNotFoundOrClosedError';
      throw err;
   }

   const options = existing.options ?? [];
   if (optionIndex < 0 || optionIndex >= options.length) {
      throw new OptionIndexOutOfRangeError(optionIndex, options.length);
   }

   // Own balance — determines eligibility.
   const ownership = await prisma.keyOwnership.findUnique({
      where: {
         ownerAddress_creatorId: { ownerAddress: wallet, creatorId: keyId },
      },
   });

   const ownBalance = ownership ? Number(ownership.balance) : 0;
   if (ownBalance <= 0) {
      throw new HolderNotEligibleError(wallet);
   }

   const alreadyVoted = await hasWalletVoted(keyId, proposalId, wallet);
   if (alreadyVoted) {
      throw new DuplicateVoteError();
   }

   // Delegated weight: sum of key balances of all active delegators.
   // Fetched outside the transaction because it is read-only and does not
   // need to be part of the atomic write.
   const [delegatedBalance, delegatorCount] = await Promise.all([
      getDelegatedVoteWeight(wallet, keyId),
      prisma.voteDelegation.count({
         where: { delegateeWallet: wallet, keyId, isActive: true },
      }),
   ]);

   const totalWeight = ownBalance + delegatedBalance;
   const weightStr = String(totalWeight);
   const ownWeightStr = String(ownBalance);
   const delegatedWeightStr = String(delegatedBalance);

   // TODO: submit cast_vote contract call via Stellar SDK
   // On-chain failure should return 502 before reaching this point.
   logger.info(
      {
         operation: 'cast_vote',
         keyId,
         proposalId,
         voter: wallet,
         optionIndex,
         option: options[optionIndex],
         ownWeight: ownWeightStr,
         delegatedWeight: delegatedWeightStr,
         totalWeight: weightStr,
         delegatorCount,
      },
      'Submitting cast_vote contract call'
   );

   await prisma.$transaction([
      prisma.governanceVote.create({
         data: {
            keyId,
            proposalId,
            voter: wallet,
            optionIndex,
            weight: new Decimal(weightStr),
         },
      }),
      // Use the correct GOVERNANCE_VOTE_CAST activity type (#933).
      prisma.activity.create({
         data: {
            type: 'GOVERNANCE_VOTE_CAST' as any,
            actor: wallet,
            creatorId: keyId,
            payload: {
               keyId,
               proposalId,
               optionIndex,
               option: options[optionIndex],
               ownWeight: ownWeightStr,
               delegatedWeight: delegatedWeightStr,
               totalWeight: weightStr,
               delegatorCount,
            },
         },
      }),
   ]);

   return {
      proposalId,
      optionIndex,
      option: options[optionIndex],
      weight: weightStr,
      ownWeight: ownWeightStr,
      delegatedWeight: delegatedWeightStr,
      delegatorCount,
   };
}
