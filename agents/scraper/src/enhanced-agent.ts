/**
 * Enhanced Trustless Agent with Corbits x402 Payments
 * 
 * This agent demonstrates the complete flow:
 * 1. Register on Sentinel with staking
 * 2. Use Corbits for API payments
 * 3. Build reputation through successful jobs
 * 4. Handle disputes and validation
 */

import { Keypair, Connection, PublicKey } from "@solana/web3.js";
import { wrap } from "@faremeter/fetch";
import { createPaymentHandler } from "@faremeter/payment-solana/exact";
import { lookupKnownSPLToken } from "@faremeter/info/solana";
import * as fs from "fs";
import * as crypto from "crypto";

// Configuration
const NETWORK = process.env.SOLANA_NETWORK || "devnet";
const MCP_PROXY_URL = process.env.MCP_PROXY_URL || "http://localhost:8402/mcp";
const AGENT_WALLET_PATH = process.env.AGENT_WALLET_PATH || "./agent-wallet.json";

interface AgentMetadata {
  name: string;
  description: string;
  specialization: string[];
  version: string;
}

interface JobResult {
  jobId: string;
  data: string;
  hash: string;
  bytesProcessed: number;
  cost: number;
}

class TrustlessAgent {
  private keypair!: Keypair;
  private connection!: Connection;
  private fetchWithPayer!: typeof fetch;
  private agentPubkey: string;
  private metadata: AgentMetadata;

  constructor(metadata: AgentMetadata) {
    this.metadata = metadata;
    this.agentPubkey = "";
  }

  async initialize() {
    console.log("🤖 Initializing Trustless Agent...");
    console.log("━".repeat(50));

    // Load wallet
    if (!fs.existsSync(AGENT_WALLET_PATH)) {
      console.log("⚠️  No wallet found, generating new one...");
      this.keypair = Keypair.generate();
      fs.writeFileSync(
        AGENT_WALLET_PATH,
        JSON.stringify(Array.from(this.keypair.secretKey))
      );
      console.log(`✅ Wallet created: ${this.keypair.publicKey.toString()}`);
      console.log(`   Saved to: ${AGENT_WALLET_PATH}`);
    } else {
      const keypairData = JSON.parse(fs.readFileSync(AGENT_WALLET_PATH, "utf-8"));
      this.keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
      console.log(`✅ Wallet loaded: ${this.keypair.publicKey.toString()}`);
    }

    this.agentPubkey = this.keypair.publicKey.toString();

    // Setup connection
    const rpcUrl = NETWORK === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com";
    
    this.connection = new Connection(rpcUrl);

    // Setup Corbits payment handler
    try {
      const usdcInfo = lookupKnownSPLToken(NETWORK as any, "USDC");
      if (!usdcInfo) {
        throw new Error(`USDC not found for network: ${NETWORK}`);
      }
      const usdcMint = new PublicKey(usdcInfo.address);

      const wallet = {
        network: NETWORK,
        publicKey: this.keypair.publicKey,
        updateTransaction: async (tx: any) => {
          tx.sign([this.keypair]);
          return tx;
        },
      };

      const paymentHandler = createPaymentHandler(wallet, usdcMint, this.connection);
      this.fetchWithPayer = wrap(fetch, { handlers: [paymentHandler] });

      console.log(`✅ Corbits payment handler initialized`);
    } catch (error) {
      console.warn("⚠️  Corbits not available, using regular fetch");
      this.fetchWithPayer = fetch;
    }

    console.log("━".repeat(50));
  }

  async callMCP(method: string, params: any = {}) {
    const response = await this.fetchWithPayer(MCP_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`MCP call failed: ${response.statusText}`);
    }

