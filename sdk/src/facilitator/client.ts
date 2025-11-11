import { AssetTag, FacilitatorVerifyRequest, HealthCheckResult, NetworkTag, PaymentRequestData, SettlementResult, VerificationResult } from '../core/types.js';
declare const fetch: any;

export interface VerifyOptions {
  network: NetworkTag;
  asset: AssetTag;
  payTo?: string;
  tokenMint?: string;
  decimals?: number;
}

export class FacilitatorClient {
  constructor(private baseUrl: string, private timeoutMs: number = 30000) {}

  private async postJson<T>(path: string, body: any): Promise<T> {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      } as any);
      clearTimeout(to);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${r.status}`);
      return data as T;
    } finally {
      clearTimeout(to);
    }
  }

  private async getJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const r = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal } as any);
      clearTimeout(to);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${r.status}`);
      return data as T;
    } finally {
      clearTimeout(to);
    }
  }

  async verify(pr: PaymentRequestData, opts: VerifyOptions): Promise<VerificationResult> {
    const payload: FacilitatorVerifyRequest = {
      paymentRequest: JSON.stringify(pr),
      network: opts.network,
      asset: opts.asset,
      ...(opts.payTo ? { payTo: opts.payTo } : {}),
      ...(opts.tokenMint ? { tokenMint: opts.tokenMint } : {}),
      ...(typeof opts.decimals === 'number' ? { decimals: opts.decimals } : {}),
    };

    try {
      const data = await this.postJson<any>('/verify', payload);
      const ok = data?.isValid === true || data?.valid === true || data?.success === true;
      return ok ? { isValid: true } : { isValid: false, error: data?.error || 'Invalid payment' };
    } catch (e: any) {
      return { isValid: false, error: e?.message || 'Verify failed' };
    }
  }

  async settle(pr: PaymentRequestData, opts: VerifyOptions): Promise<SettlementResult> {
    const payload: FacilitatorVerifyRequest = {
      paymentRequest: JSON.stringify(pr),
      network: opts.network,
      asset: opts.asset,
      ...(opts.payTo ? { payTo: opts.payTo } : {}),
      ...(opts.tokenMint ? { tokenMint: opts.tokenMint } : {}),
      ...(typeof opts.decimals === 'number' ? { decimals: opts.decimals } : {}),
    };

    try {
      const raw = await this.postJson<any>('/settle', payload);
      const txSig = raw?.transactionSignature || raw?.tx || raw?.signature || raw?.result?.tx || raw?.data?.transactionSignature || raw?.data?.tx || '';
      if (txSig) return { status: 'settled', transactionSignature: txSig };
      return { status: 'error', error: raw?.error || 'Settlement failed' };
    } catch (e: any) {
      return { status: 'error', error: e?.message || 'Settlement failed' };
    }
  }

  async health(): Promise<HealthCheckResult> {
    try {
      const data: any = await this.getJson<any>('/health');
      return {
        healthy: true,
        facilitator: data?.data?.facilitator,
        timestamp: data?.data?.timestamp,
      };
    } catch {
      try {
        await this.getJson<any>('/supported');
        return { healthy: true, facilitator: 'hosted-facilitator', timestamp: new Date().toISOString() };
      } catch (e: any) {
        return { healthy: false, error: e?.message || 'Health check failed' };
      }
    }
  }
}
