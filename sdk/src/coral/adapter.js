import { ensureCommitments } from '../mcp/wrappers.js';
export class CoralMcpClient {
    url;
    settleOnlyOn;
    fetchImpl;
    walletProvider;
    constructor(opts) {
        this.url = opts.connectionUrl;
        this.settleOnlyOn = opts.settleOnlyOn || ((name) => name === 'sentinel.settle');
        this.fetchImpl = (opts.fetchImpl || fetch);
        this.walletProvider = opts.walletProvider;
    }
    async callTool(name, args, callOpts) {
        const body = {
            jsonrpc: '2.0',
            id: callOpts?.id ?? Date.now(),
            method: 'tools/call',
            params: { name, arguments: args || {} },
        };
        // Inject commitments when provided
        const enriched = ensureCommitments({ ...body }, {
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
    getWalletProvider() {
        return this.walletProvider;
    }
}
export function createCoralClient(opts) {
    return new CoralMcpClient(opts);
}
