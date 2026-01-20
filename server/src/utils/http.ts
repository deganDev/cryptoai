import { setDefaultResultOrder } from "node:dns";

try {
  setDefaultResultOrder("ipv4first");
} catch {
  // ignore if unsupported
}

export type HttpError = Error & {
  status?: number;
  url?: string;
  body?: string;
};

type FetchJsonOptions = RequestInit & {
  timeoutMs?: number;
};

function buildError(
  message: string,
  status: number | undefined,
  url: string,
  body?: string
): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  err.url = url;
  if (body) {
    err.body = body;
  }
  return err;
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const { timeoutMs, ...init } = options;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeoutId = timeoutMs
    ? setTimeout(() => controller?.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller?.signal
    });

    const text = await response.text();
    if (!response.ok) {
      throw buildError(
        `Request failed with status ${response.status}`,
        response.status,
        url,
        text
      );
    }

    try {
      return text ? (JSON.parse(text) as T) : ({} as T);
    } catch (error) {
      throw buildError("Failed to parse JSON response", response.status, url, text);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw buildError("Request timed out", undefined, url);
    }
    if (error instanceof Error) {
      throw buildError(error.message, undefined, url);
    }
    throw buildError("Unknown request error", undefined, url);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
