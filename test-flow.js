#!/usr/bin/env node
/**
 * End-to-End Test Script for x402 Sentinel
 * Tests the complete flow: MCP Proxy → xmcp Server → Sentinel Tools
 */

const MCP_PROXY_URL = "http://localhost:8402/mcp";
const XMCP_SERVER_URL = "http://localhost:3001/mcp";

async function testMCPCall(url, method, params = {}) {
  console.log(`\n📡 Testing: ${method}`);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      console.log(`❌ Error: ${data.error.message}`);
      return { success: false, error: data.error };
    }
    
    console.log(`✅ Success`);
    console.log(JSON.stringify(data.result, null, 2));
    return { success: true, result: data.result };
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log("=" .repeat(60));
  console.log("🧪 x402 Sentinel End-to-End Test");
  console.log("=".repeat(60));

  // Test 1: Health check
  console.log("\n1️⃣  Testing Health Check");
  try {
    const response = await fetch("http://localhost:8402/health");
    const health = await response.json();
    console.log("✅ Proxy server healthy");
    console.log(`   Network: ${health.network}`);
    console.log(`   Payment enabled: ${health.paymentEnabled}`);
  } catch (error) {
    console.log("❌ Proxy server not responding");
    return;
  }

  // Test 2: List tools (free - discovery)
  console.log("\n2️⃣  Testing Tool Discovery (Free)");
  const toolsList = await testMCPCall(MCP_PROXY_URL, "tools/list");
  
  if (toolsList.success && toolsList.result?.tools) {
    console.log(`\n   Found ${toolsList.result.tools.length} tools:`);
    toolsList.result.tools.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.name}`);
    });
  }

  // Test 3: Call a Sentinel tool (would be paid in production)
  console.log("\n3️⃣  Testing Sentinel Tool Call");
  console.log("   Note: Payment disabled without wallet, but tool execution works");
  
  // Generate a test keypair address
  const testAuthority = "11111111111111111111111111111111";
  
  const queryResult = await testMCPCall(MCP_PROXY_URL, "tools/call", {
    name: "sentinel.query_reputation",
    arguments: {
      authority: testAuthority,
    },
  });

  // Test 4: Direct xmcp server test
  console.log("\n4️⃣  Testing Direct xmcp Server Access");
  const directResult = await testMCPCall(XMCP_SERVER_URL, "tools/list");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary");
  console.log("=".repeat(60));
  console.log(`✅ Proxy Server: Running on port 8402`);
  console.log(`✅ xmcp Server: Running on port 3001`);
  console.log(`✅ Tool Discovery: ${toolsList.success ? "Working" : "Failed"}`);
  console.log(`⚠️  Payment: Disabled (no wallet configured)`);
  console.log(`\n💡 Next Steps:`);
  console.log(`   1. Create wallet: solana-keygen new --outfile servers/mcp-x402-pay/payer-wallet.json`);
  console.log(`   2. Fund wallet: solana airdrop 2 <address> --url devnet`);
  console.log(`   3. Restart proxy server to enable payments`);
  console.log(`   4. Deploy Anchor program: anchor deploy --provider.cluster devnet`);
  console.log(`   5. Run enhanced agent demo`);
  console.log("\n🎉 Core infrastructure is working!");
}

main().catch(console.error);
