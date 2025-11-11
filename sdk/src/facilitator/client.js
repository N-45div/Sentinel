export class FacilitatorClient {
    baseUrl;
    timeoutMs;
    constructor(baseUrl, timeoutMs = 30000) {
        this.baseUrl = baseUrl;
        this.timeoutMs = timeoutMs;
    }
    async postJson(path, body) {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const r = await fetch(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(to);
            const data = await r.json().catch(() => ({}));
            if (!r.ok)
                throw new Error((data && (data.error || data.message)) || `HTTP ${r.status}`);
            return data;
        }
        finally {
            clearTimeout(to);
        }
    }
    async getJson(path) {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const r = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal });
            clearTimeout(to);
            const data = await r.json().catch(() => ({}));
            if (!r.ok)
                throw new Error((data && (data.error || data.message)) || `HTTP ${r.status}`);
            return data;
        }
        finally {
            clearTimeout(to);
        }
    }
    async verify(pr, opts) {
        const payload = {
            paymentRequest: JSON.stringify(pr),
            network: opts.network,
            asset: opts.asset,
            ...(opts.payTo ? { payTo: opts.payTo } : {}),
            ...(opts.tokenMint ? { tokenMint: opts.tokenMint } : {}),
            ...(typeof opts.decimals === 'number' ? { decimals: opts.decimals } : {}),
        };
        try {
            const data = await this.postJson('/verify', payload);
            const ok = data?.isValid === true || data?.valid === true || data?.success === true;
            return ok ? { isValid: true } : { isValid: false, error: data?.error || 'Invalid payment' };
        }
        catch (e) {
            return { isValid: false, error: e?.message || 'Verify failed' };
        }
    }
    async settle(pr, opts) {
        const payload = {
            paymentRequest: JSON.stringify(pr),
            network: opts.network,
            asset: opts.asset,
            ...(opts.payTo ? { payTo: opts.payTo } : {}),
            ...(opts.tokenMint ? { tokenMint: opts.tokenMint } : {}),
            ...(typeof opts.decimals === 'number' ? { decimals: opts.decimals } : {}),
        };
        try {
            const raw = await this.postJson('/settle', payload);
            const txSig = raw?.transactionSignature || raw?.tx || raw?.signature || raw?.result?.tx || raw?.data?.transactionSignature || raw?.data?.tx || '';
            if (txSig)
                return { status: 'settled', transactionSignature: txSig };
            return { status: 'error', error: raw?.error || 'Settlement failed' };
        }
        catch (e) {
            return { status: 'error', error: e?.message || 'Settlement failed' };
        }
    }
    async health() {
        try {
            const data = await this.getJson('/health');
            return {
                healthy: true,
                facilitator: data?.data?.facilitator,
                timestamp: data?.data?.timestamp,
            };
        }
        catch {
            try {
                await this.getJson('/supported');
                return { healthy: true, facilitator: 'hosted-facilitator', timestamp: new Date().toISOString() };
            }
            catch (e) {
                return { healthy: false, error: e?.message || 'Health check failed' };
            }
        }
    }
}
