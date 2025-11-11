import { PaymentRequestData, PaymentRequestPayload } from './types.js';
export declare function randomNonce(bytes?: number): string;
export declare function createPaymentPayload(input: {
    amount: string;
    recipient: string;
    resourceId: string;
    resourceUrl: string;
    ttlMs?: number;
    nowMs?: number;
}): PaymentRequestPayload;
export declare function attachSignature(payload: PaymentRequestPayload, opts: {
    signature: string;
    clientPublicKey: string;
    signedTransaction?: string;
}): PaymentRequestData;
export declare function serializePaymentRequest(pr: PaymentRequestData): string;
export declare function parsePaymentRequest(json: string): PaymentRequestData;
//# sourceMappingURL=payment-request.d.ts.map