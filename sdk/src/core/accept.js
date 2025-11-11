export function toNetworkTag(n) {
    const v = (n || '').toLowerCase();
    if (v === 'mainnet-beta' || v === 'mainnet')
        return 'solana';
    if (v === 'devnet' || v === 'testnet')
        return 'solana-devnet';
    return 'solana-devnet';
}
export function createAcceptSpec(input) {
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
