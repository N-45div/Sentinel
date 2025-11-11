import crypto from 'crypto';

export interface Receipt {
  nonce: string;
  amount: string;
  recipient: string;
  resourceId: string;
  transactionSignature: string;
  timestamp: number;
}

export function hashReceipt(r: Receipt | unknown): string {
  const json = typeof r === 'string' ? r : JSON.stringify(r);
  return crypto.createHash('sha256').update(json).digest('hex');
}
