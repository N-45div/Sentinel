import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
export async function fetchMintDecimals(connection, mintAddress) {
    const mintPk = new PublicKey(mintAddress);
    const info = await connection.getParsedAccountInfo(mintPk);
    const data = info.value?.data;
    const decimals = data?.parsed?.info?.decimals;
    if (typeof decimals === 'number')
        return decimals;
    throw new Error('Unable to fetch mint decimals');
}
export async function getAtaAddress(ownerAddress, mintAddress) {
    const owner = new PublicKey(ownerAddress);
    const mint = new PublicKey(mintAddress);
    const ata = await getAssociatedTokenAddress(mint, owner);
    return ata.toBase58();
}
//# sourceMappingURL=utils.js.map