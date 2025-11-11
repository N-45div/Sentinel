# Sentinel x402 Monorepo

End-to-end Solana Devnet payments with x402, TAP verification, and a scaffolder that generates a working stack:

- gateway-express: x402 payment gateway with TAP (Visa) verification (Solana devnet → PayAI Facilitator)
- research-python-service: FastAPI service using Parallel Beta Search with fallback to Task API
- client-solana: Minimal client using x402-fetch to pay and call the gateway
- Optional paid tools via gateway `/mcp/execute` (e.g., firecrawl.scrape)

## Repository layout

- sdk/
  - TypeScript SDK: AcceptSpec helpers, FacilitatorClient (PayAI), Solana SPL utilities, TAP sign/verify utilities
  - See sdk/README.md for API docs and examples
- tools/create-x402/
  - CLI scaffolder (create-sentinelx) that generates gateway + services + clients
- product-site/
  - Optional project site (not required to run the stack)

## Architecture

Build autonomous, verifiable agents on Solana that are monetized via x402 and verified with TAP (Visa, RFC 9421). The gateway enforces payment, verifies TAP signatures, and forwards to your services.

```mermaid
graph LR
  A[Client (Solana signer)]
  B[gateway-express]
  C[(PayAI Facilitator)]
  D[(Public Key Registry - TAP (Visa))]
  E[research-python-service]
  F[XMCP server (/mcp/execute)]
  G[(Parallel API)]
  H[(Task API)]
  
  A --> B
  B --> C
  B --> D
  B --> E
  B --> F
  E --> G
  E --> H
  B --> A
```

## Prerequisites

- Node.js 18+
- Python 3.10+
- Solana CLI configured for devnet (for funding your wallet)

## Quickstart (recommended)

1) Scaffold a new app
- npx create-sentinelx@latest my-app
- Choose the templates you need. Recommended:
  - gateway-express
  - research-python-service
  - client-solana

2) Configure env files (in the generated app)
- gateway-express/.env
  - FACILITATOR_URL=https://facilitator.payai.network
  - NETWORK=solana-devnet
  - ADDRESS=<YOUR_SOL_ADDRESS_BASE58>
  - RESEARCH_URL=http://localhost:4022/research
  - XMCP_URL=http://localhost:4023/mcp/execute           (optional; if you run an XMCP server)
  - REQUIRE_TAP=true                                     (enable TAP verification)
  - TAP_DEBUG=true                                       (print verification details)
  - TAP_KEYS_BASEURL=http://localhost:4001               (where public keys can be resolved)
- research-python-service/.env
  - PARALLEL_API_KEY=...
  - PARALLEL_BETAS=search/v1
  - PARALLEL_BASE_URL=                                   (optional; defaults per SDK)
  - PORT=4022
- client-solana/.env
  - RESOURCE_SERVER_URL=http://localhost:4021
  - ENDPOINT_PATH=/research                              (or /mcp/execute)
  - PRIVATE_KEY=...                                      (or SOLANA_PRIVATE_KEY_JSON=...)
  - JSON_BODY=                                           (optional; JSON-RPC payload for /mcp/execute)

3) Run the services
- research-python-service
  - Follow the generated README for Python setup
  - Start the API on PORT=4022
- gateway-express
  - npm install && npm run dev (defaults to :4021)
- client-solana
  - npm install
  - npm run dev "what is solana x402"

4) Paid tool via gateway (optional)
- Set XMCP_URL in gateway-express/.env
- From client-solana, set JSON_BODY to a JSON-RPC payload, for example:
```
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"firecrawl.scrape","arguments":{"url":"https://example.com","mode":"markdown"}}}
```
- Then run client-solana against ENDPOINT_PATH=/mcp/execute

## TAP (Visa) verification — gateway

- REQUIRE_TAP=true to enforce TAP
- TAP_DEBUG=true prints:
  - signature-input, signature
  - constructed signing string with @authority, @path, @signature-params
- TAP_KEYS_BASEURL is used to fetch public keys for verification

## How it works

- gateway-express uses x402 AcceptSpec to price endpoints and verifies payment against the PayAI Facilitator
- On success, the gateway forwards the request to your research service or XMCP server
- Responses include an x-payment-response header with receipt info
- research-python-service prefers Parallel Beta Search (/v1/beta/search + parallel-beta header), and falls back to Task API on errors

## SDK

- The sdk/ package exposes:
  - AcceptSpec helpers for x402
  - FacilitatorClient to verify/settle with PayAI
  - Solana SPL helpers (e.g., get ATA, mint decimals)
  - TAP sign/verify utilities
- See sdk/README.md for code examples and API notes

## Troubleshooting

- Parallel 422/404
  - Ensure PARALLEL_BETAS=search/v1 and the service hits /v1/beta/search
  - Make sure Authorization Bearer and parallel-beta header are sent (the template handles this)
- TAP invalid signature
  - Verify TAP_KEYS_BASEURL is correct and reachable
  - Enable TAP_DEBUG to inspect the constructed signing string
- Payment fails
  - Confirm FACILITATOR_URL and ADDRESS are set; ensure your devnet wallet has SOL
  - Check gateway logs for AcceptSpec and receipt details

## Funding your devnet wallet

```
solana airdrop 2 <YOUR_SOL_ADDRESS_BASE58> --url https://api.devnet.solana.com
```

## Contributing

PRs welcome. This repo is actively evolving alongside the scaffolder and SDK.

## License

MIT

