function toDecimalString(amountBaseUnits, decimals) {
    if (decimals === 0)
        return amountBaseUnits;
    const s = amountBaseUnits.replace(/^0+/, '') || '0';
    const pad = decimals - (s.length - Math.max(s.length - decimals, 0));
    const whole = s.length > decimals ? s.slice(0, s.length - decimals) : '0';
    const frac = s.length > decimals ? s.slice(s.length - decimals) : '0'.repeat(decimals - s.length) + s;
    return `${parseInt(whole, 10)}.${frac}`.replace(/\.0+$/, '');
}
function mapNetworkToChain(network) {
    if (network.startsWith('solana'))
        return 'solana';
    return network; // pass-through for EVM chains like 'base', 'polygon', etc.
}
function isUsdcMint(mint) {
    const m = mint.toLowerCase();
    // Solana mainnet USDC + devnet USDC
    return m === 'epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v'.toLowerCase() ||
        m === '4zmmc9srt5ri5x14gagxhahii3gnpaeerypjgzjdncdu'.toLowerCase();
}
export function createCrossmintProvider(cfg) {
    const signer = 'email' in cfg.identifier
        ? { type: 'email', email: cfg.identifier.email }
        : { type: 'phone', phoneNumber: cfg.identifier.phone };
    const chain = mapNetworkToChain(cfg.network);
    async function getWallets() {
        const mod = await import('@crossmint/wallets-sdk');
        const crossmint = mod.createCrossmint({ apiKey: cfg.apiKey, ...(cfg.baseUrl ? { baseUrl: cfg.baseUrl } : {}) });
        return mod.CrossmintWallets.from(crossmint);
    }
    return {
        async getOrCreateWallet() {
            const wallets = await getWallets();
            const w = await wallets.getOrCreateWallet({ chain, signer });
            return { address: w.address, network: cfg.network };
        },
        async balances(_address) {
            const wallets = await getWallets();
            const w = await wallets.getOrCreateWallet({ chain, signer });
            const b = await w.balances();
            const sol = String(b?.nativeToken?.amount ?? '0');
            const tokens = [];
            if (b?.usdc)
                tokens.push({ mint: 'USDC', amount: String(b.usdc.amount), decimals: 6 });
            return { sol, tokens };
        },
        async signMessage(message) {
            const wallets = await getWallets();
            const w = await wallets.getOrCreateWallet({ chain, signer });
            // Prefer Uint8Array input; encode strings as UTF-8
            const bytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
            const fn = w.signMessage || w.sign?.message;
            if (!fn)
                throw new Error('Crossmint signMessage not supported on this wallet/chain');
            const res = await fn.call(w, bytes);
            return typeof res === 'string' ? res : (res?.signature || res?.signedMessage || '');
        },
        async signTransaction(txBase64) {
            const wallets = await getWallets();
            const w = await wallets.getOrCreateWallet({ chain, signer });
            const fn = w.signTransaction || w.sign?.transaction;
            if (!fn)
                throw new Error('Crossmint signTransaction not supported on this wallet/chain');
            const res = await fn.call(w, txBase64);
            return typeof res === 'string' ? res : (res?.signedTxBase64 || res?.transaction || '');
        },
        async sendSOL(to, lamports, _fromAddress) {
            const wallets = await getWallets();
            const w = await wallets.getOrCreateWallet({ chain, signer });
            const amountSol = toDecimalString(lamports, 9);
            const tx = await w.send(to, 'sol', amountSol);
            return String(tx?.explorerLink || '');
        },
        async sendSPL(to, mint, amount, decimals, _fromAddress) {
            const wallets = await getWallets();
            const w = await wallets.getOrCreateWallet({ chain, signer });
            const amountUi = toDecimalString(amount, decimals);
            // Fast-path for USDC
            if (isUsdcMint(mint)) {
                const tx = await w.send(to, 'usdc', amountUi);
                return String(tx?.explorerLink || tx || '');
            }
            // Generic SPL attempts (CASH and other SPL mints)
            const candidates = [];
            if (typeof w.sendSpl === 'function')
                candidates.push(w.sendSpl.bind(w));
            if (typeof w.sendSPL === 'function')
                candidates.push(w.sendSPL.bind(w));
            // Fallback adapters for potential generic signatures
            const fallbacks = [
                async () => w.send?.(to, mint, amountUi),
                async () => w.send?.(to, 'spl', { mint, amount: amountUi }),
                async () => w.send?.(to, 'spl', amountUi, mint),
            ];
            for (const fn of candidates) {
                try {
                    const tx = await fn(to, mint, amountUi);
                    return String(tx?.explorerLink || tx || '');
                }
                catch { }
            }
            for (const fb of fallbacks) {
                try {
                    const tx = await fb();
                    if (tx)
                        return String(tx?.explorerLink || tx || '');
                }
                catch { }
            }
            throw new Error('Crossmint generic SPL transfer not supported on this wallet/chain');
        },
    };
}
//# sourceMappingURL=provider.js.map