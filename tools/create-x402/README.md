# create-sentinelx

Scaffold a full x402 paid-agent starter project focused on Solana Devnet payments via PayAI, with TAP verification at the gateway and a research service.

## Usage

```bash
npx create-sentinelx@latest <app-name> [--onchain]
```

- `--onchain` adds optional on-chain tools for the XMCP app.

What you get:
- `xmcp/` – XMCP app with paid tools (HTTP /mcp)
- `gateway-express/` – PayAI Solana devnet gateway with paid `/research` and `/mcp/execute`, TAP optional
- `research-python-service/` – Research microservice using Parallel beta.search with automatic Task API fallback
- `tap-python-server/` – TAP signer (`/tap/keys/:keyId`, `/tap/sign`) for Visa-style RFC 9421 headers
- `client-fetch/` – Generic paid client with TAP support and flexible question/JSON body input
- `client-solana/` – Minimal Solana-devnet example client
- `client-inspect/` – Simple inspector client for debugging responses

## Next steps

1) XMCP app (tools server)
```bash
cd xmcp && npm i && npm run dev
# Note the printed HTTP tools URL for /mcp
```

2) Research service (Parallel beta.search + fallback)
```bash
cd ../research-python-service
pip install -r requirements.txt
cp .env.example .env
# set PARALLEL_API_KEY
# optionally set PARALLEL_BETAS=search-extract-2025-10-10 if entitled
# optionally set PARALLEL_BASE_URL (default https://api.parallel.ai)
uvicorn main:app --reload --port 4022
```

3) TAP Python server (optional for TAP signing)
```bash
cd ../tap-python-server
pip install -r requirements.txt
cp .env.example .env
# set ED25519_PRIVATE_KEY (base64 seed) and ED25519_PUBLIC_KEY
uvicorn main:app --reload --port 4001
```

4) Gateway (Solana devnet payments via PayAI + optional TAP verify)
```bash
cd ../gateway-express
npm i
cp .env.example .env
# FACILITATOR_URL=https://facilitator.payai.network
# NETWORK=solana-devnet
# ADDRESS=YOUR_SOL_ADDRESS_BASE58
# XMCP_URL=http://localhost:3001/mcp
# RESEARCH_URL=http://localhost:4022/research
# REQUIRE_TAP=true   # to enforce TAP
# TAP_DEBUG=true     # to see detailed verification logs
npm run dev   # http://localhost:4021
```

5) Clients

- client-fetch (generic paid client with TAP)
```bash
cd ../client-fetch
npm i
cp .env.example .env
# Set PRIVATE_KEY, RESOURCE_SERVER_URL=http://localhost:4021, ENDPOINT_PATH=/research
# Optional: USE_TAP=true, TAP_BASE_URL=http://localhost:4001, QUESTION or JSON_BODY
npm run dev -- "When was the United Nations established? Prefer UN's websites."
```

- client-solana (minimal Solana devnet example)
```bash
cd ../client-solana
npm i
cp .env.example .env
npm run dev
```

- client-inspect (simple inspector)
```bash
cd ../client-inspect
npm i
cp .env.example .env
npm run dev
```

## Notes
- The gateway uses x402-express for AcceptSpec and payment middleware against the PayAI facilitator.
- The research service calls Parallel /v1/beta/search with the parallel-beta header, and falls back to the Task API if beta access is unavailable.
- For TAP, set ED25519 keypair (base64 seed/public) in `tap-python-server/.env`. The gateway verifies signatures per RFC 9421 (Visa-style) and logs with x-tap-debug-id correlation when TAP_DEBUG=true.
- Requires Node 20+.