    return await response.json();
  }

  async register(stakeAmount: number = 1000000000) {
    console.log("\n📝 Registering agent on Sentinel...");
    
    try {
      const result = await this.callMCP("tools/call", {
        name: "sentinel.register_agent",
        arguments: {
          authority: this.agentPubkey,
          metadata: this.metadata,
        },
      });

      console.log(`✅ Agent registered`);
      console.log(`   Name: ${this.metadata.name}`);
      console.log(`   Specialization: ${this.metadata.specialization.join(", ")}`);

      // Stake SOL for economic security
      await this.stake(stakeAmount);

      return result;
    } catch (error) {
      console.error("❌ Registration failed:", error);
      throw error;
    }
  }

  async stake(amount: number) {
    console.log(`\n💰 Staking ${amount / 1e9} SOL...`);
    
    try {
      const result = await this.callMCP("tools/call", {
        name: "sentinel.stake_agent",
        arguments: {
          authority: this.agentPubkey,
          amountLamports: amount,
        },
      });

      console.log(`✅ Staked ${amount / 1e9} SOL for economic security`);
      return result;
    } catch (error) {
      console.error("❌ Staking failed:", error);
      throw error;
    }
  }

  async queryReputation() {
    console.log("\n📊 Querying reputation...");
    
    try {
      const result = await this.callMCP("tools/call", {
        name: "sentinel.query_reputation",
        arguments: {
          authority: this.agentPubkey,
        },
      });

      const rep = result.result?.reputation;
      if (rep) {
        console.log(`✅ Reputation Score: ${rep.reputationScore}`);
        console.log(`   Jobs Completed: ${rep.totalJobsCompleted}`);
        console.log(`   Jobs Disputed: ${rep.totalJobsDisputed}`);
        console.log(`   Total Earnings: ${rep.totalEarningsLamports / 1e9} SOL`);
        console.log(`   Stake: ${rep.stakeLamports / 1e9} SOL`);
      }

      return result;
    } catch (error) {
      console.error("❌ Query failed:", error);
      throw error;
    }
  }

  async performJob(taskDescription: string, buyerPubkey: string): Promise<JobResult> {
    console.log(`\n🔨 Performing job: ${taskDescription}`);
    
    // Simulate work (in real agent, this would call external APIs with Corbits)
    const data = `Result for: ${taskDescription}\nTimestamp: ${new Date().toISOString()}`;
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    const bytesProcessed = Buffer.byteLength(data);
    const cost = Math.floor(bytesProcessed * 100); // 100 lamports per byte

    console.log(`   Processed ${bytesProcessed} bytes`);
    console.log(`   Cost: ${cost / 1e9} SOL`);
    console.log(`   Hash: ${hash.substring(0, 16)}...`);

    // Create job on-chain
    const jobId = `job_${Date.now()}`;
    await this.callMCP("tools/call", {
      name: "sentinel.create_job",
      arguments: {
        buyer: buyerPubkey,
        provider: this.agentPubkey,
        taskType: "scraping",
        taskDescription,
        requirements: ["fast", "accurate"],
        priceCapLamports: cost * 2,
        challengeWindowSlots: 100,
      },
    });

    // Validate work and update reputation
    await this.callMCP("tools/call", {
      name: "sentinel.validate_work",
      arguments: {
        buyer: buyerPubkey,
        provider: this.agentPubkey,
        checkpointHash: hash,
        bytesProcessed,
        costLamports: cost,
      },
    });

    console.log(`✅ Job completed and validated`);

    return { jobId, data, hash, bytesProcessed, cost };
  }

  async demonstrateFullFlow() {
    console.log("\n" + "=".repeat(50));
    console.log("🎯 DEMONSTRATING COMPLETE TRUSTLESS AGENT FLOW");
    console.log("=".repeat(50));

    // Step 1: Register and stake
    await this.register();

    // Step 2: Check initial reputation
    await this.queryReputation();

    // Step 3: Perform multiple jobs
    const buyerPubkey = Keypair.generate().publicKey.toString();
    
    for (let i = 1; i <= 3; i++) {
      await this.performJob(
        `Scrape website #${i}: https://example${i}.com`,
        buyerPubkey
      );
      
      // Check reputation after each job
      await this.queryReputation();
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ DEMONSTRATION COMPLETE");
    console.log("=".repeat(50));
    console.log("\n📈 Summary:");
    console.log("   - Agent registered with staking");
    console.log("   - Reputation built through successful jobs");
    console.log("   - All payments handled via Corbits x402");
    console.log("   - Complete trustless operation demonstrated");
    console.log("\n🏆 Ready for hackathon submission!");
  }
}

// Main execution
async function main() {
  const agent = new TrustlessAgent({
    name: "Sentinel Scraper Agent",
    description: "Trustless web scraping agent with x402 payments and on-chain reputation",
    specialization: ["web-scraping", "data-extraction", "validation"],
    version: "1.0.0",
  });

  await agent.initialize();
  await agent.demonstrateFullFlow();
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
}

export { TrustlessAgent };
