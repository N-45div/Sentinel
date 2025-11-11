import crypto from 'crypto';
import nacl from 'tweetnacl';
export function buildSignatureInput(p) {
    const created = Math.floor((p.created ?? Date.now()) / 1000);
    const expires = p.expires ?? created + Math.floor((p.ttlSec ?? 300));
    const nonce = p.nonce ?? crypto.randomBytes(12).toString('hex');
    const tag = p.tag ?? 'agent-auth';
    return `sig2=("@authority" "@path"); created=${created}; expires=${expires}; keyId="${p.keyId}"; alg="${p.alg}"; nonce="${nonce}"; tag="${tag}"`;
}
export function buildSignatureBase(signatureInput, authority, path) {
    const signatureParams = signatureInput.startsWith('sig2=') ? signatureInput.substring(5) : signatureInput;
    return [`"@authority": ${authority}`, `"@path": ${path}`, `"@signature-params": ${signatureParams}`].join('\n');
}
export function signEd25519(signatureBase, seed32Bytes) {
    const kp = nacl.sign.keyPair.fromSeed(seed32Bytes);
    const sig = nacl.sign.detached(Buffer.from(signatureBase, 'utf-8'), kp.secretKey);
    const b64 = Buffer.from(sig).toString('base64');
    return `sig2=:${b64}:`;
}
export function signRsaPssSha256(signatureBase, privateKeyPem) {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureBase, 'utf-8');
    const sig = signer.sign({ key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN });
    const b64 = Buffer.from(sig).toString('base64');
    return `sig2=:${b64}:`;
}
export function sha256Hex(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}
export function signTap(p, secret) {
    const signature_input = buildSignatureInput(p);
    const base = buildSignatureBase(signature_input, p.authority, p.path);
    let signature = '';
    if (p.alg === 'ed25519') {
        const seedB64 = secret.ed25519SeedB64 || '';
        const seed = Buffer.from(seedB64, 'base64');
        if (seed.length !== 32)
            throw new Error('ED25519 seed must be 32 bytes base64');
        signature = signEd25519(base, seed);
    }
    else if (p.alg === 'rsa-pss-sha256') {
        const pem = secret.rsaPrivateKeyPem || '';
        if (!pem)
            throw new Error('Missing RSA private key PEM');
        signature = signRsaPssSha256(base, pem.replace(/\n/g, '\n'));
    }
    else {
        throw new Error('Unsupported alg');
    }
    const commitment = sha256Hex(`${signature_input}|${signature}`);
    return { signature_input, signature, commitment };
}
