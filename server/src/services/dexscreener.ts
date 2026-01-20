import { TTLCache } from "../utils/cache.js";
import { getDexScreenerConfig } from "../utils/env.js";
import { fetchJson } from "../utils/http.js";

export type DexScreenerPair = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    socials?: Array<{ type: string; url: string }>;
    websites?: Array<{ label?: string; url: string }>;
  };
};

export type DexScreenerSearchResponse = {
  pairs?: DexScreenerPair[];
};

export type DexPairReport = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUSD: number | null;
  change24h: number | null;
  liquidityUSD: number | null;
  volume24hUSD: number | null;
  fdvUSD: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairCreatedAt: number | null;
  socials: Array<{ type: string; url: string }>;
  websites: Array<{ label?: string; url: string }>;
};

const searchCache = new TTLCache(15_000);
const pairCache = new TTLCache(15_000);

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function scorePair(pair: DexScreenerPair): number {
  const liquidity = pair.liquidity?.usd ?? 0;
  if (liquidity > 0) {
    return liquidity;
  }
  return pair.volume?.h24 ?? 0;
}

export function selectBestPair(
  pairs: DexScreenerPair[]
): DexScreenerPair | null {
  if (!pairs.length) {
    return null;
  }
  return pairs.reduce((best, current) =>
    scorePair(current) > scorePair(best) ? current : best
  );
}

function mapPairToReport(pair: DexScreenerPair): DexPairReport {
  const socials = pair.info?.socials ?? [];
  const websites = pair.info?.websites ?? [];
  const price = pair.priceUsd ? Number(pair.priceUsd) : null;
  const change = pair.priceChange?.h24 ?? null;
  return {
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    url: pair.url,
    baseToken: pair.baseToken,
    quoteToken: pair.quoteToken,
    priceUSD: Number.isFinite(price) ? price : null,
    change24h: typeof change === "number" ? change : null,
    liquidityUSD: pair.liquidity?.usd ?? null,
    volume24hUSD: pair.volume?.h24 ?? null,
    fdvUSD: pair.fdv ?? null,
    buys24h: pair.txns?.h24?.buys ?? null,
    sells24h: pair.txns?.h24?.sells ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    socials,
    websites
  };
}

async function fetchSearchResults(query: string): Promise<DexScreenerPair[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const cacheKey = `dexscreener:search:${trimmed.toLowerCase()}`;
  const cached = searchCache.get<DexScreenerPair[]>(cacheKey);
  if (cached) {
    return cached;
  }
  const { baseUrl } = getDexScreenerConfig();
  const url = `${normalizeBase(baseUrl)}/search?q=${encodeURIComponent(trimmed)}`;
  const data = await fetchJson<DexScreenerSearchResponse>(url, {
    timeoutMs: 8_000
  });
  const pairs = data.pairs ?? [];
  searchCache.set(cacheKey, pairs);
  return pairs;
}

async function fetchPairDetails(
  chainId: string,
  pairAddress: string
): Promise<DexScreenerPair | null> {
  if (!chainId || !pairAddress) {
    return null;
  }
  const cacheKey = `dexscreener:pair:${chainId}:${pairAddress}`;
  const cached = pairCache.get<DexScreenerPair>(cacheKey);
  if (cached) {
    return cached;
  }
  const { baseUrl } = getDexScreenerConfig();
  const url = `${normalizeBase(baseUrl)}/pairs/${chainId}/${pairAddress}`;
  const data = await fetchJson<DexScreenerSearchResponse>(url, {
    timeoutMs: 8_000
  });
  const pair = data.pairs?.[0] ?? null;
  if (pair) {
    pairCache.set(cacheKey, pair);
  }
  return pair;
}

export async function resolveDexPair(
  query: string,
  options: { chainId?: string; strictChain?: boolean } = {}
): Promise<DexPairReport | null> {
  const pairs = await fetchSearchResults(query);
  const filtered = options.chainId
    ? pairs.filter(
        (pair) => pair.chainId?.toLowerCase() === options.chainId?.toLowerCase()
      )
    : pairs;
  if (options.chainId && options.strictChain && !filtered.length) {
    return null;
  }
  const best = selectBestPair(filtered.length ? filtered : pairs);
  if (!best) {
    return null;
  }

  const details = await fetchPairDetails(best.chainId, best.pairAddress);
  return mapPairToReport(details ?? best);
}
