import { TTLCache } from "../utils/cache.js";
import { getEtherscanConfig, getSupportedChains } from "../utils/env.js";
import { fetchJson } from "../utils/http.js";

export type EtherscanSourceResult = {
  SourceCode?: string;
  ABI?: string;
  ContractName?: string;
  CompilerVersion?: string;
  OptimizationUsed?: string;
  Runs?: string;
  Proxy?: string;
  Implementation?: string;
};

export type EtherscanSourceResponse = {
  status?: string;
  message?: string;
  result?: EtherscanSourceResult[] | string;
};

export type AbiRisk = {
  keyword: string;
  matches: string[];
  rationale: string;
};

export type ContractReport = {
  address: string;
  verified: boolean;
  proxy: boolean;
  implementation: string | null;
  contractName: string | null;
  compilerVersion: string | null;
  optimizationUsed: boolean | null;
  runs: number | null;
  abiRisks: AbiRisk[];
  sourceUrl: string;
};

const cache = new TTLCache(15_000);

const ABI_RISK_KEYWORDS: AbiRisk[] = [
  {
    keyword: "mint",
    matches: [],
    rationale: "Minting ability can dilute supply."
  },
  {
    keyword: "blacklist",
    matches: [],
    rationale: "Blacklist controls can freeze holders."
  },
  {
    keyword: "pause",
    matches: [],
    rationale: "Pause controls can halt transfers."
  },
  {
    keyword: "settax",
    matches: [],
    rationale: "Tax setters can change transfer costs."
  },
  {
    keyword: "setfee",
    matches: [],
    rationale: "Fee setters can change transfer costs."
  },
  {
    keyword: "setmax",
    matches: [],
    rationale: "Max tx/wallet setters can restrict trading."
  },
  {
    keyword: "setrouter",
    matches: [],
    rationale: "Router setters can redirect liquidity."
  },
  {
    keyword: "setpair",
    matches: [],
    rationale: "Pair setters can affect trading routes."
  },
  {
    keyword: "whitelist",
    matches: [],
    rationale: "Whitelist controls can gate transfers."
  },
  {
    keyword: "ownership",
    matches: [],
    rationale: "Ownership transfers can change control."
  }
];

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isV2ExplorerBase(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).pathname.includes("/v2/");
  } catch {
    return baseUrl.includes("/v2/");
  }
}

function buildUrlWithParams(
  baseUrl: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function buildSourceUrl(address: string): string {
  return `https://etherscan.io/address/${address}#code`;
}

function parseOptimizationFlag(value?: string): boolean | null {
  if (value === "1") {
    return true;
  }
  if (value === "0") {
    return false;
  }
  return null;
}

function parseRuns(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSourceResult(
  result: EtherscanSourceResult
): EtherscanSourceResult {
  return {
    SourceCode: result.SourceCode ?? "",
    ABI: result.ABI ?? "",
    ContractName: result.ContractName ?? "",
    CompilerVersion: result.CompilerVersion ?? "",
    OptimizationUsed: result.OptimizationUsed ?? "",
    Runs: result.Runs ?? "",
    Proxy: result.Proxy ?? "",
    Implementation: result.Implementation ?? ""
  };
}

export function scanAbiForRisks(abiJson: string): AbiRisk[] {
  const trimmed = abiJson?.trim();
  if (!trimmed || trimmed === "Contract source code not verified") {
    return [];
  }

  let abiEntries: Array<{ name?: string; type?: string }> = [];
  try {
    const parsed = JSON.parse(trimmed) as Array<{ name?: string; type?: string }>;
    if (Array.isArray(parsed)) {
      abiEntries = parsed.filter((entry) => entry?.type === "function");
    }
  } catch {
    const lower = trimmed.toLowerCase();
    return ABI_RISK_KEYWORDS.filter((risk) => lower.includes(risk.keyword)).map(
      (risk) => ({ ...risk, matches: [risk.keyword] })
    );
  }

  const functionNames = abiEntries
    .map((entry) => entry.name ?? "")
    .filter(Boolean)
    .map((name) => name.toLowerCase());

  return ABI_RISK_KEYWORDS.flatMap((risk) => {
    const matches = functionNames.filter((name) => name.includes(risk.keyword));
    if (!matches.length) {
      return [];
    }
    return [{ ...risk, matches }];
  });
}

export function buildContractReport(
  address: string,
  source: EtherscanSourceResult
): ContractReport {
  const normalized = normalizeSourceResult(source);
  const sourceText = normalized.SourceCode?.trim() ?? "";
  const verified =
    Boolean(sourceText) &&
    !sourceText.toLowerCase().includes("contract source code not verified");
  return {
    address,
    verified,
    proxy: normalized.Proxy === "1",
    implementation: normalized.Implementation?.trim() || null,
    contractName: normalized.ContractName?.trim() || null,
    compilerVersion: normalized.CompilerVersion?.trim() || null,
    optimizationUsed: parseOptimizationFlag(normalized.OptimizationUsed),
    runs: parseRuns(normalized.Runs),
    abiRisks: scanAbiForRisks(normalized.ABI ?? ""),
    sourceUrl: buildSourceUrl(address)
  };
}

function getChainIdFallback(): number | undefined {
  const chains = getSupportedChains();
  const eth = chains.find((chain) => chain.id === "ethereum");
  return eth?.chainId;
}

export async function fetchContractReport(
  address: string,
  options: { chainId?: number; fetchAbi?: boolean } = {}
): Promise<ContractReport | null> {
  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  const cacheKey = `etherscan:source:${trimmed}`;
  const cached = cache.get<ContractReport>(cacheKey);
  if (cached) {
    return cached;
  }

  const { apiKey, baseUrl } = getEtherscanConfig();
  const chainId = options.chainId ?? getChainIdFallback();

  const params: Record<string, string | undefined> = {
    module: "contract",
    action: "getsourcecode",
    address: trimmed,
    apikey: apiKey
  };
  if (isV2ExplorerBase(baseUrl) && chainId) {
    params.chainid = String(chainId);
  }
  const url = buildUrlWithParams(normalizeBase(baseUrl), params);
  const data = await fetchJson<EtherscanSourceResponse>(url, { timeoutMs: 8_000 });
  const result = Array.isArray(data.result) ? data.result[0] : null;
  if (!result) {
    return null;
  }

  let sourceResult = result;
  if (options.fetchAbi && !result.ABI) {
    const abiParams: Record<string, string | undefined> = {
      module: "contract",
      action: "getabi",
      address: trimmed,
      apikey: apiKey
    };
    if (isV2ExplorerBase(baseUrl) && chainId) {
      abiParams.chainid = String(chainId);
    }
    const abiUrl = buildUrlWithParams(normalizeBase(baseUrl), abiParams);
    const abiData = await fetchJson<{ result?: string }>(abiUrl, {
      timeoutMs: 8_000
    });
    sourceResult = { ...result, ABI: abiData.result ?? result.ABI };
  }

  const report = buildContractReport(trimmed, sourceResult);
  cache.set(cacheKey, report);
  return report;
}
