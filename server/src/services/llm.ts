import type { Intent, Source } from "../types.js";
import type { PriceCard } from "./coingecko.js";
import type { DexPairReport } from "./dexscreener.js";
import type { NewsHeadline } from "./cryptopanic.js";
import type { ContractReport } from "./etherscan.js";
import type { RiskReport } from "./risk.js";
import type { WalletTraceReport } from "./walletTracer.js";
import {
  getGeminiConfig,
  getLlmProviders,
  getOpenAiConfig
} from "../utils/env.js";
import { fetchJson } from "../utils/http.js";

export type LlmContext = {
  intent: Intent;
  message: string;
  price?: PriceCard | null;
  pair?: DexPairReport | null;
  risk?: RiskReport | null;
  contract?: ContractReport | null;
  news?: NewsHeadline[] | null;
  walletTrace?: WalletTraceReport | null;
  sources: Source[];
  notes?: string[];
};

type LlmResponse = {
  content: string;
  provider: "openai" | "gemini" | "template";
};

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2
});

function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const formatter = Math.abs(value) >= 1_000_000 ? USD_COMPACT : USD_FORMATTER;
  return formatter.format(value);
}

function formatPercent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatSources(sources: Source[]): string {
  if (!sources.length) {
    return "Sources: (none)";
  }
  const ids = sources.map((source) => `[${source.id}]`).join(" ");
  return `Sources: **${ids}**`;
}

