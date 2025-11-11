import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createTransferInstruction, getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

export async function buildTransferSolTx(
  _connection: Connection,
  from: PublicKey,
  to: PublicKey,
  lamports: bigint
): Promise<Transaction> {
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: Number(lamports),
    })
  );
  return tx;
}

export async function buildTransferSplTx(
  connection: Connection,
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  destOwner: PublicKey,
  amountBaseUnits: bigint,
  createAtaIfMissing: boolean = true
): Promise<Transaction> {
  const tx = new Transaction();

  const sourceAta = await getAssociatedTokenAddress(mint, owner);
  const destAta = await getAssociatedTokenAddress(mint, destOwner);

  if (createAtaIfMissing) {
    const destInfo = await connection.getAccountInfo(destAta);
    if (!destInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          payer, // payer pays rent
          destAta,
          destOwner,
          mint
        )
      );
    }
  }

  tx.add(
    createTransferInstruction(
      sourceAta,
      destAta,
      owner,
      Number(amountBaseUnits),
      [],
      TOKEN_PROGRAM_ID
    )
  );

  return tx;
}
