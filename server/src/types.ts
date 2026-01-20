export type Intent =
  | "RISK"
  | "PRICE"
  | "NEWS"
  | "EXPLAIN"
  | "UNKNOWN";

export type Source = {
  id: number;
  title: string;
  url: string;
  type: "dex" | "explorer" | "news" | "market" | "other";
  snippet?: string;
};

export type ChatResponse = {
  intent: Intent;
  sessionId?: string;
  answer_md: string;
  cards: {
    price?: Record<string, unknown>;
    risk?: Record<string, unknown>;
    news?: Array<Record<string, unknown>>;
    walletTrace?: Record<string, unknown>;
  };
  sources: Source[];
  timestamp: string;
};
