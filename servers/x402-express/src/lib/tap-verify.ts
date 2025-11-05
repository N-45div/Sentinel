import type { Request } from 'express';
import crypto from 'crypto';

export type TapVerification = {
  ok: boolean;
  reason?: string;
  commitment?: string; // sha256 of (signature-input + '|' + signature)
  keyId?: string;
  algorithm?: string;
};

const TAP_REQUIRED = String(process.env.TAP_REQUIRED || 'false').toLowerCase() === 'true';
const TAP_REGISTRY_URL = process.env.TAP_REGISTRY_URL || 'http://localhost:9002';
const TAP_MAX_SKEW_SEC = Number(process.env.TAP_MAX_SKEW_SEC || '60');
const TAP_KEYS_JSON = process.env.TAP_KEYS_JSON || '';
const NONCE_TTL_MS = Number(process.env.TAP_NONCE_TTL_MS || String(60 * 60 * 1000));

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

const nonceCache = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [nonce, ts] of nonceCache.entries()) if (now - ts > NONCE_TTL_MS) nonceCache.delete(nonce);
}, 60_000);

type ParsedSigInput = {
  params: string[];
  nonce: string;
  created: number;
  expires: number;
  keyId: string;
  algorithm: string;
  tag?: string;
};

function parseRFC9421SignatureInput(signatureInput: string): ParsedSigInput | null {
  try {
    const signatureMatch = signatureInput.match(/sig2=\(([^)]+)\);\s*(.+)/);
    if (!signatureMatch) return null;
    const [, paramString, attributesString] = signatureMatch;
    const params = paramString.split(/\s+/).map((p) => p.replace(/["']/g, ''));
    const attributes: Record<string, string | number> = {};
    const attributeMatches = attributesString.matchAll(/(\w+)=("[^"]*"|\d+)/g);
    for (const match of attributeMatches) {
      const [, key, value] = match as unknown as [string, string, string];
      if (value.startsWith('"') && value.endsWith('"')) attributes[key] = value.slice(1, -1);
      else attributes[key] = parseInt(value, 10);
    }
    return {
      params,
      nonce: String(attributes.nonce || ''),
      created: Number(attributes.created || 0),
      expires: Number(attributes.expires || 0),
      keyId: String(attributes.keyId || ''),
      algorithm: String(attributes.alg || ''),
      tag: typeof attributes.tag === 'string' ? (attributes.tag as string) : undefined,
    };
  } catch {
    return null;
  }
}

function buildRFC9421SignatureString(params: string[], requestData: { authority?: string; path?: string; contentType?: string; host?: string }, signatureInputHeader: string) {
  const components: string[] = [];
  for (const param of params) {
    switch (param) {
      case '@authority':
        components.push(`"@authority": ${requestData.authority}`);
        break;
      case '@path':
        components.push(`"@path": ${requestData.path}`);
        break;
      case 'content-type':
        components.push(`"content-type": ${requestData.contentType || 'application/json'}`);
        break;
      case 'host':
        components.push(`"host": ${requestData.host || requestData.authority}`);
        break;
      default:
        if ((requestData as any)[param]) components.push(`"${param}": ${(requestData as any)[param]}`);
        break;
    }
  }
  let signatureParams = signatureInputHeader;
  if (signatureInputHeader.startsWith('sig2=')) signatureParams = signatureInputHeader.substring(5);
  components.push(`"@signature-params": ${signatureParams}`);
  return components.join('\n');
}

function getStaticKeyById(keyId: string): { public_key: string; algorithm: string; key_id: string; is_active?: string } | null {
  if (!TAP_KEYS_JSON) return null;
  try {
    const map = JSON.parse(TAP_KEYS_JSON) as Record<string, { public_key: string; algorithm: string; is_active?: string }>;
    const entry = map[keyId];
    if (!entry) return null;
    return { key_id: keyId, public_key: entry.public_key, algorithm: entry.algorithm, is_active: entry.is_active ?? 'true' };
  } catch {
    return null;
  }
}

async function fetchKeyById(keyId: string): Promise<{ public_key: string; algorithm: string; key_id: string; is_active?: string } | null> {
  try {
    const res = await fetch(`${TAP_REGISTRY_URL}/keys/${encodeURIComponent(keyId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data;
  } catch {
    return null;
  }
}

async function verifyRSAPSS(publicKeyPem: string, signatureBase64: string, signatureString: string): Promise<boolean> {
  try {
    const publicKey = crypto.createPublicKey({ key: publicKeyPem, format: 'pem', type: 'spki' });
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signatureString, 'utf-8');
    return verifier.verify(
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN },
      signatureBuffer
    );
  } catch {
    return false;
  }
}

async function verifyEd25519(publicKeyBase64: string, signatureBase64: string, signatureString: string): Promise<boolean> {
  try {
    const keyBuf = Buffer.from(publicKeyBase64, 'base64');
    if (keyBuf.length !== 32) return false;
    const derPrefix = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
    const derKey = Buffer.concat([derPrefix, keyBuf]);
    const publicKey = crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });
    const sigBuf = Buffer.from(signatureBase64, 'base64');
    if (sigBuf.length !== 64) return false;
    return crypto.verify(null, Buffer.from(signatureString, 'utf-8'), publicKey, sigBuf);
  } catch {
    return false;
  }
}

export async function verifyTapFromRequest(req: Request): Promise<TapVerification> {
  try {
    const signatureInput = (req.headers['signature-input'] as string) || '';
    const signature = (req.headers['signature'] as string) || '';
    if (!signatureInput || !signature) return TAP_REQUIRED ? { ok: false, reason: 'Missing TAP signature headers' } : { ok: true };

    const parsed = parseRFC9421SignatureInput(signatureInput);
    if (!parsed) return { ok: false, reason: 'Invalid signature-input format' };

    // timestamp checks
    const now = Math.floor(Date.now() / 1000);
    if (parsed.created > now + TAP_MAX_SKEW_SEC) return { ok: false, reason: 'Signature created time is in the future' };
    if (parsed.expires && parsed.expires < now) return { ok: false, reason: 'Signature expired' };

    // nonce replay check
    if (!parsed.nonce) return { ok: false, reason: 'Missing nonce' };
    if (nonceCache.has(parsed.nonce)) return { ok: false, reason: 'Replay detected' };
    nonceCache.set(parsed.nonce, Date.now());

    // build signature base string
    const requestData = {
      authority: req.get('host') || (req.headers.host as string),
      path: req.originalUrl || req.url,
      contentType: (req.get('content-type') as string) || 'application/json',
      host: req.get('host') || (req.headers.host as string),
    };
    const signatureBaseString = buildRFC9421SignatureString(parsed.params, requestData, signatureInput);

    // extract base64 signature content from header
    let sigB64 = signature;
    const m = signature.match(/sig2=:([^:]+):/);
    if (m) sigB64 = m[1];

    // fetch key and verify
    let keyInfo = getStaticKeyById(parsed.keyId);
    if (!keyInfo) keyInfo = await fetchKeyById(parsed.keyId);
    if (!keyInfo) return { ok: false, reason: 'Key not found' };
    if (keyInfo.is_active && keyInfo.is_active !== 'true') return { ok: false, reason: 'Key inactive' };

    const alg = String(parsed.algorithm || keyInfo.algorithm || '').toLowerCase();
    let valid = false;
    if (alg === 'rsa-pss-sha256') valid = await verifyRSAPSS(keyInfo.public_key, sigB64, signatureBaseString);
    else if (alg === 'ed25519') valid = await verifyEd25519(keyInfo.public_key, sigB64, signatureBaseString);
    else return { ok: false, reason: `Unsupported algorithm: ${alg}` };

    if (!valid) return { ok: false, reason: 'Signature verification failed' };

    // commitment
    const commitment = sha256Hex(`${signatureInput}|${signature}`);
    return { ok: true, commitment, keyId: parsed.keyId, algorithm: alg };
  } catch (e) {
    return TAP_REQUIRED ? { ok: false, reason: e instanceof Error ? e.message : 'TAP verification failed' } : { ok: true };
  }
}
