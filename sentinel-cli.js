#!/usr/bin/env node
const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const { Program, AnchorProvider, BN, Wallet } = require("@coral-xyz/anchor");
const fs = require("fs");

const PROGRAM_ID = "AfGqhoRZqb1iBK7aL7bdBajA4t8M3cdBHzM93KKFPKm9";
const RPC_URL = "https://api.devnet.solana.com";

const colors = { reset: "\x1b[0m", bright: "\x1b[1m", green: "\x1b[32m", blue: "\x1b[34m", yellow: "\x1b[33m", cyan: "\x1b[36m", red: "\x1b[31m", magenta: "\x1b[35m" };

function linkTx(sig) { return `https://explorer.solana.com/tx/${sig}?cluster=devnet`; }
function linkAddr(addr) { return `https://explorer.solana.com/address/${addr}?cluster=devnet`; }
function log(e, t, m, c = colors.cyan) { console.log(`${c}${e} ${t}${colors.reset}`); if (m) console.log(`   ${m}`); }

function parseArgs(argv) {
  const args = {}; let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) { args[key] = true; i += 1; }
      else { args[key] = next; i += 2; }
    } else { (args._ ||= []).push(a); i += 1; }
  }
  return args;
}

function toLamports(args, nameSol, nameLamports, def = null) {
  if (args[nameLamports] !== undefined) return BigInt(args[nameLamports]);
  if (args[nameSol] !== undefined) return BigInt(Math.round(parseFloat(args[nameSol]) * 1e9));
  if (def !== null) return BigInt(def);
  throw new Error(`missing amount: provide --${nameLamports} or --${nameSol}`);
}

function csv(v) { if (!v) return []; if (Array.isArray(v)) return v; return String(v).split(",").map(s => s.trim()).filter(Boolean); }

