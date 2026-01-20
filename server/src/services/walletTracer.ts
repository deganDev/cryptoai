import { TTLCache } from "../utils/cache.js";
import type { ChainConfig } from "../utils/config.js";
import {
  getBscScanConfig,
  getEtherscanConfig,
  getSupportedChains
} from "../utils/env.js";
import { fetchJson } from "../utils/http.js";

type ExplorerTx = {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError?: string;
  txreceipt_status?: string;
};

type ExplorerTokenTx = ExplorerTx & {
  tokenSymbol?: string;
  tokenName?: string;
  tokenDecimal?: string;
  contractAddress?: string;
};

type ExplorerResponse<T> = {
  status?: string;
  message?: string;
  result?: T[] | string;
};

export type WalletTransfer = {
  hash: string;
  timestamp: string;
  from: string;
  to: string;
  direction: "in" | "out";
  counterparty: string;
  asset: {
    type: "native" | "token";
    symbol: string;
    address?: string;
    decimals?: number;
  };
  amount: number;
  usdValue: number | null;
  explorerUrl: string;
};

export type WalletTraceHop = {
  hop: number;
  address: string;
  transfers: WalletTransfer[];
};

export type WalletTraceReport = {
  address: string;
  chainId?: number;
  chainLabel: string;
  nativeBalance?: {
    amount: number | null;
    usdValue: number | null;
    symbol: string;
  };
  totalInUsd: number | null;
  totalOutUsd: number | null;
  topIncoming: WalletTransfer[];
  topOutgoing: WalletTransfer[];
  report: TraceReport;
  hops: WalletTraceHop[];
  totalTransfers: number;
  uniqueCounterparties: number;
  sources: Array<{ title: string; url: string }>;
};

export type TraceLevel = "LOW" | "MEDIUM" | "HIGH";

export type TraceFlag = {
  id: string;
  severity: TraceLevel;
  score: number;
  label: string;
  rationale: string;
};

export type TraceReport = {
  level: TraceLevel;
  score: number;
  flags: TraceFlag[];
};

export type WalletTraceOptions = {
  chainId?: number;
  chain?: string;
  maxHops?: number;
  maxTransfers?: number;
  maxCounterparties?: number;
  minUsd?: number;
  nativeUsdPrice?: number;
  stablecoinSymbols?: string[];
  startTime?: string | number | Date;
  endTime?: string | number | Date;
  ignoreContractAddresses?: boolean;
};

const cache = new TTLCache(20_000);
const contractCache = new TTLCache(60_000);

const DEFAULT_STABLES = [
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "USDP",
  "FRAX"
];
const NATIVE_SYMBOLS: Record<string, string> = {
  ethereum: "ETH"
};

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

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function isValidAddress(address: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(normalizeAddress(address));
}

function resolveChain(options: WalletTraceOptions): ChainConfig | null {
  const chains = getSupportedChains();
  if (options.chainId) {
    return chains.find((chain) => chain.chainId === options.chainId) ?? null;
  }
  if (options.chain) {
    const needle = options.chain.toLowerCase();
    return (
      chains.find((chain) => chain.id.toLowerCase() === needle) ??
      chains.find((chain) => chain.label.toLowerCase() === needle) ??
      null
    );
  }
  return chains.find((chain) => chain.id === "ethereum") ?? chains[0] ?? null;
}

function getExplorerConfig(chain: ChainConfig) {
  if (chain.explorer === "bscscan") {
    return getBscScanConfig();
  }
  return getEtherscanConfig();
}

function buildExplorerSite(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.startsWith("api.")
      ? parsed.hostname.slice(4)
      : parsed.hostname;
    return `${parsed.protocol}//${hostname}`;
  } catch {
    return baseUrl.replace(/\/api\/?$/, "").replace(/\/v2\/api\/?$/, "");
  }
}

function buildExplorerAddressUrl(baseUrl: string, address: string): string {
  return `${buildExplorerSite(baseUrl)}/address/${address}`;
}

function buildExplorerTxUrl(baseUrl: string, hash: string): string {
  return `${buildExplorerSite(baseUrl)}/tx/${hash}`;
}

