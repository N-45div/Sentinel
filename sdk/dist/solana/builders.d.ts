import { Connection, PublicKey, Transaction } from '@solana/web3.js';
export declare function buildTransferSolTx(_connection: Connection, from: PublicKey, to: PublicKey, lamports: bigint): Promise<Transaction>;
export declare function buildTransferSplTx(connection: Connection, payer: PublicKey, owner: PublicKey, mint: PublicKey, destOwner: PublicKey, amountBaseUnits: bigint, createAtaIfMissing?: boolean): Promise<Transaction>;
//# sourceMappingURL=builders.d.ts.map