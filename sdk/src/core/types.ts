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

export interface VerificationResult { isValid: boolean; error?: string }

export interface SettlementResult { status: 'settled' | 'error'; transactionSignature?: string; error?: string }

export interface HealthCheckResult {
  healthy: boolean;
  facilitator?: string;
  timestamp?: string;
  error?: string;
}

export const AcceptSpecSchema = z.object({
  scheme: z.literal('exact'),
  network: z.string(),
  asset: z.string(),
  payTo: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  tokenMint: z.string().optional(),
  decimals: z.number().int().nonnegative().optional(),
});

export type ReceiptCommitment = string;
