import { Connection, PublicKey } from '@solana/web3.js';

export type PolicyDecision = {
  allow: boolean;
  reason?: string;
  solUsd?: number;
  usdAmount?: number;
};

const DEFAULT_RPC = process.env.SWITCHBOARD_RPC_URL || 'https://api.devnet.solana.com';
const DEFAULT_FEED =
  process.env.SWITCHBOARD_SOL_USD_AGGREGATOR ||
  // Provided by user (devnet SOL/USD)
  '822512ee9add93518eca1c105a38422841a76c590db079eebb283deb2c14caa9';

const REQUIRED = String(process.env.SWITCHBOARD_REQUIRED || 'false').toLowerCase() === 'true';
const MAX_USD_PER_CALL = Number(process.env.MAX_USD_PER_CALL || '25'); // default $25 cap per call

async function dynamicLoadSwitchboard() {
  try {
    return { lib: await import('@switchboard-xyz/switchboard-v2'), variant: 'v2' as const };
  } catch {}
  return { lib: null, variant: 'none' as const };
}

function toPublicKey(pk: string): PublicKey {
  const hex64 = /^[0-9a-f]{64}$/i;
  if (hex64.test(pk)) {
    return new PublicKey(Buffer.from(pk, 'hex'));
  }
  return new PublicKey(pk);
}

export async function getSolUsdPrice(rpcUrl: string = DEFAULT_RPC, aggregatorPubkey: string = DEFAULT_FEED): Promise<number | undefined> {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const { lib, variant } = await dynamicLoadSwitchboard();
    if (!lib) {
      if (REQUIRED) throw new Error('Switchboard SDK missing');
      return undefined;
    }
    if (variant === 'v2') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const program = await (lib as any).loadSwitchboardProgram('devnet', connection);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aggregator = new (lib as any).AggregatorAccount(program, toPublicKey(aggregatorPubkey));
      const data = await aggregator.loadData();
      const num = data.latestConfirmedRound?.result?.toNumber();
      if (typeof num === 'number' && isFinite(num)) return num;
    }
    return undefined;
  } catch (e) {
    if (REQUIRED) throw e;
    return undefined;
  }
}

/**
 * Enforce a simple price-cap policy based on SOL/USD feed.
 * - Convert lamports to USD using current feed value
 * - If feed unavailable and REQUIRED=false, allow but annotate reason
 */
export async function enforcePolicy(amountLamports: bigint): Promise<PolicyDecision> {
  const solUsd = await getSolUsdPrice().catch(() => undefined);
  if (solUsd === undefined) {
    return REQUIRED
      ? { allow: false, reason: 'Switchboard feed unavailable and is required' }
      : { allow: true, reason: 'Switchboard feed unavailable (optional)', solUsd: undefined, usdAmount: undefined };
  }
  const sol = Number(amountLamports) / 1_000_000_000;
  const usdAmount = sol * solUsd;
  if (usdAmount > MAX_USD_PER_CALL) {
    return {
      allow: false,
      reason: `Price cap exceeded: $${usdAmount.toFixed(2)} > $${MAX_USD_PER_CALL.toFixed(2)}`,
      solUsd,
      usdAmount,
    };
  }
  return { allow: true, solUsd, usdAmount };
}
