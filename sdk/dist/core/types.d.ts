import { z } from 'zod';
export type NetworkTag = 'solana' | 'solana-devnet' | string;
export type AssetTag = 'SOL' | 'USDC' | 'SPL' | string;
export interface AcceptSpec {
    scheme: 'exact';
    network: NetworkTag;
    asset: AssetTag;
    payTo: string;
    maxAmountRequired: string;
    resource: string;
    tokenMint?: string;
    decimals?: number;
}
export interface PaymentRequestPayload {
    amount: string;
    recipient: string;
    resourceId: string;
    resourceUrl: string;
    nonce: string;
    timestamp: number;
    expiry: number;
}
export interface PaymentRequestData {
    payload: PaymentRequestPayload;
    signature: string;
    clientPublicKey: string;
    signedTransaction?: string;
}
export interface FacilitatorVerifyRequest {
    paymentRequest: string;
    network: NetworkTag;
    asset: AssetTag;
    payTo?: string;
    tokenMint?: string;
    decimals?: number;
}
export interface VerificationResult {
    isValid: boolean;
    error?: string;
}
export interface SettlementResult {
    status: 'settled' | 'error';
    transactionSignature?: string;
    error?: string;
}
export interface HealthCheckResult {
    healthy: boolean;
    facilitator?: string;
    timestamp?: string;
    error?: string;
}
export declare const AcceptSpecSchema: z.ZodObject<{
    scheme: z.ZodLiteral<"exact">;
    network: z.ZodString;
    asset: z.ZodString;
    payTo: z.ZodString;
    maxAmountRequired: z.ZodString;
    resource: z.ZodString;
    tokenMint: z.ZodOptional<z.ZodString>;
    decimals: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    scheme: "exact";
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string;
    resource: string;
    tokenMint?: string | undefined;
    decimals?: number | undefined;
}, {
    scheme: "exact";
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string;
    resource: string;
    tokenMint?: string | undefined;
    decimals?: number | undefined;
}>;
export type ReceiptCommitment = string;
//# sourceMappingURL=types.d.ts.map