# Server

Express API for crypto chat. Provides `/api/chat` with intent routing, caching, and tool orchestration.

## Setup

```
npm install
cp .env.example .env
npm run dev
```

## Environment

```
PORT=8080
COINGECKO_BASE=https://api.coingecko.com/api/v3
DEXSCREENER_BASE=https://api.dexscreener.com/latest/dex
ETHERSCAN_API_KEY=YOUR_KEY
ETHERSCAN_BASE=https://api.etherscan.io/api
ETHERSCAN_CHAIN_ID=1
BSCSCAN_API_KEY=YOUR_KEY
BSCSCAN_BASE=https://api.bscscan.com/api
BSCSCAN_CHAIN_ID=56
CRYPTOPANIC_API_KEY=YOUR_KEY
CRYPTOPANIC_BASE=https://cryptopanic.com/api/developer/v2
LLM_PROVIDERS=gemini,openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

If `LLM_PROVIDERS` is empty, the backend returns template responses.

## API

`POST /api/chat`

```json
{
  "message": "price of eth",
  "sessionId": "optional",
  "mode": "auto"
}
```

Response:

```json
{
  "intent": "PRICE",
  "answer_md": "markdown response with citations",
  "cards": { "price": {}, "risk": {}, "news": [], "walletTrace": {} },
  "sources": [{ "id": 1, "title": "DexScreener Pair", "url": "https://...", "type": "dex" }],
  "timestamp": "2026-01-19T00:00:00Z"
}
```

## Sample queries

- `price of BTC`
- `market cap of doge`
- `news on ETH`
- `is pepe a scam?`
- `trace 0x237DeE529A47750bEcdFa8A59a1D766e3e7B5F91 to 1 hop`
- `trace 0x237DeE529A47750bEcdFa8A59a1D766e3e7B5F91 last 14 days`

## Notes

- Contract verification and wallet tracing are EVM-only.
- Non-EVM tokens get market/DEX signals only.
- CryptoPanic advanced filters (`search`, `size`, `panic_period`) require Enterprise plans.
