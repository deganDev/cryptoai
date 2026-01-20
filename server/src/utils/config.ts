import { readFileSync } from "node:fs";

export type ChainConfig = {
  id: string;
  label: string;
  explorer: "etherscan" | "bscscan";
  chainId?: number;
};

export type AppConfig = {
  chains: ChainConfig[];
  llm: {
    providers: Array<"openai" | "gemini">;
  };
};

const DEFAULT_CONFIG: AppConfig = {
  chains: [
    { id: "ethereum", label: "Ethereum", explorer: "etherscan", chainId: 1 }
  ],
  llm: {
    providers: ["openai", "gemini"]
  }
};

export function loadConfig(): AppConfig {
  try {
    const raw = readFileSync(new URL("../../config.json", import.meta.url), "utf-8");
    const parsed = JSON.parse(raw) as AppConfig;
    if (!parsed.chains || !Array.isArray(parsed.chains)) {
      throw new Error("config.json missing chains array");
    }
    if (!parsed.llm || !Array.isArray(parsed.llm.providers)) {
      throw new Error("config.json missing llm.providers array");
    }
    return parsed;
  } catch {
    return DEFAULT_CONFIG;
  }
}
