import crypto from 'crypto';
import nacl from 'tweetnacl';
const nonceCache = new Map();
let cleanerStarted = false;
function ensureCleaner(ttlMs) {
    if (cleanerStarted)
        return;
    cleanerStarted = true;
    const t = setInterval(() => {
        const now = Date.now();
        for (const [n, ts] of nonceCache.entries())
            if (now - ts > ttlMs)
                nonceCache.delete(n);
    }, 60_000);
    t?.unref?.();
}
function sha256Hex(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}
function parseSignatureInput(signatureInput) {
    try {
        const m = signatureInput.match(/sig2=\(([^)]+)\);\s*(.+)/);
        if (!m)
            return null;
        const [, paramString, attributesString] = m;
        const params = paramString.split(/\s+/).map((p) => p.replace(/["']/g, ''));
        const attributes = {};
        const attrMatches = attributesString.matchAll(/(\w+)=("[^"]*"|\d+)/g);
        for (const match of attrMatches) {
            const [, key, value] = match;
            if (value.startsWith('"') && value.endsWith('"'))
                attributes[key] = value.slice(1, -1);
            else
                attributes[key] = parseInt(value, 10);
        }
        return {
            params,
            nonce: String(attributes.nonce || ''),
            created: Number(attributes.created || 0),
            expires: Number(attributes.expires || 0),
            keyId: String(attributes.keyId || ''),
            algorithm: String(attributes.alg || ''),
            tag: typeof attributes.tag === 'string' ? attributes.tag : undefined,
        };
    }
    catch {
        return null;
    }
}
function buildSignatureBase(params, requestData, signatureInputHeader) {
    const components = [];
    for (const p of params) {
        if (p === '@authority')
            components.push(`"@authority": ${requestData.authority}`);
        else if (p === '@path')
            components.push(`"@path": ${requestData.path}`);
    }
    const signatureParams = signatureInputHeader.startsWith('sig2=') ? signatureInputHeader.substring(5) : signatureInputHeader;
    components.push(`"@signature-params": ${signatureParams}`);
    return components.join('\n');
}
async function verifyEd25519(publicKeyBase64, signatureBase64, signatureString) {
    try {
        const keyBuf = Buffer.from(publicKeyBase64, 'base64');
        if (keyBuf.length !== 32)
            return false;
        const sigBuf = Buffer.from(signatureBase64, 'base64');
        if (sigBuf.length !== 64)
            return false;
        const msg = Buffer.from(signatureString, 'utf-8');
        return nacl.sign.detached.verify(msg, sigBuf, keyBuf);
    }
    catch {
        return false;
    }
}
async function verifyRsaPss(publicKeyPem, signatureBase64, signatureString) {
    try {
        const publicKey = crypto.createPublicKey({ key: publicKeyPem, format: 'pem', type: 'spki' });
        const sig = Buffer.from(signatureBase64, 'base64');
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signatureString, 'utf-8');
        return verifier.verify({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN }, sig);
    }
    catch {
        return false;
    }
}
export async function verifyTap(headers, requestUrl, opts) {
    const required = !!opts.required;
    const maxSkewSec = opts.maxSkewSec ?? 60;
    const nonceTtlMs = opts.nonceTtlMs ?? 60 * 60 * 1000;
    ensureCleaner(nonceTtlMs);
    const sInput = headers['signature-input'] || '';
    const signatureHeader = headers['signature'] || '';
    if (!sInput || !signatureHeader)
        return required ? { ok: false, reason: 'Missing TAP signature headers' } : { ok: true };
    const parsed = parseSignatureInput(sInput);
    if (!parsed)
        return { ok: false, reason: 'Invalid signature-input format' };
    const now = Math.floor(Date.now() / 1000);
    if (parsed.created > now + maxSkewSec)
        return { ok: false, reason: 'Signature created time is in the future' };
    if (parsed.expires && parsed.expires < now)
        return { ok: false, reason: 'Signature expired' };
    if (!parsed.nonce)
        return { ok: false, reason: 'Missing nonce' };
    if (nonceCache.has(parsed.nonce))
        return { ok: false, reason: 'Replay detected' };
    nonceCache.set(parsed.nonce, Date.now());
    let authority = '';
    let path = '';
    try {
        const u = new URL(requestUrl);
        authority = u.host;
        path = u.pathname + (u.search || '');
    }
    catch {
        return { ok: false, reason: 'Invalid request URL' };
    }
    const signatureBaseString = buildSignatureBase(parsed.params, { authority, path }, sInput);
    let sigB64 = signatureHeader;
    const m = signatureHeader.match(/sig2=:([^:]+):/);
    if (m)
        sigB64 = m[1];
    const keyInfo = await opts.resolveKey(parsed.keyId);
    if (!keyInfo)
        return { ok: false, reason: 'Key not found' };
    if (keyInfo.is_active && keyInfo.is_active !== 'true')
        return { ok: false, reason: 'Key inactive' };
    const alg = String(parsed.algorithm || keyInfo.algorithm || '').toLowerCase();
    let valid = false;
    if (alg === 'rsa-pss-sha256')
        valid = await verifyRsaPss(keyInfo.public_key, sigB64, signatureBaseString);
    else if (alg === 'ed25519')
        valid = await verifyEd25519(keyInfo.public_key, sigB64, signatureBaseString);
    else
        return { ok: false, reason: `Unsupported algorithm: ${alg}` };
    if (!valid)
        return { ok: false, reason: 'Signature verification failed' };
    const commitment = sha256Hex(`${sInput}|${signatureHeader}`);
    return { ok: true, commitment, keyId: parsed.keyId, algorithm: alg };
}
