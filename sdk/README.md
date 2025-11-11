# @divij_web3dev/sentinel-sdk

A TypeScript SDK for building x402-powered paid agent systems on Solana with XMCP tools, TAP signing/verification, Coral adapter, and Crossmint wallet integration.

## Features

- XMCP scaffolding with paid tools:
  - `sentinel.create_job`, `sentinel.checkpoint`, `sentinel.settle`
  - Optional on-chain tools: `sentinel.register_agent`, `sentinel.query_reputation`
- TAP (RFC 9421) signing and verification utilities
  - `signTap`, `verifyTap`, Express router via `registerTapRoutes`
- Coral adapter + helpers
  - `createCoralClient`, `buildCoralAgentToml`, env helpers
- Crossmint provider (peer dep): balances, transfers, wallet creation
- x402 MCP wrappers: commitment injection helpers
- PayAI facilitator client and 402 AcceptSpec helpers
  - `FacilitatorClient` for `/verify` and `/settle`
  - `createAcceptSpec` to generate the AcceptSpec used for pricing/payment
  - Solana SPL token support via `tokenMint` and `decimals`

## Install

```bash
npm i @divij_web3dev/sentinel-sdk
# Optional for Crossmint wallet integration in your app:
npm i @crossmint/wallets-sdk
```

Requires Node 20+.

## Quick start (PayAI facilitator + AcceptSpec)

```ts
import { FacilitatorClient, createAcceptSpec } from '@divij_web3dev/sentinel-sdk';

// Build a 402 AcceptSpec for a paid endpoint (Solana devnet)
const accept = createAcceptSpec({
  network: 'solana-devnet',
  asset: 'SOL',
  payTo: '<YOUR_SOL_ADDRESS_BASE58>',
  maxAmountRequired: '$0.002', // string price OK; server-side will resolve to lamports
  resource: 'POST /research',
  // Optional for SPL tokens:
  // tokenMint: '<SPL_MINT>',
  // decimals: 6,
});

const facilitator = new FacilitatorClient('https://facilitator.payai.network');

// Verify a payment request prior to serving a resource
const verifyRes = await facilitator.verify(accept, { network: 'solana-devnet', asset: accept.asset, payTo: accept.payTo });
if (!verifyRes.isValid) throw new Error('Payment verification failed: ' + (verifyRes.error || ''));

// Later, settle a payment (server-to-facilitator)
const settleRes = await facilitator.settle(accept, { network: 'solana-devnet', asset: accept.asset, payTo: accept.payTo });
if (settleRes.status !== 'settled') throw new Error('Settlement failed: ' + (settleRes.error || ''));
console.log('Tx:', settleRes.transactionSignature);
```

Notes:
- The AcceptSpec may include `tokenMint` and `decimals` to charge in SPL tokens.
- `createAcceptSpec` normalizes the network tag (e.g., `solana-devnet`).

## Quick start (scaffold an XMCP project programmatically)

```ts
import { scaffoldXmcpProject } from '@divij_web3dev/sentinel-sdk';

await scaffoldXmcpProject({
  outDir: './xmcp',
  projectName: 'x402-xmcp',
  includeOnchain: false,
});
// Then: cd xmcp && npm i && npm run dev
```

The generated XMCP app exposes the paid tools over HTTP when running in dev mode. Point your x402 server's `MCP_URL` at the printed tools endpoint.

## TAP Agent (Express)

```ts
import express from 'express';
import { registerTapRoutes } from '@divij_web3dev/sentinel-sdk';

const app = express();
registerTapRoutes(app, {
  basePath: '/tap',
  keyId: 'agent-ed25519',
  alg: 'ed25519',
  ed25519PublicKeyB64: process.env.ED25519_PUBLIC_KEY,
  ed25519PrivateSeedB64: process.env.ED25519_PRIVATE_KEY,
});
```

- GET `/tap/keys/:keyId` returns the public key
- POST `/tap/sign` returns signature headers for requests

## TAP sign/verify (standalone)

```ts
import { signTap, verifyTap } from '@divij_web3dev/sentinel-sdk';

const signingString = '"@authority": example.com\n"@path": /research\n"@signature-params": ("@authority" "@path"); created=..., expires=..., keyId="agent-ed25519"; alg="ed25519"';
const signatureB64 = await signTap({ alg: 'ed25519', ed25519PrivateSeedB64: process.env.ED25519_PRIVATE_KEY! }, signingString);

const ok = await verifyTap({ alg: 'ed25519', ed25519PublicKeyB64: process.env.ED25519_PUBLIC_KEY! }, signingString, signatureB64);
console.log('verified?', ok);
```

## Coral adapter

```ts
import { createCoralClient, buildCoralAgentToml } from '@divij_web3dev/sentinel-sdk';
const coral = createCoralClient({ connectionUrl: process.env.CORAL_CONNECTION_URL! });
```

Generate a TOML for Coral option system:

```ts
const toml = buildCoralAgentToml(
  { name: 'x402-paid-agent', version: '0.1.0', description: 'Paid tools via x402' },
  { OPENROUTER_API_KEY: { type: 'string', description: 'LLM API key' } }
);
```

## Crossmint provider

This SDK includes a provider that maps a Crossmint wallet to balances and transfers. Install the peer dep in your app:

```bash
npm i @crossmint/wallets-sdk
```

Currently supported:
- Create/fetch wallet (email or phone signers)
- Balances: native + USDC
- Send: SOL, USDC, and generic SPL by mint/decimals (e.g., CASH)
- Sign: `signMessage`, `signTransaction`

Example (CASH on Solana, 6 decimals):

```ts
import { createCrossmintProvider, CASH_MINT } from '@divij_web3dev/sentinel-sdk';

const crossmint = createCrossmintProvider({
  apiKey: process.env.CROSSMINT_API_KEY!,
  network: 'solana-devnet',
  identifier: { email: 'user@example.com' },
});

// Send 1 CASH (6 decimals)
await crossmint.sendSPL('<recipient>', CASH_MINT, '1000000', 6);
```

Notes:
- Generic SPL relies on wallet support (Crossmint methods like `sendSpl`/`sendSPL` or compatible fallbacks).
- If unsupported on a given chain/wallet, an explicit error is thrown.

Roadmap:
- Expand wallet coverage and normalization across chains

## MCP wrappers (commitments)

```ts
import { ensureCommitments } from '@divij_web3dev/sentinel-sdk';

const enriched = ensureCommitments(body, {
  paymentCommitment: '<hex>',
  tapCommitment: '<hex>',
});
```

## License

MIT
