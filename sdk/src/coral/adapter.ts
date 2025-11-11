import { ensureCommitments } from '../mcp/wrappers.js';

// Use global fetch from Node 18+; declare for TS without DOM lib
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const fetch: any;

export type WalletProvider = {
  getOrCreateWallet: () => Promise<{ address: string; network: string }>;
  balances?: (address?: string) => Promise<any>;
  signMessage?: (message: Uint8Array | string) => Promise<string>;
  signTransaction?: (txBase64: string) => Promise<string>;
  sendSOL?: (to: string, lamports: string, fromAddress?: string) => Promise<string>;
  sendSPL?: (to: string, mint: string, amount: string, decimals: number, fromAddress?: string) => Promise<string>;
};

export type CoralAdapterOptions = {
  connectionUrl: string;
  settleOnlyOn?: (toolName: string) => boolean;
  fetchImpl?: typeof fetch;
  walletProvider?: WalletProvider;
};

export type CallOptions = {
  paymentCommitment?: string;
  tapCommitment?: string;
  id?: string | number;
};

export class CoralMcpClient {
  private url: string;
  private settleOnlyOn: (toolName: string) => boolean;
  private fetchImpl: typeof fetch;
  private walletProvider?: WalletProvider;

  constructor(opts: CoralAdapterOptions) {
    this.url = opts.connectionUrl;
    this.settleOnlyOn = opts.settleOnlyOn || ((name: string) => name === 'sentinel.settle');
    this.fetchImpl = (opts.fetchImpl || fetch) as typeof fetch;
    this.walletProvider = opts.walletProvider;
  }

  async callTool(name: string, args?: Record<string, unknown>, callOpts?: CallOptions) {
    const body = {
      jsonrpc: '2.0' as const,
      id: callOpts?.id ?? Date.now(),
      method: 'tools/call',
      params: { name, arguments: args || {} },
    } as const;

    // Inject commitments when provided
    const enriched = ensureCommitments({ ...(body as any) }, {
      paymentCommitment: callOpts?.paymentCommitment,
      tapCommitment: callOpts?.tapCommitment,
    });

    const r = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(enriched),
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  }

  getWalletProvider(): WalletProvider | undefined {
    return this.walletProvider;
  }
}

export function createCoralClient(opts: CoralAdapterOptions) {
  return new CoralMcpClient(opts);
}
