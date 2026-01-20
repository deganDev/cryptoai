import { TTLCache } from "../utils/cache.js";
import { getCoinGeckoConfig } from "../utils/env.js";
import { fetchJson } from "../utils/http.js";

export type CoinGeckoMarket = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
};

export type PriceCard = {
  id: string;
  symbol: string;
  name: string;
  priceUSD: number;
  change24h: number | null;
  mcapUSD: number | null;
  vol24hUSD: number | null;
  sourceUrl: string;
};

const cache = new TTLCache(15_000);
const searchCache = new TTLCache(60_000);

type CoinGeckoSearchCoin = {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
};

type CoinGeckoSearchResponse = {
  coins?: CoinGeckoSearchCoin[];
};

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildMarketUrl(baseUrl: string, coinId: string): string {
  const url = new URL(`${normalizeBase(baseUrl)}/coins/markets`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("ids", coinId);
  url.searchParams.set("price_change_percentage", "24h");
  return url.toString();
}

function buildSearchUrl(baseUrl: string, query: string): string {
  const url = new URL(`${normalizeBase(baseUrl)}/search`);
  url.searchParams.set("query", query);
  return url.toString();
}

export function mapCoinGeckoMarket(market: CoinGeckoMarket): PriceCard {
  return {
    id: market.id,
    symbol: market.symbol,
    name: market.name,
    priceUSD: market.current_price,
    change24h: market.price_change_percentage_24h ?? null,
    mcapUSD: market.market_cap ?? null,
    vol24hUSD: market.total_volume ?? null,
    sourceUrl: `https://www.coingecko.com/en/coins/${market.id}`
  };
}

export async function fetchPriceCard(
  coinId: string,
  ttlMs = 15_000
): Promise<PriceCard | null> {
  const trimmed = coinId.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const cacheKey = `coingecko:markets:${trimmed}`;
  const cached = cache.get<PriceCard>(cacheKey);
  if (cached) {
    return cached;
  }

  const { baseUrl } = getCoinGeckoConfig();
  const url = buildMarketUrl(baseUrl, trimmed);
  const data = await fetchJson<CoinGeckoMarket[]>(url, { timeoutMs: 8_000 });
  const market = data?.[0];
  if (!market) {
    return null;
  }

  const card = mapCoinGeckoMarket(market);
  cache.set(cacheKey, card, ttlMs);
  return card;
}

function pickBestSearchMatch(
  coins: CoinGeckoSearchCoin[],
  query: string
): CoinGeckoSearchCoin | null {
  if (!coins.length) {
    return null;
  }
  const needle = query.trim().toLowerCase();
  const exactSymbol = coins.find(
    (coin) => coin.symbol?.toLowerCase() === needle
  );
  if (exactSymbol) {
    return exactSymbol;
  }
  const exactName = coins.find((coin) => coin.name?.toLowerCase() === needle);
  if (exactName) {
    return exactName;
  }
  return coins
    .slice()
    .sort(
      (a, b) =>
        (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) -
        (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER)
    )[0];
}

export async function resolveCoinId(
  query: string
): Promise<string | null> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const cacheKey = `coingecko:search:${trimmed}`;
  const cached = searchCache.get<string>(cacheKey);
  if (cached) {
    return cached;
  }
  const { baseUrl } = getCoinGeckoConfig();
  const url = buildSearchUrl(baseUrl, trimmed);
  const data = await fetchJson<CoinGeckoSearchResponse>(url, { timeoutMs: 8_000 });
  const coins = data.coins ?? [];
  const best = pickBestSearchMatch(coins, trimmed);
  if (!best) {
    return null;
  }
  searchCache.set(cacheKey, best.id);
  return best.id;
}
