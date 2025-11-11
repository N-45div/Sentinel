import { AcceptSpec, AssetTag, NetworkTag } from './types.js';

export function toNetworkTag(n?: string): NetworkTag {
  const v = (n || '').toLowerCase();
  if (v === 'mainnet-beta' || v === 'mainnet') return 'solana';
  if (v === 'devnet' || v === 'testnet') return 'solana-devnet';
  return 'solana-devnet';
}

export function createAcceptSpec(input: {
  network: string;
  asset: AssetTag;
  payTo: string;
  maxAmountRequired: string;
  resource: string;
  tokenMint?: string;
  decimals?: number;
}): AcceptSpec {
  return {
    scheme: 'exact',
    network: toNetworkTag(input.network),
    asset: input.asset,
    payTo: input.payTo,
    maxAmountRequired: input.maxAmountRequired,
    resource: input.resource,
    ...(input.tokenMint ? { tokenMint: input.tokenMint } : {}),
    ...(typeof input.decimals === 'number' ? { decimals: input.decimals } : {}),
  };
}
