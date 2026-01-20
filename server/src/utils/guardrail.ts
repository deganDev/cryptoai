const CRYPTO_KEYWORDS = [
  "crypto",
  "token",
  "coin",
  "defi",
  "wallet",
  "staking",
  "restaking",
  "blockchain",
  "btc",
  "bitcoin",
  "eth",
  "ethereum",
  "bnb",
  "solana",
  "dex",
  "cex",
  "airdrop",
  "gas",
  "contract",
  "address",
  "0x",
  "price",
  "market",
  "mcap",
  "marketcap",
  "cap",
  "mc",
  "volume",
  "chart",
  "fdv",
  "ath",
  "atl"
];

export function isCryptoQuery(message: string): boolean {
  const lowered = message.toLowerCase();
  return CRYPTO_KEYWORDS.some((kw) => lowered.includes(kw));
}
