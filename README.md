# x402 Sentinel — Trustless Agent Infrastructure

**Solana x402 Hackathon Project** | **Track: Best Trustless Agent + Best MCP Server**

A complete trustless agent infrastructure combining on-chain reputation, economic security, and x402 payments. The only project providing the missing trust layer for autonomous agents in the x402 ecosystem.

## 🎯 What We Built

**Sentinel** provides trustless agent infrastructure that complements existing x402 payment systems:

- **Anchor Program**: On-chain agent registration, staking, reputation, validation, and disputes
- **xmcp MCP Server**: Trustless agent management tools (register, stake, query reputation, create jobs, validate work, resolve disputes)
- **Corbits MCP Proxy**: Payment-gated access to Sentinel tools via x402 protocol
- **Demo Agents**: Complete autonomous agents with Corbits payments and reputation tracking

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TRUSTLESS AGENT FLOW                     │
└─────────────────────────────────────────────────────────────┘

Agent → MCP Proxy (Corbits x402) → xmcp Server (Sentinel Tools) → Anchor Program
         ↓ Payment                   ↓ Trustless Ops              ↓ On-chain State
      USDC/SOL                    - Register Agent            - Agent Registry
                                  - Stake SOL                 - Reputation Scores
                                  - Query Reputation          - Job Management
                                  - Create Jobs               - Dispute Resolution
                                  - Validate Work
                                  - Resolve Disputes
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Rust & Anchor CLI
- Solana CLI configured for devnet

### Installation

```bash
# 1. Clone and install dependencies
git clone <repo>
cd solana-x402
npm install

# 2. Build Anchor program
anchor build

# 3. Deploy to devnet (optional - already deployed)
anchor deploy --provider.cluster devnet

# 4. Setup MCP servers
cd servers/mcp-x402-xmcp
npm install
npm run dev  # Starts on port 3000

# In another terminal
cd servers/mcp-x402-pay
npm install
cp .env.example .env
# Edit .env with your wallet path
npm run dev  # Starts on port 8402

# 5. Run demo agent
cd agents/scraper
npm install
# Create agent wallet and fund with devnet SOL
npm run demo
```

## 🧭 Runbook: End-to-End (Devnet)

Follow these steps to reproduce the working flow on devnet.

1) Environment
- Ensure Solana CLI is on devnet: `solana config set --url https://api.devnet.solana.com`
- Install Anchor CLI 0.31.x and Rust stable

2) Build + Deploy Anchor program
```
anchor build
# Publish IDL on-chain (first time init; afterwards use upgrade)
anchor idl init -f target/idl/sentinel.json AfGqhoRZqb1iBK7aL7bdBajA4t8M3cdBHzM93KKFPKm9 || \
anchor idl upgrade -f target/idl/sentinel.json AfGqhoRZqb1iBK7aL7bdBajA4t8M3cdBHzM93KKFPKm9
# Deploy/upgrade program code to devnet
anchor deploy --provider.cluster devnet
```

3) Run the real on-chain demo
```
node real-demo.js
# If it reports low balance, airdrop to the demo wallet it prints:
solana airdrop 2 <DEMO_WALLET_PUBKEY> --url devnet
```

4) Use the Sentinel CLI (added in repo root)
- The CLI uses on-chain IDL via `Program.at(...)`.
- Default wallet file: `./demo-agent-wallet.json` (override with `--keypair path`).

Examples:
```
# Show program/wallet/agent status
node sentinel-cli.js status

# Register current wallet as an agent (idempotent if already registered)
node sentinel-cli.js register \
  --name "Sentinel CLI Agent" \
  --description "On-chain agent via CLI" \
  --specialization web-scraping,data-validation \
  --version 1.0.0

# Stake 0.01 SOL
node sentinel-cli.js stake --sol 0.01

# Query reputation for your wallet (or any authority)
node sentinel-cli.js reputation
node sentinel-cli.js reputation --authority <PUBKEY>

# Create a job (buyer must be the CLI wallet unless you wire external signer)
node sentinel-cli.js create-job \
  --provider <PROVIDER_PUBKEY> \
  --task-type scraping \
  --task-description "crawl example.com" \
  --requirements urls,depth \
  --price-sol 0.05 \
  --challenge-window-slots 1000

# Validate work (provider signs; default provider is CLI wallet)
node sentinel-cli.js validate-work \
  --buyer <BUYER_PUBKEY> \
  --hash <32-byte-hex> \
  --bytes 10240 \
  --cost-sol 0.001

# Resolve dispute (challenger defaults to CLI wallet)
node sentinel-cli.js resolve-dispute \
  --buyer <BUYER_PUBKEY> \
  --provider <PROVIDER_PUBKEY> \
  --favor-challenger true \
  --slash-sol 0.005

# Settle a job (buyer must be CLI wallet unless externally signed)
node sentinel-cli.js settle --provider <PROVIDER_PUBKEY>
```

