export function getCoralConnectionUrlFromEnv(): string {
  const url = process.env.CORAL_CONNECTION_URL || '';
  if (!url) throw new Error('Missing CORAL_CONNECTION_URL');
  return url;
}

export type CoralWalletOptions = {
  walletEmail?: string;
  walletPhone?: string;
  chain?: string;
  asset?: string;
};

export function getCoralWalletOptionsFromEnv(): CoralWalletOptions {
  return {
    walletEmail: process.env.CORAL_WALLET_EMAIL || undefined,
    walletPhone: process.env.CORAL_WALLET_PHONE || undefined,
    chain: process.env.CORAL_CHAIN || undefined,
    asset: process.env.CORAL_ASSET || undefined,
  };
}
