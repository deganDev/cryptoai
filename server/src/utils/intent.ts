import type { Intent } from "../types.js";
import { isCryptoQuery } from "./guardrail.js";

const RISK_KEYWORDS = [
  "scam",
  "safe",
  "legit",
  "honeypot",
  "rug",
  "tax"
];

const PRICE_KEYWORDS = [
  "price",
  "today",
  "now",
  "rate",
  "chart",
  "mcap",
  "volume",
  "market cap",
  "marketcap",
  "mc",
  "fdv",
  "high",
  "low",
  "ath",
  "atl",
  "valuation",
  "supply",
  "circulating",
  "circulating supply",
  "total supply",
  "max supply",
  "liquidity",
  "liquid",
  "cap",
  "market",
  "24h",
  "24 hr",
  "24-hour",
  "daily",
  "weekly",
  "monthly",
  "performance",
  "change",
  "percent",
  "percentage",
  "pump",
  "dump",
  "up",
  "down",
  "usd",
  "usdt",
  "usdc",
  "buy",
  "sell",
  "trade",
  "trading"
];

const NEWS_KEYWORDS = [
  "news",
  "headline",
  "headlines",
  "happened",
  "update",
  "updates",
  "latest",
  "recent",
  "today",
  "yesterday",
  "this week",
  "weekly",
  "this month",
  "monthly",
  "market",
  "markets",
  "trend",
  "trending",
  "condition",
  "conditions",
  "sentiment",
  "outlook",
  "what's new",
  "whats new",
  "breaking",
  "announcements",
  "announce",
  "report",
  "reports",
  "rumor",
  "rumors",
  "buzz",
  "attention",
  "looking",
  "coverage",
  "developments",
  "developing"
];
const TRACE_KEYWORDS = [
  "trace",
  "tracer",
  "wallet trace",
  "flow",
  "hops",
  "hop",
  "counterparty",
  "counterparties",
  "incoming",
  "outgoing"
];

export function classifyIntent(message: string): Intent {
  const lowered = message.toLowerCase();

  const hasNewsKeyword = NEWS_KEYWORDS.some((kw) => lowered.includes(kw));
  const hasPriceKeyword = PRICE_KEYWORDS.some((kw) => lowered.includes(kw));
  const hasTokenHint = /\b[A-Z0-9]{2,6}\b/i.test(message);

  if (TRACE_KEYWORDS.some((kw) => lowered.includes(kw))) {
    return "EXPLAIN";
  }

  if (lowered.includes("0x") || lowered.includes("contract")) {
    return "RISK";
  }

  if (RISK_KEYWORDS.some((kw) => lowered.includes(kw))) {
    return "RISK";
  }

  if (hasPriceKeyword) {
    return "PRICE";
  }

  if (hasNewsKeyword && hasTokenHint) {
    return "NEWS";
  }

  if (hasNewsKeyword) {
    return "NEWS";
  }

  if (isCryptoQuery(lowered)) {
    return "EXPLAIN";
  }

  return "UNKNOWN";
}
