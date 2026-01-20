import { loadConfig } from "./config.js";

export type LlmProvider = "openai" | "gemini";

type ServiceConfig = {
  baseUrl: string;
  apiKey?: string;
};

const DEFAULT_BASES = {
  coingecko: "https://api.coingecko.com/api/v3",
  dexscreener: "https://api.dexscreener.com/latest/dex",
  etherscan: "https://api.etherscan.io/v2/api",
  bscscan: "https://api.bscscan.com/v2/api",
  cryptopanic: "https://cryptopanic.com/api/v1"
};

function getEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return undefined;
  }
  return value;
}

function requireEnv(name: string, context: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing ${name}. Required for ${context}.`);
  }
  return value;
}

export function getCoinGeckoConfig(): ServiceConfig {
  return {
    baseUrl: getEnv("COINGECKO_BASE") ?? DEFAULT_BASES.coingecko
  };
}

export function getDexScreenerConfig(): ServiceConfig {
  return {
    baseUrl: getEnv("DEXSCREENER_BASE") ?? DEFAULT_BASES.dexscreener
  };
}

export function getEtherscanConfig(): ServiceConfig {
  return {
    apiKey: requireEnv("ETHERSCAN_API_KEY", "Etherscan"),
    baseUrl: getEnv("ETHERSCAN_BASE") ?? DEFAULT_BASES.etherscan
  };
}

export function getBscScanConfig(): ServiceConfig {
  return {
    apiKey: requireEnv("BSCSCAN_API_KEY", "BscScan"),
    baseUrl: getEnv("BSCSCAN_BASE") ?? DEFAULT_BASES.bscscan
  };
}

export function getCryptoPanicConfig(): ServiceConfig {
  return {
    apiKey: requireEnv("CRYPTOPANIC_API_KEY", "CryptoPanic"),
    baseUrl: getEnv("CRYPTOPANIC_BASE") ?? DEFAULT_BASES.cryptopanic
  };
}

export function getLlmProviders(): LlmProvider[] {
  const rawEnv = process.env.LLM_PROVIDERS;
  if (rawEnv === undefined) {
    const fallback: LlmProvider[] = ["gemini", "openai"];
    const config = loadConfig();
    const allowed = new Set(config.llm.providers);
    return fallback.filter((provider) => allowed.has(provider));
  }
  if (rawEnv.trim() === "") {
    return [];
  }
  const raw = rawEnv;
  const config = loadConfig();
  const allowed = new Set(config.llm.providers);
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(
      (item): item is LlmProvider =>
        (item === "openai" || item === "gemini") && allowed.has(item)
    );
}

export function getOpenAiConfig(): ServiceConfig {
  return {
    apiKey: requireEnv("OPENAI_API_KEY", "OpenAI"),
    baseUrl: ""
  };
}

export function getGeminiConfig(): ServiceConfig {
  return {
    apiKey: requireEnv("GEMINI_API_KEY", "Gemini"),
    baseUrl: ""
  };
}

export function getSupportedChains() {
  return loadConfig().chains;
}
