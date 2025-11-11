declare const fetch: any;
export type WalletProvider = {
    getOrCreateWallet: () => Promise<{
        address: string;
        network: string;
    }>;
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
export declare class CoralMcpClient {
    private url;
    private settleOnlyOn;
    private fetchImpl;
    private walletProvider?;
    constructor(opts: CoralAdapterOptions);
    callTool(name: string, args?: Record<string, unknown>, callOpts?: CallOptions): Promise<{
        status: any;
        data: any;
    }>;
    getWalletProvider(): WalletProvider | undefined;
}
export declare function createCoralClient(opts: CoralAdapterOptions): CoralMcpClient;
export {};
//# sourceMappingURL=adapter.d.ts.map