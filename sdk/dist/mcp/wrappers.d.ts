export type McpCallBody = {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params: {
        name: string;
        arguments?: Record<string, unknown>;
    };
};
export declare function ensureCommitments(body: McpCallBody, opts: {
    paymentCommitment?: string;
    tapCommitment?: string;
}): McpCallBody;
export declare function computeCommitmentFromReceipt(r: {
    nonce: string;
    amount: string;
    recipient: string;
    resourceId: string;
    transactionSignature?: string;
}): string;
//# sourceMappingURL=wrappers.d.ts.map