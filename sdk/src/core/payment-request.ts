import crypto from 'crypto';
import { PaymentRequestData, PaymentRequestPayload } from './types.js';

export function randomNonce(bytes: number = 12): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function createPaymentPayload(input: {
  amount: string;
  recipient: string;
  resourceId: string;
  resourceUrl: string;
  ttlMs?: number;
  nowMs?: number;
}): PaymentRequestPayload {
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const ttl = Math.floor((input.ttlMs ?? 5 * 60 * 1000) / 1000);
  return {
    amount: input.amount,
    recipient: input.recipient,
    resourceId: input.resourceId,
    resourceUrl: input.resourceUrl,
    nonce: randomNonce(12),
    timestamp: now,
    expiry: now + ttl,
  };
}

export function attachSignature(payload: PaymentRequestPayload, opts: {
  signature: string;
  clientPublicKey: string;
  signedTransaction?: string;
}): PaymentRequestData {
  return {
    payload,
    signature: opts.signature,
    clientPublicKey: opts.clientPublicKey,
    ...(opts.signedTransaction ? { signedTransaction: opts.signedTransaction } : {}),
  };
}

export function serializePaymentRequest(pr: PaymentRequestData): string {
  return JSON.stringify(pr);
}

export function parsePaymentRequest(json: string): PaymentRequestData {
  return JSON.parse(json) as PaymentRequestData;
}
