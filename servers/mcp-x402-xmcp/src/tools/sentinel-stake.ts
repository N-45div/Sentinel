import { z } from "zod";
import type { InferSchema, ToolMetadata } from "xmcp";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { PROGRAM_ID, RPC_URL } from "../types/sentinel";

export const schema = {
  amountLamports: z.number().int().positive().describe("Amount to stake in lamports"),
};

export const metadata: ToolMetadata = {
  name: "sentinel.stake_agent",
  description: "Stake SOL for the current wallet's agent PDA",
};

function loadWallet(): Keypair {
  try {
    const p = process.env.MCP_WALLET_PATH;
    if (!p) return Keypair.generate();
    const fs = require("fs");
    const secret = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch {
    return Keypair.generate();
  }
}

export default async function handler({ amountLamports }: InferSchema<typeof schema>) {
  try {
    const connection = new Connection(RPC_URL);
    const keypair = loadWallet();
    const wallet = {
      publicKey: keypair.publicKey,
      payer: keypair,
      signTransaction: async (tx: any) => { tx.partialSign(keypair); return tx; },
      signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.partialSign(keypair)); return txs; },
    } as any;
    const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const program = await Program.at(PROGRAM_ID, provider);

    const [agentPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), wallet.publicKey.toBuffer()],
      new PublicKey(PROGRAM_ID)
    );

    const tx = await program.methods
      // @ts-ignore generated at runtime
      .stakeAgent(new BN(amountLamports))
      .accounts({
        agent: agentPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    const structured = {
      success: true,
      transaction: tx,
      agent: agentPda.toBase58(),
      amountLamports,
      explorer: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
    };
    const text = `Staked ${amountLamports/1e9} SOL for agent ${structured.agent}\nTx: ${structured.explorer}`;
    return { content: [{ type: "text", text }], structuredContent: structured } as any;
  } catch (e: any) {
    return { content: [{ type: "text", text: e?.message ?? String(e) }], structuredContent: { success: false, error: e?.message ?? String(e) }, isError: true } as any;
  }
}
