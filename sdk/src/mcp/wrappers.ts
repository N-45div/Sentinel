import { hashReceipt } from '../core/receipt.js';

export type McpCallBody = {
  jsonrpc: '2.0';
  id: string | number;
  method: string; // 'tools/call'
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
};

export function ensureCommitments(body: McpCallBody, opts: { paymentCommitment?: string; tapCommitment?: string }) {
  if (body.method !== 'tools/call') return body;
  body.params.arguments = body.params.arguments || {};
  if (opts.paymentCommitment && !body.params.arguments.paymentCommitment) {
    body.params.arguments.paymentCommitment = opts.paymentCommitment;
  }
  if (opts.tapCommitment && !body.params.arguments.tapCommitment) {
    body.params.arguments.tapCommitment = opts.tapCommitment;
  }
  return body;
}

export function computeCommitmentFromReceipt(r: {
  nonce: string;
  amount: string;
  recipient: string;
  resourceId: string;
  transactionSignature?: string;
}): string {
  const receipt = {
    ...r,
    timestamp: Date.now(),
  };
  return hashReceipt(receipt);
}
