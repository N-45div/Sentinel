import { promises as fs } from 'fs';
import path from 'path';
function pkgJson(options) {
    const base = {
        name: options.projectName || 'mcp-x402-app',
        version: '0.1.0',
        description: 'XMCP project scaffolded by @x402/sdk',
        engines: { node: '>=20.0.0' },
        type: 'module',
        scripts: {
            build: 'xmcp build',
            dev: 'xmcp dev',
            start: 'node dist/http.js'
        },
        dependencies: {
            xmcp: '^0.3.6',
            zod: '^3.24.4'
        }
    };
    if (options.includeOnchain) {
        base.dependencies['@solana/web3.js'] = '^1.98.4';
        base.dependencies['@coral-xyz/anchor'] = '^0.31.1';
    }
    return JSON.stringify(base, null, 2) + '\n';
}
const xmcpConfigTs = `import { type XmcpConfig } from "xmcp";

const config: XmcpConfig = {
  http: true,
  paths: {
    tools: "./src/tools",
    prompts: "./src/prompts",
    resources: "./src/resources",
  },
};

export default config;
`;
const toolCreateJob = `import { z } from "zod";
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
  } as const;
  const text = 'JobCreated ' + jobId + '\n'
    + 'paymentCommitment=' + String(paymentCommitment) + '\n'
    + 'tapCommitment=' + String(tapCommitment ?? '-') + '\n'
    + 'intentCommitment=' + String(intentCommitment ?? '-');
  return { content: [{ type: "text", text }], structuredContent: structured } as any;
}
`;
const toolCheckpoint = `import { z } from "zod";
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

function eventId() { return crypto.randomBytes(8).toString("hex"); }

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
    data: { paymentCommitment, tapCommitment: tapCommitment ?? null, note: note ?? null },
  } as const;
  const text = 'JobCheckpoint ' + jobId + '\n'
    + 'paymentCommitment=' + String(paymentCommitment) + '\n'
    + 'tapCommitment=' + String(tapCommitment ?? '-') + '\n'
    + 'note=' + String(note ?? '-');
  return { content: [{ type: "text", text }], structuredContent: structured } as any;
}
`;
const toolSettle = `import { z } from "zod";
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
  const structured = { success: true, event: "JobSettled", jobId, settledAt: now, note: note ?? null } as const;
  const text = 'JobSettled ' + jobId + '\n' + 'at=' + now + '\n' + 'note=' + String(note ?? '-');
  return { content: [{ type: "text", text }], structuredContent: structured } as any;
}
`;
const readmeMd = `# XMCP app (generated by @x402/sdk)\n\n- Scripts:\n  - dev: xmcp dev\n  - build: xmcp build\n  - start: node dist/http.js\n\n- Tools:\n  - sentinel.create_job\n  - sentinel.checkpoint\n  - sentinel.settle\n\nWire your x402 server MCP_URL to this HTTP service to use paid tools with commitments.\n`;
async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}
async function writeFileIfMissing(p, content) {
    try {
        await fs.access(p);
        return; // do not overwrite existing files
    }
    catch { }
    await fs.writeFile(p, content, 'utf-8');
}
export async function scaffoldXmcpProject(options) {
    const root = options.outDir;
    const srcTools = path.join(root, 'src', 'tools');
    const srcPrompts = path.join(root, 'src', 'prompts');
    const srcResources = path.join(root, 'src', 'resources');
    const srcTypes = path.join(root, 'src', 'types');
    await ensureDir(root);
    await ensureDir(srcTools);
    await ensureDir(srcPrompts);
    await ensureDir(srcResources);
    if (options.includeOnchain)
        await ensureDir(srcTypes);
    await writeFileIfMissing(path.join(root, 'package.json'), pkgJson(options));
    await writeFileIfMissing(path.join(root, 'xmcp.config.ts'), xmcpConfigTs);
    await writeFileIfMissing(path.join(srcTools, 'sentinel-create-job.ts'), toolCreateJob);
    await writeFileIfMissing(path.join(srcTools, 'sentinel-checkpoint.ts'), toolCheckpoint);
    await writeFileIfMissing(path.join(srcTools, 'sentinel-settle.ts'), toolSettle);
    await writeFileIfMissing(path.join(root, 'README.md'), readmeMd);
    if (options.includeOnchain) {
        const sentinelTypesTs = `export const PROGRAM_ID = process.env.SENTINEL_PROGRAM_ID || "11111111111111111111111111111111";\nexport const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";\n`;
        const toolRegister = `import { z } from "zod";\nimport type { InferSchema, ToolMetadata } from "xmcp";\nimport { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";\nimport { Program, AnchorProvider } from "@coral-xyz/anchor";\nimport { PROGRAM_ID, RPC_URL } from "../types/sentinel";\n\nexport const schema = {\n  name: z.string().describe("Agent name"),\n  description: z.string().describe("Agent description"),\n  specialization: z.array(z.string()).describe("Array of skills"),\n  version: z.string().describe("Agent version"),\n};\n\nexport const metadata: ToolMetadata = { name: "sentinel.register_agent", description: "Register an agent on-chain with metadata" };\n\nfunction loadWallet(): Keypair {\n  try {\n    const p = process.env.MCP_WALLET_PATH;\n    if (!p) return Keypair.generate();\n    const fs = require("fs");\n    const secret = JSON.parse(fs.readFileSync(p, "utf-8"));\n    return Keypair.fromSecretKey(Uint8Array.from(secret));\n  } catch { return Keypair.generate(); }\n}\n\nexport default async function handler({ name, description, specialization, version }: InferSchema<typeof schema>) {\n  try {\n    const connection = new Connection(RPC_URL);\n    const keypair = loadWallet();\n    const wallet = { publicKey: keypair.publicKey, payer: keypair, signTransaction: async (tx: any) => { tx.partialSign(keypair); return tx; }, signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(keypair)); return txs; } } as any;\n    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });\n    const program = await Program.at(PROGRAM_ID, provider);\n    const [agentPda] = PublicKey.findProgramAddressSync([Buffer.from("agent"), wallet.publicKey.toBuffer()], new PublicKey(PROGRAM_ID));\n    const metadataArg = { name, description, specialization, version };\n    // @ts-ignore IDL methods resolved at runtime\n    const tx = await program.methods.registerAgent(metadataArg).accounts({ agent: agentPda, authority: wallet.publicKey, systemProgram: SystemProgram.programId }).rpc();\n    const structured = { success: true as const, transaction: tx, agent: agentPda.toBase58(), explorer: 'https://explorer.solana.com/tx/' + tx + '?cluster=devnet' };\n    const text = 'Registered agent ' + structured.agent + '\nTx: ' + structured.explorer;\n    return { content: [{ type: "text/plain", text }], structuredContent: structured } as any;\n  } catch (e: any) {\n    return { content: [{ type: "text/plain", text: e?.message ?? String(e) }], structuredContent: { success: false, error: e?.message ?? String(e) }, isError: true } as any;\n  }\n}\n`;
        const toolQueryRep = `import { z } from "zod";\nimport type { ToolMetadata } from "xmcp";\nimport { Connection, PublicKey, Keypair } from "@solana/web3.js";\nimport { Program, AnchorProvider } from "@coral-xyz/anchor";\nimport { PROGRAM_ID, RPC_URL } from "../types/sentinel";\n\nexport const schema = { authority: z.string().describe("Agent authority public key (base58)") };\nexport const metadata: ToolMetadata = { name: "sentinel.query_reputation", description: "Query on-chain reputation/stats of an agent" };\nconst Args = z.object(schema);\n\nexport default async function handler(input: unknown) {\n  const { authority } = Args.parse(input);\n  const connection = new Connection(RPC_URL);\n  const kp = Keypair.generate();\n  const wallet = { publicKey: kp.publicKey, payer: kp, signTransaction: async (tx: any) => { tx.partialSign(kp); return tx; }, signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(kp)); return txs; } } as any;\n  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });\n  const program = await Program.at(PROGRAM_ID, provider);\n  const authorityPk = new PublicKey(authority);\n  const [agentPda] = PublicKey.findProgramAddressSync([Buffer.from("agent"), authorityPk.toBuffer()], new PublicKey(PROGRAM_ID));\n  try {\n    // @ts-ignore - account namespace generated from IDL at runtime\n    const agent: any = await (program.account as any).agent.fetch(agentPda);\n    const structured = { success: true as const, agentAddress: agentPda.toBase58(), authority: authorityPk.toBase58(), stakeLamports: Number(agent.stakeLamports ?? 0), reputationScore: Number(agent.reputationScore ?? 0), totalJobsCompleted: Number(agent.totalJobsCompleted ?? 0), totalJobsDisputed: Number(agent.totalJobsDisputed ?? 0), totalEarningsLamports: Number(agent.totalEarningsLamports ?? 0), metadata: agent.metadata ?? null };\n    const text = 'Agent ' + structured.authority + '\nStake: ' + (structured.stakeLamports/1e9) + ' SOL\nScore: ' + structured.reputationScore;\n    return { content: [{ type: "text/plain", text }], structuredContent: structured } as any;\n  } catch (e: any) {\n    return { content: [{ type: "text/plain", text: e?.message ?? String(e) }], structuredContent: { success: false, error: e?.message ?? String(e) }, isError: true } as any;\n  }\n}\n`;
        await writeFileIfMissing(path.join(srcTypes, 'sentinel.ts'), sentinelTypesTs);
        await writeFileIfMissing(path.join(srcTools, 'sentinel-register.ts'), toolRegister);
        await writeFileIfMissing(path.join(srcTools, 'sentinel-query-reputation.ts'), toolQueryRep);
    }
}
