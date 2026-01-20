# Crypto Chat (Zarklab-style)

Crypto-only chat UI with real-time pricing, risk checks, news, and wallet tracing. LLMs (OpenAI/Gemini) are optional and used only to format and explain tool outputs.

## Quick start

1) `cd server && npm install`
2) Create `server/.env` (see below)
3) `npm run dev`
4) `cd client && npm install && npm run dev`

## Features

- Price and market snapshot via CoinGecko
- DEX pair resolution via DexScreener
- EVM contract checks via Etherscan (Ethereum default, optional BNB)
- News briefings via CryptoPanic
- Wallet tracing (EVM only)
- Deterministic risk scoring
- Crypto-only guardrail

## Limitations

- Contract verification and wallet tracing are EVM-only.
- Non-EVM tokens get market/DEX signals only.
- LLM output is formatting only; no fabricated data.
- Responses always include “Not financial advice.”

## Sample queries

- `price of solana`
- `market cap of doge`
- `latest news on ETH`
- `is pepe a scam?`
- `trace 0x237DeE529A47750bEcdFa8A59a1D766e3e7B5F91 to 1 hop`
- `trace 0x237DeE529A47750bEcdFa8A59a1D766e3e7B5F91 last 7 days`

## Environment variables

Service-specific configuration (set only what you use):

```
PORT=8080
COINGECKO_BASE=https://api.coingecko.com/api/v3
DEXSCREENER_BASE=https://api.dexscreener.com/latest/dex
ETHERSCAN_API_KEY=YOUR_KEY           # required for Etherscan checks
ETHERSCAN_BASE=https://api.etherscan.io/api
ETHERSCAN_CHAIN_ID=1                 # required if using Etherscan v2 base
# BSCSCAN_API_KEY=YOUR_KEY            # required only if BNB is enabled
BSCSCAN_BASE=https://api.bscscan.com/api
BSCSCAN_CHAIN_ID=56                  # required if using BscScan v2 base
CRYPTOPANIC_API_KEY=YOUR_KEY         # required for CryptoPanic news
CRYPTOPANIC_BASE=https://cryptopanic.com/api/developer/v2
```

Optional LLM providers (array):

```
LLM_PROVIDERS=gemini,openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

If `LLM_PROVIDERS` is empty, the backend returns template responses.

## Config

`server/config.json` controls which chains and LLM providers are supported. Default config enables Ethereum only; add BNB only if you have a paid BscScan plan or another supported explorer.
CryptoPanic base can be `https://cryptopanic.com` or `https://cryptopanic.com/api/developer/v2`; the checker will append `/posts` as needed.
