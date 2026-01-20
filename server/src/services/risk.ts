import type { DexPairReport } from "./dexscreener.js";
import type { PriceCard } from "./coingecko.js";
import type { AbiRisk, ContractReport } from "./etherscan.js";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RiskFlag = {
  id: string;
  severity: RiskLevel;
  score: number;
  label: string;
  rationale: string;
};

export type RiskReport = {
  riskLevel: RiskLevel;
  score: number;
  flags: RiskFlag[];
};

type RiskInputs = {
  pair?: DexPairReport | null;
  contract?: ContractReport | null;
  market?: PriceCard | null;
};

const ABI_RISK_SCORES: Record<
  string,
  { score: number; severity: RiskLevel; label: string }
> = {
  mint: { score: 35, severity: "HIGH", label: "Minting functions" },
  blacklist: { score: 35, severity: "HIGH", label: "Blacklist control" },
  pause: { score: 25, severity: "MEDIUM", label: "Pause control" },
  settax: { score: 25, severity: "MEDIUM", label: "Transfer tax controls" },
  setfee: { score: 25, severity: "MEDIUM", label: "Transfer fee controls" },
  setmax: { score: 20, severity: "MEDIUM", label: "Max transaction controls" },
  setrouter: { score: 20, severity: "MEDIUM", label: "Router control" },
  setpair: { score: 20, severity: "MEDIUM", label: "Pair control" },
  whitelist: { score: 15, severity: "LOW", label: "Whitelist control" },
  ownership: { score: 10, severity: "LOW", label: "Ownership control" }
};

const MAX_SCORE = 100;

function clampScore(score: number): number {
  if (score <= 0) {
    return 0;
  }
  if (score >= MAX_SCORE) {
    return MAX_SCORE;
  }
  return Math.round(score);
}

function resolveRiskLevel(score: number): RiskLevel {
  if (score >= 70) {
    return "HIGH";
  }
  if (score >= 40) {
    return "MEDIUM";
  }
  return "LOW";
}

function addFlag(flags: RiskFlag[], flag: RiskFlag): void {
  flags.push(flag);
}

function addAbiRiskFlags(flags: RiskFlag[], abiRisks: AbiRisk[]): void {
  abiRisks.forEach((risk) => {
    const key = risk.keyword.toLowerCase();
    const mapped = ABI_RISK_SCORES[key];
    if (!mapped) {
      return;
    }
    addFlag(flags, {
      id: `abi:${key}`,
      severity: mapped.severity,
      score: mapped.score,
      label: mapped.label,
      rationale: risk.rationale
    });
  });
}

