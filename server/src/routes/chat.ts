import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { ChatResponse, Source } from "../types.js";
import { fetchPriceCard, resolveCoinId } from "../services/coingecko.js";
import type { NewsHeadline } from "../services/cryptopanic.js";
import { fetchNewsBrief } from "../services/cryptopanic.js";
import { resolveDexPair } from "../services/dexscreener.js";
import { fetchContractReport } from "../services/etherscan.js";
import { writeAnswer } from "../services/llm.js";
import { buildRiskReport } from "../services/risk.js";
import { traceWallet } from "../services/walletTracer.js";
import {
  appendTurn,
  getConversation,
  updateConversation
} from "../utils/conversation.js";
import { getSupportedChains } from "../utils/env.js";
import { isCryptoQuery } from "../utils/guardrail.js";
import { classifyIntent } from "../utils/intent.js";
import { ChatSession } from "../models/ChatSession.js";
import { ChatTurn } from "../models/ChatTurn.js";

type ChatRequestBody = {
  message?: string;
  sessionId?: string;
  mode?: string;
};

const CRYPTO_ONLY_REPLY =
  "Crypto-only. Ask about tokens, markets, DeFi, wallets, security. Not financial advice.";

const ADDRESS_REGEX = /0x[a-fA-F0-9]{40}/;
const BASE58_ADDRESS_REGEX = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const STOPWORDS = new Set([
  "what",
  "whats",
  "what's",
  "who",
  "whos",
  "who's",
  "how",
  "why",
  "which",
  "when",
  "where",
  "tell",
  "tellme",
  "me",
  "give",
  "show",
  "latest",
  "price",
  "prices",
  "rate",
  "rates",
  "value",
  "values",
  "marketcap",
  "market",
  "cap",
  "mc",
  "fdv",
  "volume",
  "vol",
  "high",
  "low",
  "ath",
  "atl",
  "token",
  "coin",
  "coins",
  "is",
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "now",
  "today",
  "news",
  "risk",
  "safe",
  "scam",
  "legit",
  "about",
  "this",
  "that",
  "it",
  "its",
  "explain",
  "trace",
  "wallet",
  "address",
  "contract",
  "mcap",
  "chart",
  "check",
  "look",
  "on",
  "in",
  "and",
  "or",
  "please",
  "please"
]);

const COINGECKO_ID_BY_SYMBOL: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "binancecoin",
  binance: "binancecoin",
  sol: "solana",
  solana: "solana",
  usdt: "tether",
  usdc: "usd-coin"
};

const SYMBOL_BY_ID: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  binancecoin: "BNB",
  solana: "SOL",
  tether: "USDT",
  "usd-coin": "USDC"
};

const CHAIN_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  bnb: "BNB Chain"
};

function extractAddress(message: string): string | null {
  const match = message.match(ADDRESS_REGEX);
  if (match?.[0]) {
    return match[0];
  }
  const base58 = message.match(BASE58_ADDRESS_REGEX);
  return base58?.[0] ?? null;
}

function isNonEvmAddress(address: string | null): boolean {
  if (!address) {
    return false;
  }
  return !address.toLowerCase().startsWith("0x");
}

function extractTokenQuery(message: string): string | null {
  const lowered = message.toLowerCase();
  const patterns = [
    /(?:price|rate|value|market cap|marketcap|mc|fdv|volume|vol|high|low|ath|atl)\s+of\s+([a-z0-9_-]{2,20})/i,
    /([a-z0-9_-]{2,20})\s+(?:price|rate|value|market cap|marketcap|mc|fdv|volume|vol|high|low|ath|atl)/i
  ];
  for (const pattern of patterns) {
    const match = lowered.match(pattern);
    const candidate = match?.[1];
    if (candidate && !STOPWORDS.has(candidate)) {
      return candidate;
    }
  }

  const words = message.split(/[^a-zA-Z0-9_-]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const word = words[i];
    const cleaned = word.toLowerCase();
    if (cleaned.length < 2 || cleaned.length > 20) {
      continue;
    }
    if (STOPWORDS.has(cleaned)) {
      continue;
    }
    return cleaned;
  }
  return null;
}

