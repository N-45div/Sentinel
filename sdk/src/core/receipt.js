import crypto from 'crypto';
export function hashReceipt(r) {
    const json = typeof r === 'string' ? r : JSON.stringify(r);
    return crypto.createHash('sha256').update(json).digest('hex');
}