export function buildRiskReport(inputs: RiskInputs): RiskReport {
  const flags: RiskFlag[] = [];
  const pair = inputs.pair ?? null;
  const contract = inputs.contract ?? null;
  const market = inputs.market ?? null;

  if (pair) {
    const liquidity = pair.liquidityUSD ?? null;
    if (liquidity !== null) {
      if (liquidity < 10_000) {
        addFlag(flags, {
          id: "liquidity:very-low",
          severity: "HIGH",
          score: 45,
          label: "Very low liquidity",
          rationale: "Liquidity below $10k can signal fragility and slippage."
        });
      } else if (liquidity < 50_000) {
        addFlag(flags, {
          id: "liquidity:low",
          severity: "MEDIUM",
          score: 25,
          label: "Low liquidity",
          rationale: "Liquidity below $50k can make exits difficult."
        });
      }
    } else {
      addFlag(flags, {
        id: "liquidity:missing",
        severity: "HIGH",
        score: 35,
        label: "Liquidity data unavailable",
        rationale: "Missing liquidity data makes it hard to assess exit risk."
      });
    }

    const fdv = pair.fdvUSD ?? null;
    if (liquidity && fdv) {
      const ratio = fdv / liquidity;
      if (Number.isFinite(ratio) && ratio > 200) {
        addFlag(flags, {
          id: "fdv:liquidity",
          severity: "MEDIUM",
          score: 20,
          label: "High FDV-to-liquidity ratio",
          rationale: "FDV vs liquidity suggests heavy dilution risk."
        });
      }
    }

    const volume = pair.volume24hUSD ?? null;
    if (volume !== null) {
      if (volume < 5_000) {
        addFlag(flags, {
          id: "volume:very-low",
          severity: "MEDIUM",
          score: 20,
          label: "Very low 24h volume",
          rationale: "Low trading volume can indicate limited liquidity and exit risk."
        });
      } else if (volume < 25_000) {
        addFlag(flags, {
          id: "volume:low",
          severity: "LOW",
          score: 10,
          label: "Low 24h volume",
          rationale: "Low volume can make price discovery unreliable."
        });
      }
    }

    const change24h = pair.change24h ?? null;
    if (change24h !== null && Math.abs(change24h) >= 50) {
      addFlag(flags, {
        id: "price:volatile",
        severity: "MEDIUM",
        score: 20,
        label: "High 24h volatility",
        rationale: "Large 24h swings can signal unstable liquidity or heavy speculation."
      });
    }

    const createdAt = pair.pairCreatedAt ?? null;
    if (createdAt) {
      const ageMs = Date.now() - createdAt;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      if (ageMs > 0 && ageMs < sevenDaysMs) {
        addFlag(flags, {
          id: "pair:new",
          severity: "MEDIUM",
          score: 15,
          label: "New pair",
          rationale: "Very recent pairs have limited trading history."
        });
      }
    }

    const buys = pair.buys24h ?? null;
    const sells = pair.sells24h ?? null;
    if (buys !== null && sells !== null && sells < 5 && buys > 100) {
      addFlag(flags, {
        id: "flow:buys-sells",
        severity: "HIGH",
        score: 25,
        label: "Buys heavily outweigh sells",
        rationale: "Large buy/sell imbalance can indicate honeypot behavior."
      });
    }

    const socials = pair.socials?.length ?? 0;
    const websites = pair.websites?.length ?? 0;
    if (socials + websites === 0) {
      addFlag(flags, {
        id: "socials:missing",
        severity: "LOW",
        score: 10,
        label: "No socials or website",
        rationale: "Missing public links can make vetting harder."
      });
    }
    if (buys !== null && sells !== null && buys + sells < 10) {
      addFlag(flags, {
        id: "flow:thin",
        severity: "LOW",
        score: 10,
        label: "Very thin trading activity",
        rationale: "Low transaction counts can indicate weak market interest."
      });
    }
  }

  if (market) {
    const mcap = market.mcapUSD ?? null;
    if (mcap !== null) {
      if (mcap < 10_000) {
        addFlag(flags, {
          id: "mcap:very-low",
          severity: "HIGH",
          score: 40,
          label: "Very low market cap",
          rationale: "Market cap below $10k can signal extreme fragility."
        });
      } else if (mcap < 50_000) {
        addFlag(flags, {
          id: "mcap:low",
          severity: "MEDIUM",
          score: 20,
          label: "Low market cap",
          rationale: "Low market cap can make price action more volatile."
        });
      }
    }
  }

  if (contract) {
    if (!contract.verified) {
      addFlag(flags, {
        id: "contract:unverified",
        severity: "HIGH",
        score: 25,
        label: "Unverified contract",
        rationale: "Unverified source code reduces transparency."
      });
    }
    if (contract.proxy) {
      addFlag(flags, {
        id: "contract:proxy",
        severity: "MEDIUM",
        score: 10,
        label: "Proxy contract",
        rationale: "Proxy patterns can allow upgrades and hidden changes."
      });
    }
    addAbiRiskFlags(flags, contract.abiRisks ?? []);
  }

  const score = clampScore(flags.reduce((total, flag) => total + flag.score, 0));
  const orderedFlags = flags
    .slice()
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  return {
    riskLevel: resolveRiskLevel(score),
    score,
    flags: orderedFlags
  };
}
