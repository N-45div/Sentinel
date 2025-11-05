import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PROGRAM_ID, RPC_URL } from "../types/sentinel";

export const schema = {
  authority: z.string().describe("Agent authority public key (base58)"),
};

export const metadata: ToolMetadata = {
  name: "sentinel.query_reputation",
  description: "Query on-chain reputation/stats of an agent",
};

export default async function handler({ authority }: InferSchema<typeof schema>) {
  const connection = new Connection(RPC_URL);
  // Minimal wallet shim (no Wallet constructor to avoid ESM/CJS issues)
  const kp = Keypair.generate();
  const wallet = {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async (tx: any) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(kp)); return txs; },
  } as any;
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = await Program.at(PROGRAM_ID, provider);

  const authorityPk = new PublicKey(authority);
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), authorityPk.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );

  try {
    // @ts-ignore - account namespace generated from IDL at runtime
    const agent: any = await (program.account as any).agent.fetch(agentPda);
    const structured = {
      success: true,
      agentAddress: agentPda.toBase58(),
      authority: authorityPk.toBase58(),
      stakeLamports: Number(agent.stakeLamports ?? 0),
      reputationScore: Number(agent.reputationScore ?? 0),
      totalJobsCompleted: Number(agent.totalJobsCompleted ?? 0),
      totalJobsDisputed: Number(agent.totalJobsDisputed ?? 0),
      totalEarningsLamports: Number(agent.totalEarningsLamports ?? 0),
      metadata: agent.metadata ?? null,
    };
    const text = `Agent ${structured.authority}\nStake: ${structured.stakeLamports/1e9} SOL\nScore: ${structured.reputationScore}`;
    return {
      content: [{ type: "text", text }],
      structuredContent: structured,
    } as any;
  } catch (e: any) {
    return {
      content: [{ type: "text", text: e?.message ?? String(e) }],
      structuredContent: { success: false, error: e?.message ?? String(e) },
      isError: true,
    } as any;
  }
}
