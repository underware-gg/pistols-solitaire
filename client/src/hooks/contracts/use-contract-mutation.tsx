'use client';

import { useAccount } from '@starknet-react/core';
import { useMutation } from '@tanstack/react-query';
import { shortAddress } from '@underware/pistols-sdk/utils';
import { toast } from 'sonner';
import {
  type AccountInterface,
  type Call,
  CallData,
  type RawArgs,
  TransactionFinalityStatus,
} from 'starknet';
import { ElapsedTimeBadge } from '@/components/ElapsedTimeBadge';
import { getPistolsContract, type PistolsContractName } from '@/dojo/contracts';
import { handleApiError } from '@/lib/client-utils';

// Module-level incrementing id for addressable toasts, as in `mutations/use-action-mutation.tsx`.
let _actionIdCounter = 0;
const nextActionId = () => (_actionIdCounter += 1);

// A transaction is done when it is in a block with a known execution status. `PRE_CONFIRMED` is
// included deliberately: on mainnet it lands seconds before `ACCEPTED_ON_L2`, and it already
// carries `execution_status`, so waiting past it only makes a successful claim feel slow.
const SUCCESS_STATES = [
  TransactionFinalityStatus.PRE_CONFIRMED,
  TransactionFinalityStatus.ACCEPTED_ON_L2,
  TransactionFinalityStatus.ACCEPTED_ON_L1,
];

type ContractMutationProps<TArgs> = {
  contract: PistolsContractName;
  /** The Cairo entrypoint, snake_case as the contract spells it. */
  entrypoint: string;
  /**
   * Arguments for that entrypoint, compiled against its ABI. Omit it for an entrypoint that takes
   * none — that also skips the ABI lookup, which is what lets us call one the published SDK
   * manifest has not caught up with yet (`purchase_random`).
   */
  args?: (variables: TArgs) => RawArgs;
  /**
   * Calls that must land ahead of the entrypoint in the same transaction — an ERC-20 approval, a
   * VRF request (`dojo/calls.ts`). Async because the amount to approve is usually a fee the
   * contract has to be asked for first, and `undefined` entries are dropped, so a builder can
   * return an approval that turns out not to be needed.
   */
  before?: (
    variables: TArgs,
    context: { account: AccountInterface },
  ) => Promise<(Call | undefined)[]> | (Call | undefined)[];
  /**
   * What is stale now that this landed — the per-entrypoint hook's own business, since it is the
   * only thing that knows which views the call moved. Components can still pass their own
   * callbacks to `mutate(args, { onSuccess })`; react-query runs both.
   */
  onSuccess?: (result: ContractMutationResult, variables: TArgs) => void;
};

export type ContractMutationResult = {
  transactionHash: string;
};

//
// One write call on one of the world's contracts: send it, wait for it, tell the player.
//
// **Why this is not `useSendTransaction`.** That hook resolves the moment the wallet accepts the
// transaction, not when the chain executes it — so it can say "sent", never "claimed", and a toast
// driven by it would report success on a transaction that goes on to revert. So the mutation calls
// `account.execute` and then `waitForTransaction`, and a revert is thrown like any other failure.
// This is a mutation over an SDK promise with no hook of its own, not a cache over a chain hook
// (specs/NEXTJS_DATA_FLOW.md §0).
//
// **Calldata comes from the ABI, not by hand.** `new CallData(abi).compile()` needs no provider and
// knows every Cairo type, so an entrypoint taking a struct or an enum costs an `args` mapper and
// nothing else.
//
// **One entrypoint, but not always one call.** A paid entrypoint needs an ERC-20 approval in front of
// it and a random one needs a VRF request; `before` supplies them and they go in the same
// transaction, so the toast, the receipt and the revert are all still one thing. That is also why
// `before` may be async: the amount to approve is a fee the contract has to be asked for first.
//
// **The whole toast lifecycle is inside `mutationFn`**, which is the one divergence from
// `useActionMutation` (onMutate / onSettled). Two reasons: the toast has to survive the callbacks
// react-query skips when a component unmounts mid-transaction, and the transaction hash only exists
// halfway through — from there the same toast carries it, so the player can look the transaction up
// while it is still pending. One toast per call, `loading` → `success` or `error` at the same id.
//
export function useContractMutation<TArgs = void>({
  contract,
  entrypoint,
  args,
  before,
  onSuccess,
}: ContractMutationProps<TArgs>) {
  const { account } = useAccount();
  const label = `${contract}::${entrypoint}()`;

  return useMutation<ContractMutationResult, Error, TArgs>({
    onSuccess,
    mutationFn: async (variables: TArgs) => {
      const actionId = nextActionId();
      const toastKey = `${label}-${actionId}`;
      const startedAt = Date.now();

      const pending = (transactionHash?: string) =>
        toast.loading(
          <span>
            {label} <span className="text-ps-text/50 text-xs">#{actionId}</span>
          </span>,
          {
            id: toastKey,
            description: (
              <span className="flex items-center gap-2">
                <ElapsedTimeBadge startedAt={startedAt} />
                {transactionHash && (
                  <span className="font-mono text-ps-text/50 text-xs">
                    {shortAddress(transactionHash)}
                  </span>
                )}
              </span>
            ),
          },
        );

      pending();
      try {
        if (!account) throw new Error(`${label}: no account connected`);

        const { address, abi } = getPistolsContract(contract);
        const call: Call = {
          contractAddress: address,
          entrypoint,
          calldata: args ? new CallData(abi).compile(entrypoint, args(variables)) : [],
        };
        const calls = [...((await before?.(variables, { account })) ?? []), call].filter(
          (each): each is Call => Boolean(each),
        );

        const { transaction_hash: transactionHash } = await account.execute(calls);
        pending(transactionHash);

        const receipt = await account.waitForTransaction(transactionHash, {
          retryInterval: 500,
          successStates: SUCCESS_STATES,
        });
        if (receipt.isReverted()) {
          throw new Error(receipt.value.revert_reason || `${label} reverted`);
        }
        if (receipt.isError()) {
          throw new Error(receipt.value.message || `${label} failed`);
        }

        toast.success(label, {
          id: toastKey,
          description: <span className="font-mono text-xs">{shortAddress(transactionHash)}</span>,
          duration: 5000,
        });
        return { transactionHash };
      } catch (error) {
        // Replaces the loading toast in place, so a call never leaves two toasts behind.
        handleApiError(label, variables, error, { toastId: toastKey });
        throw error;
      }
    },
  });
}
