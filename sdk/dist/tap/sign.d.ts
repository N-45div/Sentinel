export type TapAlg = 'ed25519' | 'rsa-pss-sha256';
export type SignParams = {
    authority: string;
    path: string;
    keyId: string;
    alg: TapAlg;
    ttlSec?: number;
    tag?: string;
    nonce?: string;
    created?: number;
    expires?: number;
};
export declare function buildSignatureInput(p: SignParams): string;
export declare function buildSignatureBase(signatureInput: string, authority: string, path: string): string;
export declare function signEd25519(signatureBase: string, seed32Bytes: Uint8Array): string;
export declare function signRsaPssSha256(signatureBase: string, privateKeyPem: string): string;
export declare function sha256Hex(input: string): string;
export declare function signTap(p: SignParams, secret: {
    ed25519SeedB64?: string;
    rsaPrivateKeyPem?: string;
}): {
    signature_input: string;
    signature: string;
    commitment: string;
};
//# sourceMappingURL=sign.d.ts.map