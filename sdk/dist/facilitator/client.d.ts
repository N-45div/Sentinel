import { AssetTag, HealthCheckResult, NetworkTag, PaymentRequestData, SettlementResult, VerificationResult } from '../core/types.js';
export interface VerifyOptions {
    network: NetworkTag;
    asset: AssetTag;
    payTo?: string;
    tokenMint?: string;
    decimals?: number;
}
export declare class FacilitatorClient {
    private baseUrl;
    private timeoutMs;
    constructor(baseUrl: string, timeoutMs?: number);
    private postJson;
    private getJson;
    verify(pr: PaymentRequestData, opts: VerifyOptions): Promise<VerificationResult>;
    settle(pr: PaymentRequestData, opts: VerifyOptions): Promise<SettlementResult>;
    health(): Promise<HealthCheckResult>;
}
//# sourceMappingURL=client.d.ts.map