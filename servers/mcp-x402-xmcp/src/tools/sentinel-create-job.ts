import { z } from "zod";
import type { ToolMetadata } from "xmcp";
import crypto from "crypto";

export const schema = {
  paymentCommitment: z.string().min(32).describe("SHA-256 hex of canonical x402 receipt"),
  tapCommitment: z.string().min(32).optional().describe("SHA-256 hex of RFC9421 signature headers"),
  intentCommitment: z.string().min(32).optional().describe("SHA-256 hex of user intent + plan + vendor/toolchain"),
};

export const metadata: ToolMetadata = {
  name: "sentinel.create_job",
  description: "Create a Job record with commitments. v1 stores commitments off-chain (returned in response)",
};

function jobIdFrom(paymentCommitment: string) {
  const h = crypto.createHash("sha256").update(paymentCommitment).digest("hex");
  return h.slice(0, 32);
}

const Args = z.object(schema);

export default async function handler(input: unknown) {
  const { paymentCommitment, tapCommitment, intentCommitment } = Args.parse(input);
  const jobId = jobIdFrom(paymentCommitment);
  const now = new Date().toISOString();
  const structured = {
    success: true,
    event: "JobCreated",
    jobId,
    createdAt: now,
    commitments: {
      paymentCommitment,
      tapCommitment: tapCommitment ?? null,
      intentCommitment: intentCommitment ?? null,
    },
    notes: "v1 demo returns commitments without on-chain write; explorer link omitted",
  };
  const text = `JobCreated ${jobId}\npaymentCommitment=${paymentCommitment}\ntapCommitment=${tapCommitment ?? "-"}\nintentCommitment=${intentCommitment ?? "-"}`;
  return { content: [{ type: "text", text }], structuredContent: structured } as any;
}
