'use client';

import { LogOut } from 'lucide-react';
import type { constants } from '@underware/pistols-sdk/pistols/gen';
import { weiToEthString } from '@underware/pistols-sdk/starknet';
import { isPositiveBigint, shortAddress } from '@underware/pistols-sdk/utils';
import { useState } from 'react';
import { ControllerButton } from '@/components/ControllerButton';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PROFILE, PROFILE_NAME } from '@/dojo/config';
import { useGetDuelDeck, useGetDuelProgress } from '@/hooks/contracts/use-game';
import {
  useAirdrop,
  useCalcMintFee,
  useCanClaimStarterPack,
  useCanPurchase,
  useClaimStarterPack,
  useOpenPack,
  usePurchase,
  usePurchaseRandom,
} from '@/hooks/contracts/use-pack-token';
import { useCanClaimRing, useClaimRing } from '@/hooks/contracts/use-ring-token';
import { useController, useControllerLookup } from '@/hooks/use-controller';
import { cn } from '@/lib/cn';

//
// The `/test` route: a bench for `hooks/contracts/*`, one section per contract.
//
// Not product UI — it exists so a contract call can be exercised (and its toast watched) without a
// game around it. Delete it, or the sections of it that a real page has taken over.
//

// bigints don't survive JSON.stringify, and every chain-scale number here is one.
const dump = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

export function TestPage({ className }: { className?: string }) {
  return (
    <main className={cn('mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8', className)}>
      <header className="flex items-baseline gap-3">
        <h1>Contract Calls</h1>
        <span className="text-ps-text/60 text-sm">
          {PROFILE_NAME} · {shortAddress(PROFILE.contractAddresses.pistols?.world ?? '0x0')}
        </span>
      </header>

      <AccountSection />
      <PackTokenSection />
      <RingTokenSection />
      <GameSection />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-ps-line bg-ps-panel p-4">
      <h2 className="mb-3 text-ps-accent">{title}</h2>
      {children}
    </section>
  );
}

function AccountSection() {
  const { isConnected, address, disconnect } = useController();

  return (
    <Section title="account">
      <div className="flex flex-wrap items-center gap-3">
        {/* Connecting is the header's `ControllerButton` — the bench only offers the way out. */}
        <ControllerButton />
        {isConnected && (
          <Button variant="secondary" onClick={disconnect}>
            <LogOut className="size-4" />
            Disconnect
          </Button>
        )}
        <span className="font-mono text-ps-text/60 text-xs">
          {address ? shortAddress(address) : 'no account'}
        </span>
      </div>
    </Section>
  );
}

function PackTokenSection() {
  const { isConnected } = useController();
  const { canClaimStarterPack, isLoading, error } = useCanClaimStarterPack();
  const { mutate: claimStarterPack, isPending } = useClaimStarterPack();

  return (
    <Section title="pack_token">
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 text-sm">
        <dt className="font-mono text-ps-text/60">can_claim_starter_pack</dt>
        <dd>
          {!isConnected
            ? '— (connect first)'
            : isLoading
              ? 'reading…'
              : error
                ? `error: ${error.message}`
                : String(canClaimStarterPack)}
        </dd>
      </dl>

      <Button
        onClick={() => claimStarterPack({})}
        disabled={!isConnected || isPending || canClaimStarterPack !== true}
      >
        {isPending && <Spinner size="sm" />}
        claim_starter_pack
      </Button>

      <PurchaseControls />
    </Section>
  );
}

// The buy-and-open half of pack_token: pick a type, read its fee, buy it, then open a pack by id.
// The type list is the manifest's, not the SDK enum's — see the note in `use-pack-token.ts`.
const PACK_TYPES = [
  'StarterPack',
  'GenesisDuelists5x',
  'FreeDuelist',
  'SingleDuelist',
  'FreeGenesis5x',
] as constants.PackType[];