5) Start MCP servers (optional, for x402/NLA flows)
```
# xmcp server (Sentinel tools)
cd servers/mcp-x402-xmcp
npm install
npm run dev  # serves MCP over HTTP on port 3001 (per config)

# Corbits proxy (x402 payments)
cd ../mcp-x402-pay
npm install
cp .env.example .env   # set your payer wallet path and options
npm run dev  # starts on port 8402
```

6) Test MCP flows
```
# Proxy health
curl -s http://localhost:8402/health | jq

# Tool discovery via proxy (free)
node test-flow.js

# Complete flow (xmcp + proxy + Sentinel tools)
node test-complete-flow.js
```

### Funding (Devnet)
- Airdrop to the demo/CLI wallet when needed:
```
solana airdrop 2 <WALLET_PUBKEY> --url devnet
```

### Troubleshooting
- TypeError: reading `_bn` when constructing PublicKey → ensure `Program.at(PROGRAM_ID, provider)` is used or IDL includes `address`.
- IdlError "Type not found: ..." → use on-chain IDL via `Program.at(...)` or regenerate/publish the IDL.
- AnchorError AccountDidNotSerialize on register → increase account space (already applied) and redeploy.

## 📦 Project Structure

```
solana-x402/
├── programs/sentinel/          # Anchor program (trustless agent logic)
│   └── src/lib.rs             # Agent registration, staking, reputation, disputes
├── servers/
│   ├── mcp-x402-xmcp/         # xmcp MCP server (Sentinel tools)
│   │   └── src/tools/sentinel/ # MCP tools for agent management
│   └── mcp-x402-pay/          # Corbits MCP proxy (x402 payments)
│       └── src/index.ts       # Payment-gated MCP proxy
├── agents/
│   ├── scraper/               # Demo trustless agent
│   │   └── src/enhanced-agent.ts # Complete agent with Corbits + reputation
│   └── summarizer/            # Additional demo agent
├── sdk/                       # TypeScript SDK for Sentinel
└── xmcp/                      # xmcp framework (submodule)
```

## 🎮 Features

### Trustless Agent Infrastructure
- ✅ **Agent Registration**: On-chain identity with metadata
- ✅ **Economic Security**: SOL staking for skin-in-the-game
- ✅ **Reputation System**: Track performance and reliability
- ✅ **Job Management**: Create, execute, and validate jobs
- ✅ **Dispute Resolution**: Challenge mechanism with slashing
- ✅ **Optimistic Execution**: Fast execution with verification option

### x402 Integration
- ✅ **Corbits Payments**: Agents pay for APIs via x402
- ✅ **MCP Monetization**: Paywalled access to Sentinel tools
- ✅ **Discovery Bypass**: Free access to MCP discovery methods
- ✅ **Dual Monetization**: Agents earn from jobs AND monetize their own tools

### Developer Experience
- ✅ **xmcp Framework**: File-system routing, hot reloading, easy deployment
- ✅ **TypeScript SDK**: Type-safe client for all operations
- ✅ **Demo Agents**: Complete examples with full integration
- ✅ **Comprehensive Docs**: Setup guides and API documentation

## 🏆 Competitive Advantages

### Unique Value Proposition
**We're the only project solving trustless agent infrastructure:**

- **Corbits**: Payment handling only
- **Coinbase x402**: Protocol implementation only
- **ACK**: Identity and receipts only
- **Sentinel**: Complete trust infrastructure (staking, reputation, validation, disputes)

### Hackathon Differentiation
- **Best Trustless Agent**: Economic security + reputation + validation
- **Best MCP Server**: Paywalled Sentinel tools via Corbits integration
- **Best x402 Integration**: Seamless payment flows for autonomous agents
- **Complete Stack**: Registration → Reputation → Payments → Monetization

## 📚 Documentation

- [Anchor Program](./programs/sentinel/README.md) - On-chain logic
- [xmcp MCP Server](./servers/mcp-x402-xmcp/README.md) - Sentinel tools
- [Corbits Proxy](./servers/mcp-x402-pay/README.md) - Payment integration
- [Demo Agent](./agents/scraper/README.md) - Complete example

## 🧪 Testing

```bash
# Test Anchor program
anchor test

# Test MCP server
cd servers/mcp-x402-xmcp
npm test

# Run demo agent
cd agents/scraper
npm run demo
```

## 🌐 Deployment

**Devnet Deployment:**
- Program ID: `<deployed-program-id>`
- xmcp Server: `http://localhost:3000/mcp`
- Corbits Proxy: `http://localhost:8402/mcp`

## 🤝 Contributing

This is a hackathon project. For production use, additional security audits and testing are recommended.

## 📄 License

MIT

## 🙏 Acknowledgments

- Solana Foundation for the x402 Hackathon
- Corbits team for x402 payment infrastructure
- xmcp framework for MCP development tools
- Anchor framework for Solana program development

---

**Built for Solana x402 Hackathon 2025** | **Track: Best Trustless Agent + Best MCP Server**
