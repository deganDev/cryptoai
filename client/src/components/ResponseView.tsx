import { useMemo, useState } from "react";
import type { ChatResponse, Source } from "../types";
import ChatInput from "./ChatInput";
import ResponseTabs from "./ResponseTabs";

type ResponseViewProps = {
  prompt: string;
  response: ChatResponse | null;
  answer: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isSearching: boolean;
  isTyping: boolean;
  error?: string | null;
  showInput?: boolean;
};

type ResponseBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

function formatSourceTitle(source: Source) {
  const title = source.title.trim();
  if (!title) {
    return source.url.replace(/^https?:\/\//, "");
  }
  return title.length > 42 ? `${title.slice(0, 42)}...` : title;
}

function getSourceHost(source: Source) {
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url.replace(/^https?:\/\//, "").split("/")[0] ?? "source";
  }
}

function renderInline(text: string) {
  const urlRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/g;
  const linkify = (segment: string) => {
    const parts = segment.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        const href = part.startsWith("http") ? part : `https://${part}`;
        return (
          <a key={`${part}-${index}`} href={href} target="_blank" rel="noreferrer">
            {part}
          </a>
        );
      }
      return part;
    });
  };
  const parts = text.split("**");
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={`${part}-${index}`}>{linkify(part)}</strong>
    ) : (
      linkify(part)
    )
  );
}