function buildTemplateAnswer(context: LlmContext): string {
  const { intent } = context;
  const lines: string[] = [];

  if (intent === "PRICE") {
    const price = context.price;
    const priceUsd = formatUsd(price?.priceUSD);
    const change = formatPercent(price?.change24h ?? null);
    const mcap = formatUsd(price?.mcapUSD ?? null);
    const vol = formatUsd(price?.vol24hUSD ?? null);
    const name = price?.name ?? price?.symbol?.toUpperCase() ?? "Token";
    const summaryParts = [];
    if (priceUsd) {
      summaryParts.push(`trades at ${priceUsd}`);
    }
    if (change) {
      summaryParts.push(`(${change} over 24h)`);
    }
    if (mcap) {
      summaryParts.push(`with a market cap of ${mcap}`);
    }
    const summary =
      summaryParts.length > 0
        ? `${name} ${summaryParts.join(" ")}.`
        : `${name} market snapshot is currently unavailable.`;
    lines.push(summary);
    lines.push("");
    lines.push("**Key stats**");
    lines.push(`- Price: ${priceUsd ?? "N/A"}`);
    lines.push(`- 24h change: ${change ?? "N/A"}`);
    lines.push(`- Market cap: ${mcap ?? "N/A"}`);
    lines.push(`- 24h volume: ${vol ?? "N/A"}`);

    if (context.pair) {
      const pair = context.pair;
      const pairPrice = formatUsd(pair.priceUSD ?? null);
      const pairLiquidity = formatUsd(pair.liquidityUSD ?? null);
      const pairVolume = formatUsd(pair.volume24hUSD ?? null);
      lines.push("");
      lines.push("**DEX pair snapshot**");
      lines.push(`- Chain: ${pair.chainId}`);
      lines.push(`- DEX: ${pair.dexId}`);
      lines.push(`- Pair: ${pair.baseToken.symbol}/${pair.quoteToken.symbol}`);
      lines.push(`- Pair price: ${pairPrice ?? "N/A"}`);
      lines.push(`- Liquidity: ${pairLiquidity ?? "N/A"}`);
      lines.push(`- 24h volume: ${pairVolume ?? "N/A"}`);
    }
  } else if (intent === "RISK") {
    const risk = context.risk;
    const verdict =
      risk?.riskLevel && typeof risk.score === "number"
        ? `${risk.riskLevel} risk (score ${risk.score}/100)`
        : "Risk assessment unavailable";
    lines.push(`Risk snapshot: ${verdict}.`);
    const flags = risk?.flags?.slice(0, 3) ?? [];
    if (flags.length) {
      lines.push("");
      lines.push("**Why**");
      flags.forEach((flag) => {
        lines.push(`- ${flag.label}: ${flag.rationale}`);
      });
    }

    const pair = context.pair;
    const stats: string[] = [];
    if (pair) {
      const liquidity = formatUsd(pair.liquidityUSD ?? null);
      const volume = formatUsd(pair.volume24hUSD ?? null);
      const fdv = formatUsd(pair.fdvUSD ?? null);
      if (liquidity) {
        stats.push(`Liquidity: ${liquidity}`);
      }
      if (volume) {
        stats.push(`Volume 24h: ${volume}`);
      }
      if (fdv) {
        stats.push(`FDV: ${fdv}`);
      }
      if (pair.buys24h !== null && pair.sells24h !== null) {
        stats.push(`Buys/Sells 24h: ${pair.buys24h}/${pair.sells24h}`);
      }
    }
    if (stats.length) {
      lines.push("");
      lines.push(`**Key stats**: ${stats.join(" | ")}`);
    }

    const checked: string[] = [];
    if (pair) {
      checked.push("DEX pair metrics");
    }
    if (context.contract) {
      checked.push("Contract source");
    }
    if (checked.length) {
      lines.push("");
      lines.push(`**What I checked**: ${checked.join(" + ")}`);
    }
    lines.push("");
    lines.push(
      "**Next steps**: Verify liquidity locks, owner controls, and top holders."
    );
  } else if (intent === "NEWS") {
    const headlines = context.news ?? [];
    const summary =
      headlines.length > 0
        ? `Here are the latest headlines tied to your request.`
        : "No recent headlines found for this query.";
    lines.push(summary);
    lines.push("");
    lines.push("**Top headlines**");
    if (headlines.length) {
      headlines.forEach((headline) => {
        const source = headline.source ? ` (${headline.source})` : "";
        lines.push(`- ${headline.title}${source}`);
      });
    } else {
      lines.push("- No recent headlines found.");
    }
  } else if (intent === "EXPLAIN") {
    const trace = context.walletTrace;
    if (trace) {
      const balance = trace.nativeBalance?.amount;
      const balanceSymbol = trace.nativeBalance?.symbol ?? "";
      const balanceText =
        typeof balance === "number"
          ? `${balance.toFixed(4)} ${balanceSymbol}`.trim()
          : "N/A";
      const totalIn =
        typeof trace.totalInUsd === "number"
          ? formatUsd(trace.totalInUsd)
          : null;
      const totalOut =
        typeof trace.totalOutUsd === "number"
          ? formatUsd(trace.totalOutUsd)
          : null;
      const summaryParts = [
        `${trace.totalTransfers} transfers`,
        `${trace.uniqueCounterparties} counterparties`,
        `${trace.hops.length} hops`,
        `balance ${balanceText}`
      ];
      if (totalIn) {
        summaryParts.push(`total in ${totalIn}`);
      }
      if (totalOut) {
        summaryParts.push(`total out ${totalOut}`);
      }
      lines.push(`Trace summary: ${summaryParts.join(", ")} on ${trace.chainLabel}.`);
      lines.push("");
      lines.push("**Top incoming transfers**");
      if (trace.topIncoming.length) {
        trace.topIncoming.forEach((transfer) => {
          const amount =
            formatUsd(transfer.usdValue ?? null) ??
            `${transfer.amount.toFixed(4)} ${transfer.asset.symbol}`;
          lines.push(
            `- ${amount} from ${transfer.counterparty}`
          );
        });
      } else {
        lines.push("- N/A");
      }
      lines.push("");
      lines.push("**Top outgoing transfers**");
      if (trace.topOutgoing.length) {
        trace.topOutgoing.forEach((transfer) => {
          const amount =
            formatUsd(transfer.usdValue ?? null) ??
            `${transfer.amount.toFixed(4)} ${transfer.asset.symbol}`;
          lines.push(
            `- ${amount} to ${transfer.counterparty}`
          );
        });
      } else {
        lines.push("- N/A");
      }
      lines.push("");
      if (trace.report?.flags?.length) {
        lines.push("**Trace signals**");
        trace.report.flags.slice(0, 4).forEach((flag) => {
          lines.push(`- ${flag.label}: ${flag.rationale}`);
        });
        lines.push("");
      }
      lines.push(
        "Tracing is limited to 2 hops and does not cover mixers, bridges, or off-chain activity."
      );
    } else {
      lines.push("Summary: No additional explanation available yet.");
    }
  } else {
    lines.push("Summary: Ask about a token, price, risk, news, or wallet trace.");
  }

  if (context.notes && context.notes.length) {
    lines.push("");
    lines.push("**Notes**");
    context.notes.forEach((note) => {
      lines.push(`- ${note}`);
    });
  }

  lines.push("");
  lines.push("Not financial advice.");
  lines.push(formatSources(context.sources));
  return lines.join("\n");
}