function PurchaseControls() {
  const { isConnected } = useController();
  const [packType, setPackType] = useState<constants.PackType>(PACK_TYPES[1]);
  const [packId, setPackId] = useState('');

  const { canPurchase, isLoading: isLoadingCanPurchase } = useCanPurchase(packType);
  const { fee, isLoading: isLoadingFee } = useCalcMintFee(packType);
  const { mutate: purchase, isPending: isPurchasing } = usePurchase();
  const { mutate: purchaseRandom, isPending: isPurchasingRandom } = usePurchaseRandom();
  const { mutate: openPack, isPending: isOpening } = useOpenPack();

  const isBusy = isPurchasing || isPurchasingRandom || isOpening;

  return (
    <div className="mt-4 border-ps-line border-t pt-4">
      <label className="mb-3 flex items-center gap-3 text-sm">
        <span className="font-mono text-ps-text/60">pack_type</span>
        <select
          value={packType}
          onChange={event => setPackType(event.target.value as constants.PackType)}
          className="rounded border border-ps-line bg-ps-bg px-2 py-1 font-mono"
        >
          {PACK_TYPES.map(type => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      {/* The two views and the two writes they gate, side by side. `flex-1` on the readouts is what
          pins the buttons to the right edge — sizing them off the values instead would shift them
          sideways as `reading…` resolves to a fee. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 text-sm">
          <dt className="font-mono text-ps-text/60">can_purchase</dt>
          <dd>{!isConnected ? '—' : isLoadingCanPurchase ? 'reading…' : String(canPurchase)}</dd>
          <dt className="font-mono text-ps-text/60">calc_mint_fee</dt>
          <dd>
            {!isConnected
              ? '—'
              : isLoadingFee
                ? 'reading…'
                : fee === undefined
                  ? '—'
                  : `${weiToEthString(fee)} LORDS`}
          </dd>
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => purchase({ packType })}
            disabled={!isConnected || isBusy || canPurchase !== true}
          >
            {isPurchasing && <Spinner size="sm" />}
            purchase
          </Button>
          <Button
            variant="secondary"
            onClick={() => purchaseRandom()}
            disabled={!isConnected || isBusy}
          >
            {isPurchasingRandom && <Spinner size="sm" />}
            purchase_random
          </Button>
        </div>
      </div>

      <AirdropControls packType={packType} />

      <div className="mt-4 flex flex-wrap items-center gap-3 border-ps-line border-t pt-4">
        <label className="flex items-center gap-3 text-sm">
          <span className="font-mono text-ps-text/60">pack_id</span>
          <input
            type="number"
            min={1}
            value={packId}
            onChange={event => setPackId(event.target.value)}
            className="w-32 rounded border border-ps-line bg-ps-bg px-2 py-1 font-mono"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => openPack({ packId: BigInt(packId) })}
          disabled={!isConnected || isBusy || !isPositiveBigint(packId || 0)}
        >
          {isOpening && <Spinner size="sm" />}
          open
        </Button>
      </div>
    </div>
  );
}

// `airdrop` is the one pack call that mints to somebody else, so it needs a recipient the other
// controls don't: a raw address, or a Controller username that `useControllerLookup` turns into one.
// The resolved address is shown in full — it is the thing being confirmed before a mint goes out —
// and the button stays locked until there is one, so a half-typed name can't be sent.
function AirdropControls({ packType }: { packType: constants.PackType }) {
  const { isConnected } = useController();
  const [recipient, setRecipient] = useState('');
  const { address, isLoading } = useControllerLookup(recipient);
  const { mutate: airdrop, isPending } = useAirdrop();

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 text-sm">
          <span className="font-mono text-ps-text/60">Airdrop To:</span>
          <input
            type="text"
            placeholder="0x… or username"
            value={recipient}
            onChange={event => setRecipient(event.target.value)}
            className="w-72 rounded border border-ps-line bg-ps-bg px-2 py-1 font-mono"
          />
        </label>
        <Button
          variant="secondary"
          onClick={() => address && airdrop({ recipient: address, packType })}
          disabled={!isConnected || isPending || !address}
        >
          {isPending && <Spinner size="sm" />}
          airdrop
        </Button>
        <span className="text-ps-text/60 text-xs">admin only</span>
      </div>
      {/* A non-breaking space holds the line, so resolving an address doesn't nudge the row below. */}
      <div className="mt-1 break-all font-mono text-ps-text/60 text-xs">
        {isLoading
          ? 'looking up…'
          : (address ?? (recipient.trim() ? 'not an address or a known username' : ' '))}
      </div>
    </div>
  );
}

// Rings are claimed per duel, so this section shares the game section's duel id.
function RingTokenSection() {
  const { isConnected } = useController();
  const [duelId, setDuelId] = useState('1');
  const { ringType, canClaimRing, isLoading, error } = useCanClaimRing(BigInt(duelId || 0));
  const { mutate: claimRing, isPending } = useClaimRing();

  return (
    <Section title="ring_token">
      <DuelIdInput value={duelId} onChange={setDuelId} />

      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 text-sm">
        <dt className="font-mono text-ps-text/60">get_claimable_season_ring_type</dt>
        <dd>
          {!isConnected
            ? '— (connect first)'
            : isLoading
              ? 'reading…'
              : error
                ? `error: ${error.message}`
                : (ringType ?? 'None')}
        </dd>
      </dl>

      <Button
        onClick={() => ringType && claimRing({ duelId: BigInt(duelId || 0), ringType })}
        disabled={!isConnected || isPending || canClaimRing !== true}
      >
        {isPending && <Spinner size="sm" />}
        claim_season_ring
      </Button>
    </Section>
  );
}

function GameSection() {
  const [duelId, setDuelId] = useState('1');
  const id = BigInt(duelId || 0);
  const deck = useGetDuelDeck(id);
  const progress = useGetDuelProgress(id);

  return (
    <Section title="game">
      <DuelIdInput value={duelId} onChange={setDuelId} />

      <Readout label="get_duel_deck" isLoading={deck.isLoading} error={deck.error}>
        {dump(deck.decks)}
      </Readout>
      <Readout label="get_duel_progress" isLoading={progress.isLoading} error={progress.error}>
        {dump(progress.duelProgress)}
      </Readout>
    </Section>
  );
}

function DuelIdInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mb-3 flex items-center gap-3 text-sm">
      <span className="font-mono text-ps-text/60">duel_id</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-32 rounded border border-ps-line bg-ps-bg px-2 py-1 font-mono"
      />
    </label>
  );
}

function Readout({
  label,
  isLoading,
  error,
  children,
}: {
  label: string;
  isLoading: boolean;
  error: Error | null;
  children: string;
}) {
  return (
    <div className="mt-3">
      <h3 className="font-mono text-ps-text/60 text-sm">{label}</h3>
      <pre className="max-h-64 overflow-auto rounded border border-ps-line p-2 text-xs">
        {isLoading ? 'reading…' : error ? `error: ${error.message}` : children}
      </pre>
    </div>
  );
}