function parseNumber(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUnits(value: string, decimals: number): number {
  const normalized = value.replace(/^0+/, "") || "0";
  if (decimals <= 0) {
    return parseNumber(normalized) ?? 0;
  }
  const padded = normalized.padStart(decimals + 1, "0");
  const integerPart = padded.slice(0, -decimals);
  const fractionPart = padded.slice(-decimals).replace(/0+$/, "");
  const combined = fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
  return parseNumber(combined) ?? 0;
}

function parseTimestamp(value: string): string {
  const seconds = parseNumber(value) ?? 0;
  const ms = seconds * 1000;
  return new Date(ms).toISOString();
}

function parseDateInput(input?: string | number | Date): number | null {
  if (input instanceof Date) {
    const ms = input.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input === "string") {
    const ms = Date.parse(input);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function resolveTimeWindow(options: WalletTraceOptions): {
  startMs: number;
  endMs: number;
} {
  const now = Date.now();
  const explicitStart = parseDateInput(options.startTime);
  const explicitEnd = parseDateInput(options.endTime);
  if (explicitStart !== null || explicitEnd !== null) {
    const endMs = explicitEnd ?? now;
    const startMs =
      explicitStart ?? Math.max(0, endMs - 24 * 60 * 60 * 1000);
    return { startMs, endMs };
  }
  return { startMs: now - 24 * 60 * 60 * 1000, endMs: now };
}

function hasExplicitTimeWindow(options: WalletTraceOptions): boolean {
  return (
    parseDateInput(options.startTime) !== null ||
    parseDateInput(options.endTime) !== null
  );
}

function shouldSkipTx(tx: ExplorerTx): boolean {
  if (tx.isError === "1" || tx.txreceipt_status === "0") {
    return true;
  }
  return false;
}

function estimateUsdValue(
  transfer: WalletTransfer,
  options: WalletTraceOptions
): number | null {
  const stableSymbols = new Set(
    (options.stablecoinSymbols ?? DEFAULT_STABLES).map((symbol) =>
      symbol.toUpperCase()
    )
  );
  if (transfer.asset.type === "token") {
    if (stableSymbols.has(transfer.asset.symbol.toUpperCase())) {
      return transfer.amount;
    }
    return null;
  }
  if (typeof options.nativeUsdPrice === "number") {
    return transfer.amount * options.nativeUsdPrice;
  }
  return null;
}

function applyUsdFilter(
  transfers: WalletTransfer[],
  options: WalletTraceOptions
): WalletTransfer[] {
  if (typeof options.minUsd !== "number") {
    return transfers;
  }
  return transfers.filter(
    (transfer) =>
      typeof transfer.usdValue === "number" && transfer.usdValue >= options.minUsd!
  );
}

function applyTimeFilter(
  transfers: WalletTransfer[],
  options: WalletTraceOptions
): WalletTransfer[] {
  const { startMs, endMs } = resolveTimeWindow(options);
  return transfers.filter((transfer) => {
    const ts = Date.parse(transfer.timestamp);
    return Number.isFinite(ts) && ts >= startMs && ts <= endMs;
  });
}

async function isContractAddress(
  address: string,
  chain: ChainConfig
): Promise<boolean> {
  const normalized = normalizeAddress(address);
  if (!isValidAddress(normalized)) {
    return false;
  }
  const cacheKey = `contract:${chain.id}:${normalized}`;
  const cached = contractCache.get<boolean>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const config = getExplorerConfig(chain);
  const baseUrl = normalizeBase(config.baseUrl);
  const params: Record<string, string | undefined> = {
    module: "contract",
    action: "getsourcecode",
    address: normalized,
    apikey: config.apiKey
  };
  if (isV2ExplorerBase(baseUrl) && chain.chainId) {
    params.chainid = String(chain.chainId);
  }
  const url = buildUrlWithParams(baseUrl, params);
  const data = await fetchJson<ExplorerResponse<Record<string, string>>>(url, {
    timeoutMs: 8_000
  });
  const result = Array.isArray(data.result) ? data.result[0] : null;
  const abi = result?.ABI ?? "";
  const source = result?.SourceCode ?? "";
  const contractName = result?.ContractName ?? "";
  const isContract =
    Boolean(source) ||
    Boolean(contractName) ||
    (typeof abi === "string" &&
      abi.toLowerCase().includes("contract source code not verified"));
  contractCache.set(cacheKey, isContract);
  return isContract;
}

async function applyContractFilter(
  transfers: WalletTransfer[],
  chain: ChainConfig,
  options: WalletTraceOptions
): Promise<WalletTransfer[]> {
  if (options.ignoreContractAddresses === false) {
    return transfers;
  }
  const counterparties = Array.from(
    new Set(transfers.map((transfer) => transfer.counterparty))
  );
  if (!counterparties.length) {
    return transfers;
  }
  const checks = await Promise.all(
    counterparties.map(async (counterparty) => ({
      counterparty,
      isContract: await isContractAddress(counterparty, chain)
    }))
  );
  const contractSet = new Set(
    checks.filter((item) => item.isContract).map((item) => item.counterparty)
  );
  if (!contractSet.size) {
    return transfers;
  }
  return transfers.filter(
    (transfer) => !contractSet.has(transfer.counterparty)
  );
}

async function fetchAccountTransfers(
  address: string,
  chain: ChainConfig,
  options: WalletTraceOptions
): Promise<WalletTransfer[]> {
  const config = getExplorerConfig(chain);
  const baseUrl = normalizeBase(config.baseUrl);
  const maxTransfers = Math.max(10, options.maxTransfers ?? 25);
  const stableSymbols = (options.stablecoinSymbols ?? DEFAULT_STABLES)
    .map((symbol) => symbol.toUpperCase())
    .sort()
    .join(",");
  const { startMs, endMs } = resolveTimeWindow(options);
  const cacheKey = `wallettrace:${chain.id}:${address}:${maxTransfers}:${
    options.minUsd ?? "none"
  }:${options.nativeUsdPrice ?? "none"}:${stableSymbols}:${startMs}:${endMs}:${
    options.ignoreContractAddresses === false ? "contracts" : "no-contracts"
  }`;
  const cached = cache.get<WalletTransfer[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const fetchLimit = Math.min(100, Math.max(20, maxTransfers * 2));
  const commonParams: Record<string, string | undefined> = {
    address,
    page: "1",
    offset: String(fetchLimit),
    sort: "desc",
    apikey: config.apiKey
  };
  if (isV2ExplorerBase(baseUrl) && chain.chainId) {
    commonParams.chainid = String(chain.chainId);
  }

  const txUrl = buildUrlWithParams(baseUrl, {
    module: "account",
    action: "txlist",
    ...commonParams
  });
  const tokenUrl = buildUrlWithParams(baseUrl, {
    module: "account",
    action: "tokentx",
    ...commonParams
  });

  const [txData, tokenData] = await Promise.all([
    fetchJson<ExplorerResponse<ExplorerTx>>(txUrl, { timeoutMs: 8_000 }),
    fetchJson<ExplorerResponse<ExplorerTokenTx>>(tokenUrl, { timeoutMs: 8_000 })
  ]);

  const txs = Array.isArray(txData.result) ? txData.result : [];
  const tokenTxs = Array.isArray(tokenData.result) ? tokenData.result : [];
  const normalizedAddress = normalizeAddress(address);
  const explorerBase = buildExplorerSite(baseUrl);

  const transfers: WalletTransfer[] = [];

  txs.forEach((tx) => {
    if (shouldSkipTx(tx)) {
      return;
    }
    if (!tx.hash || !tx.from || !tx.to) {
      return;
    }
    if (tx.value === "0") {
      return;
    }
    const direction =
      normalizeAddress(tx.to) === normalizedAddress ? "in" : "out";
    const counterparty =
      direction === "in" ? normalizeAddress(tx.from) : normalizeAddress(tx.to);
    const amount = formatUnits(tx.value, 18);
    const transfer: WalletTransfer = {
      hash: tx.hash,
      timestamp: parseTimestamp(tx.timeStamp),
      from: normalizeAddress(tx.from),
      to: normalizeAddress(tx.to),
      direction,
      counterparty,
      asset: {
        type: "native",
        symbol: NATIVE_SYMBOLS[chain.id] ?? chain.label.toUpperCase()
      },
      amount,
      usdValue: null,
      explorerUrl: buildExplorerTxUrl(explorerBase, tx.hash)
    };
    transfer.usdValue = estimateUsdValue(transfer, options);
    transfers.push(transfer);
  });

  tokenTxs.forEach((tx) => {
    if (shouldSkipTx(tx)) {
      return;
    }
    const symbol = tx.tokenSymbol?.trim();
    if (!tx.hash || !tx.from || !tx.to || !symbol) {
      return;
    }
    const direction =
      normalizeAddress(tx.to) === normalizedAddress ? "in" : "out";
    const counterparty =
      direction === "in" ? normalizeAddress(tx.from) : normalizeAddress(tx.to);
    const decimals = parseNumber(tx.tokenDecimal ?? "") ?? 0;
    const amount = formatUnits(tx.value ?? "0", decimals);
    const transfer: WalletTransfer = {
      hash: tx.hash,
      timestamp: parseTimestamp(tx.timeStamp),
      from: normalizeAddress(tx.from),
      to: normalizeAddress(tx.to),
      direction,
      counterparty,
      asset: {
        type: "token",
        symbol,
        address: tx.contractAddress?.toLowerCase(),
        decimals
      },
      amount,
      usdValue: null,
      explorerUrl: buildExplorerTxUrl(explorerBase, tx.hash)
    };
    transfer.usdValue = estimateUsdValue(transfer, options);
    transfers.push(transfer);
  });

  const timeFiltered = applyTimeFilter(transfers, options);
  const effectiveTimeFiltered =
    !hasExplicitTimeWindow(options) && !timeFiltered.length && transfers.length
      ? transfers
      : timeFiltered;
  const contractFiltered = await applyContractFilter(
    effectiveTimeFiltered,
    chain,
    options
  );
  const usdFiltered = applyUsdFilter(contractFiltered, options);
  const sorted = usdFiltered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const limited = sorted.slice(0, maxTransfers);
  cache.set(cacheKey, limited);
  return limited;
}

async function fetchNativeBalance(
  address: string,
  chain: ChainConfig
): Promise<number | null> {
  const config = getExplorerConfig(chain);
  const baseUrl = normalizeBase(config.baseUrl);
  const cacheKey = `wallettrace:balance:${chain.id}:${address}`;
  const cached = cache.get<number | null>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const params: Record<string, string | undefined> = {
    module: "account",
    action: "balance",
    address,
    tag: "latest",
    apikey: config.apiKey
  };
  if (isV2ExplorerBase(baseUrl) && chain.chainId) {
    params.chainid = String(chain.chainId);
  }
  const url = buildUrlWithParams(baseUrl, params);
  const data = await fetchJson<ExplorerResponse<string>>(url, { timeoutMs: 8_000 });
  const raw = typeof data.result === "string" ? data.result : null;
  if (!raw) {
    cache.set(cacheKey, null);
    return null;
  }
  const balance = formatUnits(raw, 18);
  cache.set(cacheKey, balance);
  return balance;
}

function sumUsd(transfers: WalletTransfer[], direction: "in" | "out"): number | null {
  const totals = transfers
    .filter((transfer) => transfer.direction === direction)
    .map((transfer) => transfer.usdValue)
    .filter((value): value is number => typeof value === "number");
  if (!totals.length) {
    return null;
  }
  return totals.reduce((sum, value) => sum + value, 0);
}

function pickTopTransfers(
  transfers: WalletTransfer[],
  direction: "in" | "out",
  limit: number
): WalletTransfer[] {
  const scored = transfers
    .filter((transfer) => transfer.direction === direction)
    .map((transfer) => ({
      transfer,
      score: transfer.usdValue ?? transfer.amount
    }))
    .filter((item) => Number.isFinite(item.score));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.transfer);
}

function pickTopCounterparties(
  transfers: WalletTransfer[],
  limit: number
): string[] {
  const scores = new Map<string, number>();
  transfers.forEach((transfer) => {
    const score = transfer.usdValue ?? transfer.amount;
    const current = scores.get(transfer.counterparty) ?? 0;
    if (score > current) {
      scores.set(transfer.counterparty, score);
    }
  });
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([address]) => address);
}

function resolveTraceLevel(score: number): TraceLevel {
  if (score >= 60) {
    return "HIGH";
  }
  if (score >= 30) {
    return "MEDIUM";
  }
  return "LOW";
}

function buildTraceReport(inputs: {
  totalTransfers: number;
  uniqueCounterparties: number;
  incomingCount: number;
  outgoingCount: number;
  totalInUsd: number | null;
  totalOutUsd: number | null;
}): TraceReport {
  const flags: TraceFlag[] = [];

  if (inputs.totalTransfers === 0) {
    flags.push({
      id: "activity:none",
      severity: "LOW",
      score: 5,
      label: "No recent activity",
      rationale: "No transfers were found for the selected window."
    });
  }

  if (inputs.totalTransfers >= 50) {
    flags.push({
      id: "activity:high",
      severity: "LOW",
      score: 10,
      label: "High activity",
      rationale: "Large number of transfers can indicate active routing."
    });
  }

  if (inputs.uniqueCounterparties <= 2 && inputs.totalTransfers >= 10) {
    flags.push({
      id: "counterparties:concentrated",
      severity: "MEDIUM",
      score: 15,
      label: "Concentrated counterparties",
      rationale: "Most activity is with a small set of addresses."
    });
  }

  if (inputs.incomingCount >= 10 && inputs.incomingCount >= inputs.outgoingCount * 2) {
    flags.push({
      id: "flow:inflow-heavy",
      severity: "MEDIUM",
      score: 15,
      label: "Inflow-heavy wallet",
      rationale: "Incoming transfers significantly outweigh outgoing."
    });
  }

  if (inputs.outgoingCount >= 10 && inputs.outgoingCount >= inputs.incomingCount * 2) {
    flags.push({
      id: "flow:outflow-heavy",
      severity: "MEDIUM",
      score: 15,
      label: "Outflow-heavy wallet",
      rationale: "Outgoing transfers significantly outweigh incoming."
    });
  }

  if (typeof inputs.totalOutUsd === "number" && inputs.totalOutUsd >= 1_000_000) {
    flags.push({
      id: "flow:large-out",
      severity: "MEDIUM",
      score: 15,
      label: "Large outflows",
      rationale: "Significant value moved out in the observed window."
    });
  }

  if (typeof inputs.totalInUsd === "number" && inputs.totalInUsd >= 1_000_000) {
    flags.push({
      id: "flow:large-in",
      severity: "LOW",
      score: 10,
      label: "Large inflows",
      rationale: "Significant value moved in during the observed window."
    });
  }

  const score = Math.min(
    100,
    Math.round(flags.reduce((total, flag) => total + flag.score, 0))
  );

  return {
    level: resolveTraceLevel(score),
    score,
    flags: flags.sort((a, b) => b.score - a.score)
  };
}

export async function traceWallet(
  address: string,
  options: WalletTraceOptions = {}
): Promise<WalletTraceReport | null> {
  if (!isValidAddress(address)) {
    return null;
  }
  const chain = resolveChain(options);
  if (!chain) {
    return null;
  }

  const maxHops = Math.min(2, Math.max(0, options.maxHops ?? 2));
  const maxCounterparties = Math.max(2, options.maxCounterparties ?? 5);
  const normalizedAddress = normalizeAddress(address);
  const visited = new Set<string>();
  const queue: Array<{ hop: number; address: string }> = [
    { hop: 0, address: normalizedAddress }
  ];
  const hops: WalletTraceHop[] = [];
  const sources = new Map<string, string>();
  const allCounterparties = new Set<string>();

  const explorerBase = buildExplorerSite(getExplorerConfig(chain).baseUrl);

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.address)) {
      continue;
    }
    visited.add(current.address);

    const transfers = await fetchAccountTransfers(
      current.address,
      chain,
      options
    );
    if (!transfers.length) {
      continue;
    }

    hops.push({ hop: current.hop, address: current.address, transfers });

    sources.set(
      `address:${current.address}`,
      buildExplorerAddressUrl(explorerBase, current.address)
    );
    transfers.forEach((transfer) => {
      sources.set(`tx:${transfer.hash}`, transfer.explorerUrl);
      allCounterparties.add(transfer.counterparty);
    });

    if (current.hop >= maxHops) {
      continue;
    }

    const nextAddresses = pickTopCounterparties(transfers, maxCounterparties);
    nextAddresses.forEach((counterparty) => {
      if (!visited.has(counterparty)) {
        queue.push({ hop: current.hop + 1, address: counterparty });
      }
    });
  }

  const totalTransfers = hops.reduce(
    (total, hop) => total + hop.transfers.length,
    0
  );
  const allTransfers = hops.flatMap((hop) => hop.transfers);
  const incomingCount = allTransfers.filter(
    (transfer) => transfer.direction === "in"
  ).length;
  const outgoingCount = allTransfers.filter(
    (transfer) => transfer.direction === "out"
  ).length;
  const totalInUsd = sumUsd(allTransfers, "in");
  const totalOutUsd = sumUsd(allTransfers, "out");
  const nativeBalance = await fetchNativeBalance(normalizedAddress, chain);
  const nativeSymbol = NATIVE_SYMBOLS[chain.id] ?? chain.label.toUpperCase();
  const nativeBalanceUsd =
    typeof options.nativeUsdPrice === "number"
      ? (nativeBalance ?? 0) * options.nativeUsdPrice
      : null;
  const report = buildTraceReport({
    totalTransfers,
    uniqueCounterparties: allCounterparties.size,
    incomingCount,
    outgoingCount,
    totalInUsd,
    totalOutUsd
  });

  return {
    address: normalizedAddress,
    chainId: chain.chainId,
    chainLabel: chain.label,
    nativeBalance: {
      amount: nativeBalance,
      usdValue: nativeBalanceUsd,
      symbol: nativeSymbol
    },
    totalInUsd,
    totalOutUsd,
    topIncoming: pickTopTransfers(allTransfers, "in", 5),
    topOutgoing: pickTopTransfers(allTransfers, "out", 5),
    report,
    hops,
    totalTransfers,
    uniqueCounterparties: allCounterparties.size,
    sources: Array.from(sources.entries()).map(([key, url]) => ({
      title: key.startsWith("address:")
        ? `Explorer address ${key.split(":")[1]}`
        : `Transaction ${key.split(":")[1]}`,
      url
    }))
  };
}
