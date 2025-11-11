export interface Receipt {
    nonce: string;
    amount: string;
    recipient: string;
    resourceId: string;
    transactionSignature: string;
    timestamp: number;
}
export declare function hashReceipt(r: Receipt | unknown): string;
//# sourceMappingURL=receipt.d.ts.map