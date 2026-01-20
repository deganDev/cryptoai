import { TTLCache } from "../utils/cache.js";
import { getCryptoPanicConfig } from "../utils/env.js";
import { fetchJson } from "../utils/http.js";

export type CryptoPanicPost = {
  title?: string;
  url?: string;
  domain?: string;
  published_at?: string;
  source?: { title?: string; domain?: string };
};

export type CryptoPanicResponse = {
  results?: CryptoPanicPost[];
};

export type NewsHeadline = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
};

const cache = new TTLCache(60_000);

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function normalizeCryptoPanicBase(baseUrl: string): string {
  const trimmed = normalizeBase(baseUrl);
  if (/\/api\/developer\/v2\/posts\/?$/.test(trimmed)) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }
  if (/\/api\/developer\/v2\/?$/.test(trimmed)) {
    return `${trimmed}/posts/`;
  }
  if (/\/api\/developer\/?$/.test(trimmed)) {
    return `${trimmed}/v2/posts/`;
  }
  if (/\/api\/?$/.test(trimmed)) {
    return `${trimmed}/developer/v2/posts/`;
  }
  return `${trimmed}/api/developer/v2/posts/`;
}

function buildNewsUrl(
  baseUrl: string,
  apiKey: string,
  currencies: string[]
): string {
  const url = new URL(normalizeCryptoPanicBase(baseUrl));
  url.searchParams.set("auth_token", apiKey);
  url.searchParams.set("public", "true");
  if (currencies.length) {
    url.searchParams.set("currencies", currencies.join(","));
  }
  return url.toString();
}

function mapPostToHeadline(post: CryptoPanicPost): NewsHeadline | null {
  const title = post.title?.trim();
  const url = post.url?.trim();
  if (!title || !url) {
    return null;
  }
  const source = post.source?.title ?? post.domain ?? post.source?.domain ?? null;
  return {
    title,
    url,
    source,
    publishedAt: post.published_at ?? null
  };
}

export async function fetchNewsBrief(
  currencies: string[] = ["BTC", "ETH", "BNB"],
  limit = 8
): Promise<NewsHeadline[]> {
  const trimmedCurrencies = currencies
    .map((currency) => currency.trim().toUpperCase())
    .filter(Boolean);
  const cacheKey = `cryptopanic:posts:${trimmedCurrencies.join(",")}:${limit}`;
  const cached = cache.get<NewsHeadline[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const { baseUrl, apiKey } = getCryptoPanicConfig();
  const url = buildNewsUrl(baseUrl, apiKey ?? "", trimmedCurrencies);
  const data = await fetchJson<CryptoPanicResponse>(url, { timeoutMs: 8_000 });
  let headlines = (data.results ?? [])
    .map(mapPostToHeadline)
    .filter((headline): headline is NewsHeadline => Boolean(headline));

  if (!headlines.length && trimmedCurrencies.length) {
    const fallbackUrl = buildNewsUrl(baseUrl, apiKey ?? "", []);
    const fallbackData = await fetchJson<CryptoPanicResponse>(fallbackUrl, {
      timeoutMs: 8_000
    });
    headlines = (fallbackData.results ?? [])
      .map(mapPostToHeadline)
      .filter((headline): headline is NewsHeadline => Boolean(headline));
  }

  headlines = headlines.slice(0, Math.max(0, limit));

  cache.set(cacheKey, headlines);
  return headlines;
}
