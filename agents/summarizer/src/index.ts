import crypto from "crypto";
import { SentinelClient } from "@x402/sentinel-sdk";

function deterministicSummary(input: string, seed: string) {
  const base = crypto.createHash("sha256").update(seed + "|" + input).digest("hex");
  const sliceLen = Math.max(32, Math.min(160, Math.floor(input.length / 4)));
  const start = parseInt(base.slice(0, 8), 16) % Math.max(1, input.length - sliceLen);
  const snippet = input.slice(start, start + sliceLen);
  const summary = `S:${crypto.createHash("sha256").update(snippet).digest("hex").slice(0, 24)}`;
  return { summary, snippet };
}

async function main() {
  const client = new SentinelClient(process.env.MCP_URL || "http://localhost:8787");
  const jobId = `job_${Date.now()}`;
  const task = "summarize:deterministic";
  const quote = await client.requestQuote(task, 100000);
  await client.openStream(jobId, quote.capLamports);

  const input = process.env.INPUT || "Quick brown fox jumps over the lazy dog.";
  const seed = process.env.SEED || "sentinel-seed";
  const { summary } = deterministicSummary(input, seed);
  const hash = crypto.createHash("sha256").update(summary).digest("hex");
  await client.checkpoint(jobId, hash, Buffer.byteLength(summary));
  await client.settle(jobId);
  console.log({ jobId, hash, settled: true, summary });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
