import { AcceptSpec, AssetTag, NetworkTag } from './types.js';
export declare function toNetworkTag(n?: string): NetworkTag;
export declare function createAcceptSpec(input: {
    network: string;
    asset: AssetTag;
    payTo: string;
    maxAmountRequired: string;
    resource: string;
    tokenMint?: string;
    decimals?: number;
}): AcceptSpec;
//# sourceMappingURL=accept.d.ts.map