function buildPrompt(context: LlmContext): { system: string; user: string } {
  const system =
    "You format crypto tool outputs into a concise markdown response. " +
    "Start with 1-2 sentences of human-readable summary, then include short bullet sections. " +
    "Use ONLY the provided data. Do NOT invent facts, numbers, or sources. " +
    "If notes are provided, include them under a 'Notes' section. " +
    'Include "Not financial advice." and add citations in the form: Sources: **[1] [2]**.';
  const user = JSON.stringify(context, null, 2);
  return { system, user };
}

async function callOpenAi(context: LlmContext): Promise<string | null> {
  const { apiKey } = getOpenAiConfig();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const { system, user } = buildPrompt(context);
  const data = await fetchJson<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    }),
    timeoutMs: 12_000
  });
  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function callGemini(context: LlmContext): Promise<string | null> {
  const { apiKey } = getGeminiConfig();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const { system, user } = buildPrompt(context);
  const data = await fetchJson<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }>(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey ?? ""
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${system}\n\n${user}` }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      }),
      timeoutMs: 12_000
    }
  );
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

function hasInvalidCitations(content: string, sources: Source[]): boolean {
  const matches = content.match(/\[(\d+)\]/g) ?? [];
  if (!matches.length) {
    return true;
  }
  const ids = new Set(
    matches.map((match) => Number(match.replace(/\D/g, ""))).filter((id) => id > 0)
  );
  if (!ids.size) {
    return true;
  }
  const allowed = new Set(sources.map((source) => source.id));
  return Array.from(ids).some((id) => !allowed.has(id));
}

function violatesContext(content: string, context: LlmContext): boolean {
  const lowered = content.toLowerCase();
  if (!context.pair && /dex|pair|liquidity|fdv|buys|sells/.test(lowered)) {
    return true;
  }
  if (!context.contract && /contract|proxy|verified|abi/.test(lowered)) {
    return true;
  }
  if (!context.news?.length && /headline|news|articles?/.test(lowered)) {
    return true;
  }
  if (!context.walletTrace && /trace|hop|counterpart/.test(lowered)) {
    return true;
  }
  return false;
}

function missingDisclaimer(content: string): boolean {
  return !/not financial advice/i.test(content);
}

function missingNotes(content: string, notes?: string[]): boolean {
  if (!notes || notes.length === 0) {
    return false;
  }
  const lowered = content.toLowerCase();
  return notes.some((note) => !lowered.includes(note.toLowerCase()));
}

export async function writeAnswer(context: LlmContext): Promise<LlmResponse> {
  const providers = getLlmProviders();
  if (!providers.length) {
    return { content: buildTemplateAnswer(context), provider: "template" };
  }

  for (const provider of providers) {
    try {
      if (provider === "openai") {
        const content = await callOpenAi(context);
        if (content) {
          if (
            hasInvalidCitations(content, context.sources) ||
            violatesContext(content, context) ||
            missingDisclaimer(content) ||
            missingNotes(content, context.notes)
          ) {
            continue;
          }
          return { content, provider: "openai" };
        }
      }
      if (provider === "gemini") {
        const content = await callGemini(context);
        if (content) {
          if (
            hasInvalidCitations(content, context.sources) ||
            violatesContext(content, context) ||
            missingDisclaimer(content) ||
            missingNotes(content, context.notes)
          ) {
            continue;
          }
          return { content, provider: "gemini" };
        }
      }
    } catch {
      // try next provider
    }
  }

  return { content: buildTemplateAnswer(context), provider: "template" };
}
