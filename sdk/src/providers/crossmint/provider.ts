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

function toDecimalString(amountBaseUnits: string, decimals: number): string {
  if (decimals === 0) return amountBaseUnits;
  const s = amountBaseUnits.replace(/^0+/, '') || '0';
  const pad = decimals - (s.length - Math.max(s.length - decimals, 0));
  const whole = s.length > decimals ? s.slice(0, s.length - decimals) : '0';
  const frac = s.length > decimals ? s.slice(s.length - decimals) : '0'.repeat(decimals - s.length) + s;
  return `${parseInt(whole, 10)}.${frac}`.replace(/\.0+$/, '');
}

function mapNetworkToChain(network: NetworkTag): string {
  if (network.startsWith('solana')) return 'solana';
  return network; // pass-through for EVM chains like 'base', 'polygon', etc.
}

function isUsdcMint(mint: string): boolean {
  const m = mint.toLowerCase();
  // Solana mainnet USDC + devnet USDC
  return m === 'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'.toLowerCase() ||
         m === '4zmmc9srt5ri5x14gagxhahii3gnpaeerypjgzjdncdu'.toLowerCase();
}

export function createCrossmintProvider(cfg: CrossmintProviderConfig): CrossmintProvider {
  const signer = 'email' in cfg.identifier
    ? { type: 'email', email: (cfg.identifier as any).email }
    : { type: 'phone', phoneNumber: (cfg.identifier as any).phone };

  const chain = mapNetworkToChain(cfg.network);

  async function getWallets() {
    const mod: any = await import('@crossmint/wallets-sdk');
    const crossmint = mod.createCrossmint({ apiKey: cfg.apiKey as string, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) } as any);
    return mod.CrossmintWallets.from(crossmint);
  }

  return {
    async getOrCreateWallet(): Promise<WalletInfo> {
      const wallets = await getWallets();
      const w = await wallets.getOrCreateWallet({ chain, signer } as any);
      return { address: (w as any).address, network: cfg.network };
    },
    async balances(_address?: string): Promise<Balances> {
      const wallets = await getWallets();
      const w = await wallets.getOrCreateWallet({ chain, signer } as any);
      const b = await (w as any).balances();
      const sol = String(b?.nativeToken?.amount ?? '0');
      const tokens = [] as Balances['tokens'];
      if (b?.usdc) tokens.push({ mint: 'USDC', amount: String(b.usdc.amount), decimals: 6 });
      return { sol, tokens };
    },
    async signMessage(message: Uint8Array | string): Promise<string> {
      const wallets = await getWallets();
      const w = await wallets.getOrCreateWallet({ chain, signer } as any);
      // Prefer Uint8Array input; encode strings as UTF-8
      const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
      const fn: any = (w as any).signMessage || (w as any).sign?.message;
      if (!fn) throw new Error('Crossmint signMessage not supported on this wallet/chain');
      const res: any = await fn.call(w, bytes);
      return typeof res === 'string' ? res : (res?.signature || res?.signedMessage || '');
    },
    async signTransaction(txBase64: string): Promise<string> {
      const wallets = await getWallets();
      const w = await wallets.getOrCreateWallet({ chain, signer } as any);
      const fn: any = (w as any).signTransaction || (w as any).sign?.transaction;
      if (!fn) throw new Error('Crossmint signTransaction not supported on this wallet/chain');
      const res: any = await fn.call(w, txBase64);
      return typeof res === 'string' ? res : (res?.signedTxBase64 || res?.transaction || '');
    },
    async sendSOL(to: string, lamports: string, _fromAddress?: string): Promise<string> {
      const wallets = await getWallets();
      const w = await wallets.getOrCreateWallet({ chain, signer } as any);
      const amountSol = toDecimalString(lamports, 9);
      const tx = await (w as any).send(to, 'sol', amountSol);
      return String(tx?.explorerLink || '');
    },
    async sendSPL(to: string, mint: string, amount: string, decimals: number, _fromAddress?: string): Promise<string> {
      const wallets = await getWallets();
      const w = await wallets.getOrCreateWallet({ chain, signer } as any);
      const amountUi = toDecimalString(amount, decimals);
      // Fast-path for USDC
      if (isUsdcMint(mint)) {
        const tx = await (w as any).send(to, 'usdc', amountUi);
        return String(tx?.explorerLink || tx || '');
      }
      // Generic SPL attempts (CASH and other SPL mints)
      const candidates: Array<(...args: any[]) => Promise<any>> = [];
      if (typeof (w as any).sendSpl === 'function') candidates.push((w as any).sendSpl.bind(w));
      if (typeof (w as any).sendSPL === 'function') candidates.push((w as any).sendSPL.bind(w));
      // Fallback adapters for potential generic signatures
      const fallbacks: Array<() => Promise<any>> = [
        async () => (w as any).send?.(to, mint, amountUi),
        async () => (w as any).send?.(to, 'spl', { mint, amount: amountUi }),
        async () => (w as any).send?.(to, 'spl', amountUi, mint),
      ];
      for (const fn of candidates) {
        try {
          const tx = await fn(to, mint, amountUi);
          return String(tx?.explorerLink || tx || '');
        } catch {}
      }
      for (const fb of fallbacks) {
        try {
          const tx = await fb();
          if (tx) return String(tx?.explorerLink || tx || '');
        } catch {}
      }
      throw new Error('Crossmint generic SPL transfer not supported on this wallet/chain');
    },
  };
}
