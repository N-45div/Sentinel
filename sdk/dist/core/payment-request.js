import crypto from 'crypto';
export function randomNonce(bytes = 12) {
    return crypto.randomBytes(bytes).toString('hex');
}
export function createPaymentPayload(input) {
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
export function attachSignature(payload, opts) {
    return {
        payload,
        signature: opts.signature,
        clientPublicKey: opts.clientPublicKey,
        ...(opts.signedTransaction ? { signedTransaction: opts.signedTransaction } : {}),
    };
}
export function serializePaymentRequest(pr) {
    return JSON.stringify(pr);
}
export function parsePaymentRequest(json) {
    return JSON.parse(json);
}
//# sourceMappingURL=payment-request.js.map