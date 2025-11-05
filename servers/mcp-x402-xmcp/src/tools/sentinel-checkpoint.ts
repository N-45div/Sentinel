import { z } from "zod";
import type { ToolMetadata } from "xmcp";
import crypto from "crypto";

export const schema: Record<string, z.ZodTypeAny> = {
  jobId: z.string().min(16).describe("Job ID returned by sentinel.create_job"),
  paymentCommitment: z.string().min(32).describe("SHA-256 hex of canonical x402 receipt"),
  tapCommitment: z.string().min(32).optional().describe("SHA-256 hex of RFC9421 signature headers"),
  note: z.string().optional().describe("Human-readable checkpoint note"),
};

export const metadata: ToolMetadata = {
  name: "sentinel.checkpoint",
  description: "Record a checkpoint for an existing Job (v1 off-chain event).",
};

function eventId() {
  return crypto.randomBytes(8).toString("hex");
}

const Args = z.object(schema);

export default async function handler(input: unknown) {
  const { jobId, paymentCommitment, tapCommitment, note } = Args.parse(input);
  const now = new Date().toISOString();
  const structured = {
    success: true,
    event: "JobCheckpoint",
    jobId,
    eventId: eventId(),
    at: now,
    data: {
      paymentCommitment,
      tapCommitment: tapCommitment ?? null,
      note: note ?? null,
    },
  };
  const text = `JobCheckpoint ${jobId}\npaymentCommitment=${paymentCommitment}\ntapCommitment=${tapCommitment ?? "-"}\nnote=${note ?? "-"}`;
  return { content: [{ type: "text", text }], structuredContent: structured } as any;
}
