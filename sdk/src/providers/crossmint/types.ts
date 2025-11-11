import { NetworkTag } from '../../core/types.js';

export type CrossmintIdentifier = { email: string } | { phone: string };

export interface WalletInfo {
  address: string;
  network: NetworkTag;
}

export interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
}

export interface Balances {
  sol: string;
  tokens: TokenBalance[];
}