function renderValue(value: unknown, depth = 0): JSX.Element {
  if (value === null) {
    return <span className="json-null">null</span>;
  }
  if (typeof value === "string") {
    return <span className="json-string">{renderInline(value)}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="json-primitive">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="json-empty">[]</span>;
    }
    return (
      <details className="json-collapsible">
        <summary>{`Array (${value.length})`}</summary>
        <div className="json-list">
          {value.map((item, index) => (
            <div className="json-list-item" key={`item-${depth}-${index}`}>
              {renderValue(item, depth + 1)}
            </div>
          ))}
        </div>
      </details>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) {
      return <span className="json-empty">{`{}`}</span>;
    }
    return (
      <div className="json-object">
        {entries.map(([key, item]) => (
          <div className="json-row" key={`${key}-${depth}`}>
            <span className="json-key">{key}</span>
            <span className="json-sep">:</span>
            <span className="json-value">{renderValue(item, depth + 1)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="json-primitive">{String(value)}</span>;
}

function renderExtraSections(response: ChatResponse | null) {
  if (!response) {
    return null;
  }
  const excluded = new Set([
    "intent",
    "answer_md",
    "sources",
    "timestamp",
    "sessionId",
    "cards"
  ]);
  const entries = Object.entries(response).filter(([key]) => !excluded.has(key));
  const cards = response.cards;
  const hasCards = Boolean(cards && Object.keys(cards).length > 0);
  if (!entries.length && !hasCards) {
    return null;
  }
  return (
    <div className="json-sections">
      <h1 className="json-title">Trace</h1>
      {cards ? (
        <div className="json-card-grid">
          {Object.entries(cards)
            .filter(([cardKey]) => cardKey !== "news")
            .map(([cardKey, cardValue]) => {
              if (cardKey === "risk") {
                const riskLevel =
                  (cardValue as { report?: { riskLevel?: string } })?.report
                    ?.riskLevel ?? "N/A";
                return (
                  <div className="json-card" key={cardKey}>
                    <h3>Risk</h3>
                    <div className="json-card-value">{`Risk: ${riskLevel}`}</div>
                  </div>
                );
              }
              if (cardKey === "walletTrace") {
                const traceReport =
                  (cardValue as { report?: { level?: string; score?: number } })
                    ?.report ?? null;
                return (
                  <details className="json-card json-collapsible" key={cardKey}>
                    <summary>
                      WalletTrace
                      {traceReport?.level
                        ? ` (${traceReport.level} ${traceReport.score ?? ""})`
                        : ""}
                    </summary>
                    {renderValue(cardValue)}
                  </details>
                );
              }
              return (
                <div className="json-card" key={cardKey}>
                  <h3>{cardKey}</h3>
                  {renderValue(cardValue)}
                </div>
              );
            })}
        </div>
      ) : null}
      {entries.map(([key, value]) => (
        <div className="json-section" key={key}>
          <h2 className="json-section-title">{key}</h2>
          {renderValue(value)}
        </div>
      ))}
    </div>
  );
}

function parseMarkdownBlocks(markdown: string): ResponseBlock[] {
  const sanitized = markdown
    .replace(/Sources:\s*\*?\*?\[[^\]]+\]\*?\*?/gi, "")
    .replace(/Sources:\s*(?:\[[^\]]+\]\s*)+/gi, "")
    .trim();
  const blocks = sanitized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const parsed: ResponseBlock[] = [];

  for (const block of blocks) {
    const lines = block.split(/\n/).map((line) => line.trim());
    const headingMatch = lines[0]?.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      parsed.push({ type: "heading", text: headingMatch[2] });
      const remaining = lines.slice(1).filter(Boolean);
      if (remaining.length > 0) {
        parsed.push({ type: "paragraph", text: remaining.join(" ") });
      }
      continue;
    }

    const listItems = lines.filter((line) => line.startsWith("- "));
    if (listItems.length === lines.length && listItems.length > 0) {
      parsed.push({
        type: "list",
        items: listItems.map((item) => item.replace(/^-\s+/, ""))
      });
      continue;
    }

    parsed.push({ type: "paragraph", text: lines.join(" ") });
  }

  return parsed;
}

export default function ResponseView({
  prompt,
  response,
  answer,
  draft,
  onDraftChange,
  onSubmit,
  isLoading,
  isSearching,
  isTyping,
  error,
  showInput = false
}: ResponseViewProps) {
  const [activeTab, setActiveTab] = useState<"response" | "sources">("response");

  const sources = useMemo(() => response?.sources ?? [], [response]);
  const blocks = useMemo(() => parseMarkdownBlocks(answer ?? ""), [answer]);
  const showSources = sources.length > 0 && !isSearching && !isLoading;
  const showSkeleton = isLoading || isSearching;

  return (
    <section className="response-view">
      <div className="prompt-line">{prompt}</div>
      <div className="response-tabs-row">
        <div className="tab-rail" />
        <ResponseTabs active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "response" ? (
        <>
          {showSources ? (
            <div className="sources-card">
              <div className="sources-row">
                <div className="sources-track">
                  {sources.map((source) => (
                    <a
                      className="source-card"
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="source-brand">
                        <span className="source-dot" />
                        <span>{getSourceHost(source).toUpperCase()}</span>
                      </div>
                      <div className="source-title">{formatSourceTitle(source)}</div>
                    </a>
                  ))}
                </div>
                <button className="sources-arrow" type="button" aria-label="Next">
                  &gt;
                </button>
              </div>
            </div>
          ) : null}

          {showSkeleton ? (
            <div className="response-skeleton">
              <div className="search-pill">
                <span className="search-dot" />
                Searching the web...
              </div>
              <div className="shimmer-block">
                <div className="shimmer-line long" />
                <div className="shimmer-line medium" />
              </div>
              <div className="shimmer-block">
                <div className="shimmer-line long" />
                <div className="shimmer-line medium" />
                <div className="shimmer-line short" />
              </div>
              <div className="shimmer-block">
                <div className="shimmer-line medium" />
                <div className="shimmer-line long" />
                <div className="shimmer-line short" />
              </div>
              <div className="shimmer-block list">
                <div className="shimmer-dot" />
                <div className="shimmer-line medium" />
                <div className="shimmer-line long" />
                <div className="shimmer-line short" />
              </div>
            </div>
          ) : null}

          {!showSkeleton ? (
            <div className="response-body">
              {blocks.map((block, index) => {
                if (block.type === "heading") {
                return (
                  <div className="response-section" key={`${block.text}-${index}`}>
                    <h3>{renderInline(block.text)}</h3>
                  </div>
                );
              }
              if (block.type === "list") {
                return (
                  <div className="response-section" key={`list-${index}`}>
                    <ul>
                      {block.items.map((item) => (
                        <li key={item}>{renderInline(item)}</li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return (
                <div className="response-section" key={`${block.text}-${index}`}>
                  <p>{renderInline(block.text)}</p>
                </div>
              );
            })}
            {isTyping ? <span className="typing-caret" /> : null}
          </div>
          ) : null}
        </>
      ) : (
        <div className="sources-panel">
          {sources.map((source, index) => (
            <a
              key={source.id}
              className="source-detail"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <div className="source-detail-header">
                <span className="source-index">{index + 1}.</span>
                <span className="source-chip">{getSourceHost(source)}</span>
              </div>
              <div className="source-detail-title">{formatSourceTitle(source)}</div>
              {source.snippet ? (
                <div className="source-detail-snippet">{source.snippet}</div>
              ) : null}
              <div className="source-detail-desc">{source.url}</div>
            </a>
          ))}
        </div>
      )}

      {renderExtraSections(response)}

      {showInput ? (
        <div className="response-input">
          <ChatInput
            value={draft}
            onChange={onDraftChange}
            onSubmit={onSubmit}
            disabled={isLoading}
          />
          {error ? <div className="error-text">{error}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
