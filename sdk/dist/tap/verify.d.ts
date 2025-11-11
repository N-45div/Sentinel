export type TapVerification = {
    ok: boolean;
    reason?: string;
    commitment?: string;
    keyId?: string;
    algorithm?: string;
};
export type KeyInfo = {
    key_id: string;
    public_key: string;
    algorithm: string;
    is_active?: string;
};
export type KeyResolver = (keyId: string) => Promise<KeyInfo | null>;
export type TapVerifyOptions = {
    required?: boolean;
    maxSkewSec?: number;
    nonceTtlMs?: number;
    resolveKey: KeyResolver;
};
export declare function verifyTap(headers: Record<string, string | string[] | undefined>, requestUrl: string, opts: TapVerifyOptions): Promise<TapVerification>;
//# sourceMappingURL=verify.d.ts.map