function loadOrCreateWallet(path) {
  if (fs.existsSync(path)) {
    const data = JSON.parse(fs.readFileSync(path, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(data));
  } else {
    const kp = Keypair.generate();
    fs.writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
  }
}

async function buildContext(args) {
  const connection = new Connection(RPC_URL, "confirmed");
  const keypairPath = args.keypair || "./demo-agent-wallet.json";
  const keypair = loadOrCreateWallet(keypairPath);
  const wallet = new Wallet(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = await Program.at(PROGRAM_ID, provider);
  return { connection, keypair, wallet, provider, program };
}

function agentPda(authority) {
  return PublicKey.findProgramAddressSync([Buffer.from("agent"), authority.toBuffer()], new PublicKey(PROGRAM_ID))[0];
}

function jobPda(buyer, provider) {
  return PublicKey.findProgramAddressSync([Buffer.from("job"), buyer.toBuffer(), provider.toBuffer()], new PublicKey(PROGRAM_ID))[0];
}

async function cmdStatus(args) {
  console.clear();
  console.log(`\n${colors.bright}${"=".repeat(70)}${colors.reset}`);
  console.log(`${colors.bright}${colors.green}SENTINEL CLI - STATUS${colors.reset}`);
  console.log(`${colors.bright}${"=".repeat(70)}${colors.reset}\n`);
  const { connection, wallet } = await buildContext(args);
  const programPubkey = new PublicKey(PROGRAM_ID);
  const programInfo = await connection.getAccountInfo(programPubkey);
  if (programInfo) {
    log("✅", "Program", "Deployed on devnet", colors.green);
    console.log(`   ID: ${PROGRAM_ID}`);
    console.log(`   Executable: ${programInfo.executable ? "Yes" : "No"}`);
    console.log(`   Data Size: ${programInfo.data.length} bytes`);
    console.log(`   ${colors.bright}${colors.green}Explorer:${colors.reset} ${linkAddr(PROGRAM_ID)}`);
  }
  const bal = await connection.getBalance(wallet.publicKey);
  log("💰", "Wallet", `${bal / 1e9} SOL`, colors.green);
  console.log(`   Address: ${wallet.publicKey.toString()}`);
  console.log(`   ${colors.bright}${colors.green}Explorer:${colors.reset} ${linkAddr(wallet.publicKey.toString())}`);
  const pda = agentPda(wallet.publicKey);
  const acct = await connection.getAccountInfo(pda);
  if (acct) {
    log("✅", "Agent PDA", pda.toString(), colors.green);
  } else {
    log("⚠️", "Agent PDA", "Not registered yet", colors.yellow);
  }
}

async function cmdRegister(args) {
  const { program, wallet } = await buildContext(args);
  const metadata = {
    name: args.name || "Sentinel CLI Agent",
    description: args.description || "Agent registered via CLI",
    specialization: csv(args.specialization || args.spec),
    version: args.version || "1.0.0",
  };
  const pda = agentPda(wallet.publicKey);
  log("📝", "Register", `Agent ${wallet.publicKey.toString()}`);
  const sig = await program.methods
    .registerAgent(metadata)
    .accounts({ agent: pda, authority: wallet.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  log("✅", "Registered", linkTx(sig), colors.green);
  console.log(`   Agent PDA: ${pda.toString()}`);
}

async function cmdStake(args) {
  const { program, wallet } = await buildContext(args);
  const amount = toLamports(args, "sol", "lamports");
  const pda = agentPda(wallet.publicKey);
  log("💰", "Stake", `${Number(amount) / 1e9} SOL`);
  const sig = await program.methods
    .stakeAgent(new BN(amount.toString()))
    .accounts({ agent: pda, authority: wallet.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  log("✅", "Staked", linkTx(sig), colors.green);
}

async function cmdReputation(args) {
  const { program } = await buildContext(args);
  const authority = new PublicKey(args.authority || args.addr || args.a || (await buildContext(args)).wallet.publicKey);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("agent"), authority.toBuffer()], program.programId);
  try {
    const agent = await (program.account).agent.fetch(pda);
    log("📊", "Reputation", authority.toString());
    console.log(`   Stake: ${Number(agent.stakeLamports) / 1e9} SOL`);
    console.log(`   Score: ${agent.reputationScore}`);
    console.log(`   Jobs Completed: ${agent.totalJobsCompleted}`);
    console.log(`   Jobs Disputed: ${agent.totalJobsDisputed}`);
    console.log(`   Earnings: ${Number(agent.totalEarningsLamports) / 1e9} SOL`);
    console.log(`   Name: ${agent.metadata.name}`);
  } catch (e) {
    log("⚠️", "Reputation", e.message, colors.yellow);
  }
}

async function cmdCreateJob(args) {
  const { program, wallet } = await buildContext(args);
  const buyerPub = new PublicKey(args.buyer || wallet.publicKey);
  if (!buyerPub.equals(wallet.publicKey)) throw new Error("buyer must be the CLI wallet unless external signer is wired");
  const providerPub = new PublicKey(args.provider);
  const price = toLamports(args, "priceSol", "priceLamports");
  const challenge = BigInt(args.challengeWindowSlots || args.challenge || 1000);
  const meta = { taskType: args.taskType || "task", taskDescription: args.taskDescription || "desc", requirements: csv(args.requirements) };
  const job = jobPda(buyerPub, providerPub);
  const sig = await program.methods
    .createJob(meta, new BN(price.toString()), new BN(challenge.toString()))
    .accounts({ job, buyer: wallet.publicKey, provider: providerPub, systemProgram: SystemProgram.programId })
    .rpc();
  log("✅", "Job Created", linkTx(sig), colors.green);
  console.log(`   Job: ${job.toString()}`);
}

async function cmdValidateWork(args) {
  const { program, wallet } = await buildContext(args);
  const buyerPub = new PublicKey(args.buyer);
  const providerPub = new PublicKey(args.provider || wallet.publicKey);
  const job = jobPda(buyerPub, providerPub);
  const bytes = BigInt(args.bytesProcessed || args.bytes || 0);
  const cost = toLamports(args, "costSol", "costLamports", 0);
  const hashHex = String(args.hash || args.checkpointHash).replace(/^0x/, "");
  const hashBytes = new Uint8Array(Buffer.from(hashHex, "hex"));
  const sig = await program.methods
    .checkpoint(hashBytes, new BN(bytes.toString()), new BN(cost.toString()))
    .accounts({ job, provider: wallet.publicKey, providerAgent: agentPda(wallet.publicKey) })
    .rpc();
  log("✅", "Checkpoint", linkTx(sig), colors.green);
}

async function cmdResolveDispute(args) {
  const { program, wallet } = await buildContext(args);
  const buyerPub = new PublicKey(args.buyer);
  const providerPub = new PublicKey(args.provider);
  const challengerPub = new PublicKey(args.challenger || wallet.publicKey);
  const job = jobPda(buyerPub, providerPub);
  const favor = String(args.favorChallenger || args["favor-challenger"] || "true").toLowerCase() !== "false";
  const slash = toLamports(args, "slashSol", "slashLamports", 0);
  const sig = await program.methods
    .resolveDispute(favor, new BN(slash.toString()))
    .accounts({ job, challenger: wallet.publicKey, buyer: buyerPub, provider: providerPub, providerAgent: agentPda(providerPub) })
    .rpc();
  log("✅", "Resolved", linkTx(sig), colors.green);
}

async function cmdSettle(args) {
  const { program, wallet } = await buildContext(args);
  const buyerPub = new PublicKey(args.buyer || wallet.publicKey);
  if (!buyerPub.equals(wallet.publicKey)) throw new Error("buyer must be the CLI wallet unless external signer is wired");
  const providerPub = new PublicKey(args.provider);
  const job = jobPda(buyerPub, providerPub);
  const sig = await program.methods
    .settle()
    .accounts({ job, buyer: wallet.publicKey, provider: providerPub })
    .rpc();
  log("✅", "Settled", linkTx(sig), colors.green);
}

async function main() {
  const [,, cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  try {
    if (!cmd || ["help", "-h", "--help"].includes(cmd)) {
      console.log(`${colors.bright}Usage:${colors.reset} node sentinel-cli.js <command> [options]`);
      console.log("Commands:");
      console.log("  status");
      console.log("  register --name <n> --description <d> --specialization a,b --version 1.0.0 [--keypair path]");
      console.log("  stake --sol <amt>|--lamports <n> [--keypair path]");
      console.log("  reputation [--authority <pubkey>]");
      console.log("  create-job --provider <pubkey> [--buyer <pubkey>] --task-type <t> --task-description <d> --requirements a,b --price-sol <amt>|--price-lamports <n> --challenge-window-slots <n>");
      console.log("  validate-work --buyer <pubkey> [--provider <pubkey>] --hash <hex> --bytes <n> --cost-sol <amt>|--cost-lamports <n>");
      console.log("  resolve-dispute --buyer <pubkey> --provider <pubkey> [--challenger <pubkey>] [--favor-challenger <true|false>] --slash-sol <amt>|--slash-lamports <n>");
      console.log("  settle [--buyer <pubkey>] --provider <pubkey>");
      process.exit(0);
    }
    if (cmd === "status") return await cmdStatus(args);
    if (cmd === "register") return await cmdRegister(args);
    if (cmd === "stake") return await cmdStake(args);
    if (cmd === "reputation") return await cmdReputation(args);
    if (cmd === "create-job") return await cmdCreateJob(args);
    if (cmd === "validate-work") return await cmdValidateWork(args);
    if (cmd === "resolve-dispute") return await cmdResolveDispute(args);
    if (cmd === "settle") return await cmdSettle(args);
    throw new Error(`unknown command: ${cmd}`);
  } catch (e) {
    console.error(`\n${colors.red}❌ Error:${colors.reset}`, e.message || e);
    process.exit(1);
  }
}

main();
