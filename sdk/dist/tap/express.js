import { signTap } from './sign.js';
export function registerTapRoutes(app, opts) {
    const base = opts.basePath || '/tap';
    app.get(`${base}/keys/:keyId`, (req, res) => {
        try {
            const { keyId } = req.params || {};
            if (!keyId || keyId !== opts.keyId) {
                res.status(404).json({ error: 'TAP key not found' });
                return;
            }
            const alg = String(opts.alg || '').toLowerCase();
            let public_key = '';
            if (alg === 'ed25519')
                public_key = opts.ed25519PublicKeyB64 || '';
            else if (alg === 'rsa-pss-sha256')
                public_key = (opts.rsaPublicKeyPem || '').replace(/\n/g, '\n');
            else {
                res.status(400).json({ error: 'Unsupported algorithm' });
                return;
            }
            res.json({ key_id: opts.keyId, is_active: 'true', public_key, algorithm: alg, description: 'SDK TAP key' });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'TAP key error' });
        }
    });
    app.post(`${base}/sign`, (req, res) => {
        try {
            const { url, authority: authBody, path: pathBody, keyId, alg, ttlSec = 300, tag = 'agent-auth', nonce } = req.body || {};
            const effectiveKeyId = keyId || opts.keyId;
            const algorithm = String(alg || opts.alg || '').toLowerCase();
            if (effectiveKeyId !== opts.keyId) {
                res.status(400).json({ error: 'Unknown keyId' });
                return;
            }
            if (algorithm !== 'ed25519' && algorithm !== 'rsa-pss-sha256') {
                res.status(400).json({ error: 'Unsupported algorithm' });
                return;
            }
            let authority = authBody;
            let path = pathBody;
            if (url && (!authority || !path)) {
                try {
                    const u = new URL(url);
                    authority = u.host;
                    path = u.pathname + (u.search || '');
                }
                catch { }
            }
            if (!authority || !path) {
                res.status(400).json({ error: 'Missing authority/path or url' });
                return;
            }
            const secret = algorithm === 'ed25519'
                ? { ed25519SeedB64: opts.ed25519PrivateSeedB64 }
                : { rsaPrivateKeyPem: opts.rsaPrivateKeyPem };
            const { signature_input, signature, commitment } = signTap({ authority, path, keyId: effectiveKeyId, alg: algorithm, ttlSec, tag, nonce }, secret);
            res.json({ signature_input, signature, authority, path, commitment });
        }
        catch (e) {
            res.status(500).json({ error: e?.message || 'TAP sign error' });
        }
    });
}
//# sourceMappingURL=express.js.map