import { NetworkTag } from '../../core/types.js';
import { Balances, CrossmintIdentifier, WalletInfo } from './types.js';
export interface CrossmintProviderConfig {
    apiKey?: string;
    baseUrl?: string;
    network: NetworkTag;
    identifier: CrossmintIdentifier;
}
export interface CrossmintProvider {
    getOrCreateWallet(): Promise<WalletInfo>;
    balances(address?: string): Promise<Balances>;
    signMessage(message: Uint8Array | string): Promise<string>;
    signTransaction(txBase64: string): Promise<string>;
    sendSOL(to: string, lamports: string, fromAddress?: string): Promise<string>;
    sendSPL(to: string, mint: string, amount: string, decimals: number, fromAddress?: string): Promise<string>;
}
export declare function createCrossmintProvider(cfg: CrossmintProviderConfig): CrossmintProvider;
//# sourceMappingURL=provider.d.ts.map