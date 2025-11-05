import { z } from "zod";
import type { ToolMetadata } from "xmcp";

export const schema = {
  jobId: z.string().min(16).describe("Job ID to settle"),
  note: z.string().optional().describe("Optional note for settlement context"),
};

export const metadata: ToolMetadata = {
  name: "sentinel.settle",
  description: "Mark a Job as settled (v1 off-chain event only).",
};

const Args = z.object(schema);

export default async function handler(input: unknown) {
  const { jobId, note } = Args.parse(input);
  const now = new Date().toISOString();
  const structured = {
    success: true,
    event: "JobSettled",
    jobId,
    settledAt: now,
    note: note ?? null,
  };
  const text = `JobSettled ${jobId}\nat=${now}\nnote=${note ?? "-"}`;
  return { content: [{ type: "text", text }], structuredContent: structured } as any;
}