function resolveQueryFromHistory(
  message: string,
  sessionId: string
): { query: string | null; address: string | null; chainHint: string | null } {
  const address = extractAddress(message);
  const query = extractTokenQuery(message);
  const lowered = message.toLowerCase();
  let chainHint: string | null = null;

  if (
    lowered.includes("bsc") ||
    lowered.includes("bnb") ||
    lowered.includes("binance")
  ) {
    chainHint = "bnb";
  } else if (lowered.includes("ethereum") || lowered.includes("eth")) {
    chainHint = "ethereum";
  }

  if (address || query || chainHint) {
    const updates: {
      lastAddress?: string;
      lastQuery?: string;
      lastChain?: string;
    } = {};
    if (address) {
      updates.lastAddress = address;
    }
    if (query) {
      updates.lastQuery = query;
    }
    if (chainHint) {
      updates.lastChain = chainHint;
    }
    if (Object.keys(updates).length) {
      updateConversation(sessionId, updates);
    }
    return { query, address, chainHint };
  }

  const state = getConversation(sessionId);
  return {
    query: state.lastQuery ?? null,
    address: state.lastAddress ?? null,
    chainHint: state.lastChain ?? null
  };
}

function parseHopLimit(message: string): number | null {
  const match = message.toLowerCase().match(/\b(\d+)\s*hop/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.min(2, Math.max(0, Math.round(value)));
}

function parseDaysWindow(message: string): number | null {
  const lowered = message.toLowerCase();
  const patterns = [
    /\blast\s+(\d+)\s+days?\b/,
    /\bpast\s+(\d+)\s+days?\b/,
    /\bprevious\s+(\d+)\s+days?\b/,
    /\b(\d+)\s+days?\s+ago\b/,
    /\b(\d+)\s*d\b/,
    /\blast\s+(\d+)\s*hours?\b/,
    /\bpast\s+(\d+)\s*hours?\b/,
    /\b(\d+)\s*hours?\s+ago\b/,
    /\b(\d+)\s*h\b/,
    /\blast\s+(\d+)\s*weeks?\b/,
    /\bpast\s+(\d+)\s*weeks?\b/,
    /\b(\d+)\s*weeks?\s+ago\b/,
    /\b(\d+)\s*w\b/,
    /\blast\s+(\d+)\s*months?\b/,
    /\bpast\s+(\d+)\s*months?\b/,
    /\b(\d+)\s*months?\s+ago\b/,
    /\b(\d+)\s*mo\b/
  ];
  for (const pattern of patterns) {
    const match = lowered.match(pattern);
    if (!match) {
      continue;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    if (pattern.source.includes("hour") || pattern.source.includes("\\s*h")) {
      return Math.min(90, Math.max(1, Math.round(value / 24)));
    }
    if (pattern.source.includes("week") || pattern.source.includes("\\s*w")) {
      return Math.min(90, Math.round(value * 7));
    }
    if (pattern.source.includes("month") || pattern.source.includes("\\s*mo")) {
      return Math.min(90, Math.round(value * 30));
    }
    return Math.min(90, Math.round(value));
  }
  return null;
}

function resolveCoinGeckoId(query: string | null): string | null {
  if (!query) {
    return null;
  }
  return COINGECKO_ID_BY_SYMBOL[query] ?? query;
}

function buildPriceFromDexPair(pair: {
  baseToken: { name: string; symbol: string };
  priceUSD: number | null;
  change24h: number | null;
  liquidityUSD: number | null;
  volume24hUSD: number | null;
  url: string;
}) {
  return {
    id: pair.baseToken.symbol.toLowerCase(),
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    priceUSD: pair.priceUSD ?? Number.NaN,
    change24h: pair.change24h ?? null,
    mcapUSD: null,
    vol24hUSD: pair.volume24hUSD ?? null,
    sourceUrl: pair.url
  };
}

function resolveNewsCurrencies(query: string | null, fallback?: string): string[] {
  if (fallback) {
    return [fallback];
  }
  if (!query) {
    return [];
  }
  const mapped = SYMBOL_BY_ID[COINGECKO_ID_BY_SYMBOL[query] ?? query];
  if (mapped) {
    return [mapped];
  }
  if (query.length <= 6 && /^[a-z0-9]+$/i.test(query)) {
    return [query.toUpperCase()];
  }
  return [];
}

function findChainByDexId(dexChainId: string | undefined) {
  if (!dexChainId) {
    return null;
  }
  const chains = getSupportedChains();
  const needle = dexChainId.toLowerCase();
  return (
    chains.find((chain) => chain.id.toLowerCase() === needle) ??
    chains.find((chain) => chain.label.toLowerCase() === needle) ??
    null
  );
}

function addSource(sources: Source[], source: Omit<Source, "id">): Source {
  const entry: Source = { id: sources.length + 1, ...source };
  sources.push(entry);
  return entry;
}

function formatNewsSnippet(headline: { source: string | null; publishedAt: string | null }) {
  const date = headline.publishedAt
    ? new Date(headline.publishedAt).toISOString().slice(0, 10)
    : null;
  const parts = [headline.source, date].filter(Boolean);
  return parts.length ? parts.join(" • ") : undefined;
}

async function buildChatResponse(
  body: ChatRequestBody,
  userId: string
): Promise<ChatResponse> {
  const message = body?.message?.trim() ?? "";
  const sessionId = body?.sessionId?.trim() || randomUUID();
  const now = new Date().toISOString();

  if (!message || !isCryptoQuery(message)) {
    return {
      intent: "UNKNOWN",
      sessionId,
      answer_md: CRYPTO_ONLY_REPLY,
      cards: { news: [] },
      sources: [],
      timestamp: now
    };
  }

  const intent = classifyIntent(message);
  appendTurn(sessionId, {
    role: "user",
    content: message,
    intent,
    timestamp: now
  });
  const existingSession = await ChatSession.findOne({ sessionId, userId });
  if (!existingSession) {
    await ChatSession.create({
      sessionId,
      userId,
      title: message.slice(0, 60),
      lastMessageAt: new Date()
    });
  } else {
    existingSession.lastMessageAt = new Date();
    if (!existingSession.title) {
      existingSession.title = message.slice(0, 60);
    }
    await existingSession.save();
  }
  const { query, address, chainHint } = resolveQueryFromHistory(message, sessionId);
  const resolvedQuery = address ?? query;
  const isTraceRequest =
    address !== null && message.toLowerCase().includes("trace");
  const hopLimit = parseHopLimit(message);
  const daysWindow = parseDaysWindow(message);
  const nonEvmAddress = isNonEvmAddress(address);

  const sources: Source[] = [];
  const cards: ChatResponse["cards"] = { news: [] };
  const notes: string[] = [];
  let price = null;
  let pair = null;
  let contract = null;
  let risk = null;
  let news: NewsHeadline[] | null = null;
  let walletTrace = null;
  const requestedChain = chainHint ?? undefined;

  const wantsTrace = intent === "EXPLAIN";
  const wantsMarketSnapshot =
    (intent === "PRICE" || intent === "EXPLAIN") && !isTraceRequest;
  const wantsRisk =
    (intent === "RISK" || intent === "EXPLAIN") && !isTraceRequest;
  const wantsNews =
    (intent === "NEWS" || intent === "EXPLAIN" || intent === "PRICE") &&
    !isTraceRequest;

  if (nonEvmAddress && (wantsRisk || wantsTrace)) {
    notes.push(
      "Non-EVM address detected. Contract verification and wallet tracing are EVM-only; showing DEX/market data when available."
    );
  }

  if (wantsMarketSnapshot) {
    const coinId = resolveCoinGeckoId(query);
    if (coinId) {
      try {
        price = await fetchPriceCard(coinId);
      } catch {
        price = null;
      }
    }
    if (!price && query) {
      try {
        const resolved = await resolveCoinId(query);
        if (resolved) {
          price = await fetchPriceCard(resolved);
        }
      } catch {
        price = null;
      }
    }
    if (resolvedQuery && requestedChain) {
      try {
        const chainPair = await resolveDexPair(resolvedQuery, {
          chainId: requestedChain,
          strictChain: true
        });
        if (!chainPair) {
          const label = CHAIN_LABELS[requestedChain] ?? requestedChain;
          notes.push(`No ${label} DEX listing found for ${resolvedQuery}.`);
        }
      } catch {
        const label = CHAIN_LABELS[requestedChain] ?? requestedChain;
        notes.push(`No ${label} DEX listing found for ${resolvedQuery}.`);
      }
    }
    if (resolvedQuery) {
      try {
        pair = await resolveDexPair(resolvedQuery, {
          chainId: requestedChain,
          strictChain: Boolean(requestedChain)
        });
      } catch {
        pair = null;
      }
      if (pair) {
        addSource(sources, {
          title: "DexScreener Pair",
          url: pair.url,
          type: "dex",
          snippet: "DEX pair liquidity, volume, and transaction stats."
        });
        if (!price) {
          price = buildPriceFromDexPair(pair);
        }
      }
    }
    if (price) {
      cards.price = price;
      addSource(sources, {
        title: "Market data",
        url: price.sourceUrl,
        type: "market",
        snippet: "Market snapshot with price, volume, and change."
      });
    }
  }

  if (wantsRisk) {
    if (resolvedQuery) {
      try {
        pair = await resolveDexPair(resolvedQuery, {
          chainId: requestedChain,
          strictChain: Boolean(requestedChain)
        });
      } catch {
        pair = null;
      }
    }
    if (pair) {
      addSource(sources, {
        title: "DexScreener Pair",
        url: pair.url,
        type: "dex",
        snippet: "DEX pair liquidity, volume, and transaction stats."
      });
      cards.risk = { pair };
    }
    const chain = pair ? findChainByDexId(pair.chainId) : null;
    if (chain && chain.explorer === "etherscan" && pair?.baseToken?.address) {
      try {
        contract = await fetchContractReport(pair.baseToken.address, {
          chainId: chain.chainId,
          fetchAbi: true
        });
      } catch {
        contract = null;
      }
    }
    if (contract) {
      addSource(sources, {
        title: "Contract source",
        url: contract.sourceUrl,
        type: "explorer",
        snippet: "Verified contract source and ABI checks."
      });
      cards.risk = { ...(cards.risk ?? {}), contract };
    }
    if (!price && query) {
      try {
        const resolved = await resolveCoinId(query);
        if (resolved) {
          price = await fetchPriceCard(resolved);
        }
      } catch {
        price = null;
      }
    }
    if (price) {
      addSource(sources, {
        title: "Market data",
        url: price.sourceUrl,
        type: "market",
        snippet: "Market snapshot with price, volume, and change."
      });
    }
    risk = buildRiskReport({ pair, contract, market: price });
    cards.risk = { ...(cards.risk ?? {}), report: risk };
  }

  if (wantsNews) {
    const fallbackSymbol = pair?.baseToken?.symbol ?? price?.symbol ?? null;
    const currencies = resolveNewsCurrencies(
      query,
      fallbackSymbol ?? undefined
    );
    try {
      news = await fetchNewsBrief(currencies, 8);
    } catch {
      news = [];
    }
    cards.news = news ?? [];
    (news ?? []).forEach((headline) => {
      addSource(sources, {
        title: headline.title,
        url: headline.url,
        type: "news",
        snippet: formatNewsSnippet(headline)
      });
    });
  }

  if (wantsTrace) {
    if (address) {
      const chain = chainHint ?? undefined;
      try {
        if (nonEvmAddress) {
          walletTrace = null;
        } else {
          const nowMs = Date.now();
          const startTime = daysWindow
            ? new Date(nowMs - daysWindow * 24 * 60 * 60 * 1000)
            : undefined;
          walletTrace = await traceWallet(address, {
            chain,
            maxHops: hopLimit ?? 1,
            startTime
          });
        }
      } catch {
        walletTrace = null;
      }
      if (walletTrace) {
        cards.walletTrace = walletTrace;
        walletTrace.sources.forEach((source) => {
          addSource(sources, {
            title: source.title,
            url: source.url,
            type: "explorer",
            snippet: "Explorer activity for traced wallet transfers."
          });
        });
      }
    }
  }

  if (!pair && intent !== "NEWS" && resolvedQuery) {
    try {
      pair = await resolveDexPair(resolvedQuery, {
        chainId: requestedChain,
        strictChain: Boolean(requestedChain)
      });
    } catch {
      pair = null;
    }
  }

  const { content } = await writeAnswer({
    intent,
    message,
    price,
    pair,
    risk,
    contract,
    news,
    walletTrace,
    sources,
    notes: notes.length ? notes : undefined
  });

  const response: ChatResponse = {
    intent,
    sessionId,
    answer_md: content,
    cards,
    sources,
    timestamp: new Date().toISOString()
  };

  appendTurn(sessionId, {
    role: "assistant",
    content,
    intent,
    timestamp: response.timestamp
  });

  await ChatTurn.create({
    sessionId,
    userId,
    prompt: message,
    response
  });

  return response;
}

function writeSse(res: Response, event: string, data: string) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
}

export async function postChat(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const response = await buildChatResponse(
    req.body as ChatRequestBody,
    req.user.uid
  );
  res.status(200).json(response);
}

export async function postChatStream(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  writeSse(res, "status", "searching");

  try {
    const response = await buildChatResponse(
      req.body as ChatRequestBody,
      req.user.uid
    );
    writeSse(res, "result", JSON.stringify(response));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    writeSse(res, "error", message);
  } finally {
    res.end();
  }
}
