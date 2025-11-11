import { hashReceipt } from '../core/receipt.js';
export function ensureCommitments(body, opts) {
    if (body.method !== 'tools/call')
        return body;
    body.params.arguments = body.params.arguments || {};
    if (opts.paymentCommitment && !body.params.arguments.paymentCommitment) {
        body.params.arguments.paymentCommitment = opts.paymentCommitment;
    }
    if (opts.tapCommitment && !body.params.arguments.tapCommitment) {
        body.params.arguments.tapCommitment = opts.tapCommitment;
    }
    return body;
}
export function computeCommitmentFromReceipt(r) {
    const receipt = {
        ...r,
        timestamp: Date.now(),
    };
    return hashReceipt(receipt);
}
//# sourceMappingURL=wrappers.js.map