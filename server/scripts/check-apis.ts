import dotenv from "dotenv";
import { loadConfig } from "../src/utils/config.js";

dotenv.config();

type CheckResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  details?: string;
};

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    const snippet = text.trim().slice(0, 200);
    throw new Error(
      `HTTP ${response.status} (${url})${snippet ? `: ${snippet}` : ""}`
    );
  }
  return (await response.json()) as T;
}

function normalizeBase(base: string): string {
  return base.replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  const trimmed = normalizeBase(base);
  if (!path.startsWith("/")) {
    return `${trimmed}/${path}`;
  }
  return `${trimmed}${path}`;
}

function buildUrlWithParams(
  base: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function isV2ExplorerBase(base: string): boolean {
  try {
    return new URL(base).pathname.includes("/v2/");
  } catch {
    return base.includes("/v2/");
  }
}

function normalizeCryptoPanicBase(base: string): string {
  const trimmed = normalizeBase(base);
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

async function checkCoinGecko(base: string): Promise<CheckResult> {
  try {
    const data = await fetchJson<{ gecko_says?: string }>(
      joinUrl(base, "/ping")
    );
    return {
      name: "CoinGecko",
      ok: Boolean(data.gecko_says),
      details: data.gecko_says ?? "Missing gecko_says"
    };
  } catch (error) {
    return { name: "CoinGecko", ok: false, details: (error as Error).message };
  }
}

async function checkDexScreener(base: string): Promise<CheckResult> {
  try {
    const data = await fetchJson<{ pairs?: Array<unknown> }>(
      joinUrl(base, "/search?q=bitcoin")
    );
    return {
      name: "DexScreener",
      ok: Array.isArray(data.pairs),
      details: Array.isArray(data.pairs)
        ? `pairs=${data.pairs.length}`
        : "Missing pairs array"
    };
  } catch (error) {
    return { name: "DexScreener", ok: false, details: (error as Error).message };
  }
}

async function checkEtherscan(
  base: string,
  apiKey: string,
  chainId: number
): Promise<CheckResult> {
  try {
    const params: Record<string, string | undefined> = {
      module: "stats",
      action: "ethprice",
      apikey: apiKey
    };
    if (isV2ExplorerBase(base)) {
      params.chainid = String(chainId);
    }
    const data = await fetchJson<{
      status?: string;
      message?: string;
      result?: string;
    }>(buildUrlWithParams(base, params));
    const details = [data.message, data.result, data.status]
      .filter(Boolean)
      .join(" | ");
    return {
      name: "Etherscan",
      ok: data.status === "1" || data.message === "OK",
      details: details || "No status"
    };
  } catch (error) {
    return { name: "Etherscan", ok: false, details: (error as Error).message };
  }
}

async function checkBscScan(
  base: string,
  apiKey: string,
  chainId: number
): Promise<CheckResult> {
  try {
    const params: Record<string, string | undefined> = {
      module: "stats",
      action: "bnbprice",
      apikey: apiKey
    };
    if (isV2ExplorerBase(base)) {
      params.chainid = String(chainId);
    }
    const data = await fetchJson<{
      status?: string;
      message?: string;
      result?: string;
    }>(buildUrlWithParams(base, params));
    const details = [data.message, data.result, data.status]
      .filter(Boolean)
      .join(" | ");
    return {
      name: "BscScan",
      ok: data.status === "1" || data.message === "OK",
      details: details || "No status"
    };
  } catch (error) {
    return { name: "BscScan", ok: false, details: (error as Error).message };
  }
}

async function checkCryptoPanic(
  base: string,
  apiKey: string
): Promise<CheckResult> {
  let requestUrl = "";
  try {
    const normalizedBase = normalizeCryptoPanicBase(base);
    requestUrl = buildUrlWithParams(normalizedBase, {
      auth_token: apiKey,
      public: "true"
    });
    const data = await fetchJson<{ count?: number }>(requestUrl);
    return {
      name: "CryptoPanic",
      ok: typeof data.count === "number",
      details:
        typeof data.count === "number"
          ? `count=${data.count}`
          : "Missing count"
    };
  } catch (error) {
    return {
      name: "CryptoPanic",
      ok: false,
      details: `${(error as Error).message}${requestUrl ? ` (url=${requestUrl})` : ""}`
    };
  }
}

async function main() {
  const baseCoinGecko =
    process.env.COINGECKO_BASE ?? "https://api.coingecko.com/api/v3";
  const baseDex =
    process.env.DEXSCREENER_BASE ?? "https://api.dexscreener.com/latest/dex";
  const baseEth = process.env.ETHERSCAN_BASE ?? "https://api.etherscan.io/api";
  const baseBsc = process.env.BSCSCAN_BASE ?? "https://api.bscscan.com/api";
  const basePanic =
    process.env.CRYPTOPANIC_BASE ?? "https://cryptopanic.com/api/developer/v2";

  const config = loadConfig();
  const checks: Array<Promise<CheckResult>> = [
    checkCoinGecko(baseCoinGecko),
    checkDexScreener(baseDex),
    checkCryptoPanic(basePanic, getEnv("CRYPTOPANIC_API_KEY"))
  ];

  const ethChain = config.chains.find((chain) => chain.explorer === "etherscan");
  if (ethChain) {
    checks.push(
      checkEtherscan(baseEth, getEnv("ETHERSCAN_API_KEY"), ethChain.chainId ?? 1)
    );
  } else {
    checks.push(
      Promise.resolve({
        name: "Etherscan",
        ok: true,
        skipped: true,
        details: "not configured"
      })
    );
  }

  const bscChain = config.chains.find((chain) => chain.explorer === "bscscan");
  if (bscChain) {
    checks.push(
      checkBscScan(baseBsc, getEnv("BSCSCAN_API_KEY"), bscChain.chainId ?? 56)
    );
  } else {
    checks.push(
      Promise.resolve({
        name: "BscScan",
        ok: true,
        skipped: true,
        details: "not configured"
      })
    );
  }

  const results = await Promise.all(checks);
  const failures = results.filter((result) => !result.ok && !result.skipped);

  for (const result of results) {
    const status = result.skipped ? "SKIP" : result.ok ? "OK" : "FAIL";
    console.log(`${status} - ${result.name}: ${result.details ?? ""}`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Unexpected error: ${(error as Error).message}`);
  process.exitCode = 1;
});
