import crypto from "crypto";
import { SentinelClient } from "@x402/sentinel-sdk";

async function main() {
  const client = new SentinelClient(process.env.MCP_URL || "http://localhost:8787");
  const task = "scrape:https://example.com";
  const quote = await client.requestQuote(task, 100000);
  const jobId = `job_${Date.now()}`;
  await client.openStream(jobId, quote.capLamports);
  const content = "<html>example</html>";
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  await client.checkpoint(jobId, hash, Buffer.byteLength(content));
  await client.settle(jobId);
  console.log({ jobId, hash, settled: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
