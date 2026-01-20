import assert from "node:assert/strict";
import test from "node:test";
import { traceWallet } from "../src/services/walletTracer.js";

type MockResponse = {
  status?: number;
  body: unknown;
};

function jsonResponse(body: unknown, status = 200): MockResponse {
  return { status, body };
}

function buildFetchMock(handler: (url: URL) => MockResponse) {
  return async (input: RequestInfo | URL) => {
    const url = input instanceof URL ? input : new URL(input.toString());
    const match = handler(url);
    return {
      ok: match.status ? match.status >= 200 && match.status < 300 : true,
      status: match.status ?? 200,
      async text() {
        return JSON.stringify(match.body);
      }
    } as Response;
  };
}

test("traceWallet returns hop 0 for ETH address and filters contracts by default", async () => {
  const originalApiKey = process.env.ETHERSCAN_API_KEY;
  const originalBase = process.env.ETHERSCAN_BASE;
  process.env.ETHERSCAN_API_KEY = "RQNSFUUZT6CXVRYM95H2DD2IXQJDR8GUUR";
  process.env.ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
  const fixedNow = new Date("2024-01-02T00:00:00Z").getTime();
  const originalNow = Date.now;
  Date.now = () => fixedNow;

  const address = "0x237DeE529A47750bEcdFa8A59a1D766e3e7B5F91";
  const counterpartyEoa = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const counterpartyContract = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const handler = (url: URL): MockResponse => {
    const action = url.searchParams.get("action");
    const reqAddress = url.searchParams.get("address")?.toLowerCase();
    if (action === "txlist" && reqAddress === address.toLowerCase()) {
      return jsonResponse({
        result: [
          {
            hash: "0xhash1",
            timeStamp: String(
              Math.floor((fixedNow - 2 * 60 * 60 * 1000) / 1000)
            ),
            from: address,
            to: counterpartyContract,
            value: "1000000000000000000",
            isError: "0"
          },
          {
            hash: "0xhash2",
            timeStamp: String(Math.floor((fixedNow - 60 * 60 * 1000) / 1000)),
            from: counterpartyEoa,
            to: address,
            value: "2000000000000000000",
            isError: "0"
          }
        ]
      });
    }
    if (action === "tokentx" && reqAddress === address.toLowerCase()) {
      return jsonResponse({ result: [] });
    }
    if (action === "getsourcecode" && reqAddress === counterpartyContract) {
      return jsonResponse({
        result: [{ ABI: "Contract source code not verified", SourceCode: "" }]
      });
    }
    if (action === "getsourcecode" && reqAddress === counterpartyEoa) {
      return jsonResponse({
        result: [{ ABI: "", SourceCode: "", ContractName: "" }]
      });
    }
    throw new Error(`Unexpected fetch: ${url.toString()}`);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = buildFetchMock(handler) as typeof fetch;

  try {
    const report = await traceWallet(address, { maxHops: 0 });
    assert.ok(report);
    assert.equal(report?.hops.length, 1);
    assert.equal(report?.hops[0]?.hop, 0);
    assert.equal(report?.hops[0]?.address, address.toLowerCase());
    assert.equal(report?.hops[0]?.transfers.length, 1);
    assert.equal(report?.hops[0]?.transfers[0]?.counterparty, counterpartyEoa);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalApiKey === undefined) {
      delete process.env.ETHERSCAN_API_KEY;
    } else {
      process.env.ETHERSCAN_API_KEY = originalApiKey;
    }
    if (originalBase === undefined) {
      delete process.env.ETHERSCAN_BASE;
    } else {
      process.env.ETHERSCAN_BASE = originalBase;
    }
  }
});

test("traceWallet honors explicit date range override", async () => {
  const originalApiKey = process.env.ETHERSCAN_API_KEY;
  const originalBase = process.env.ETHERSCAN_BASE;
  process.env.ETHERSCAN_API_KEY = "RQNSFUUZT6CXVRYM95H2DD2IXQJDR8GUUR";
  process.env.ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";
  const fixedNow = new Date("2024-01-02T00:00:00Z").getTime();
  const originalNow = Date.now;
  Date.now = () => fixedNow;

  const address = "0x237DeE529A47750bEcdFa8A59a1D766e3e7B5F91";
  const counterparty = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const handler = (url: URL): MockResponse => {
    const action = url.searchParams.get("action");
    const reqAddress = url.searchParams.get("address")?.toLowerCase();
    if (action === "txlist" && reqAddress === address.toLowerCase()) {
      return jsonResponse({
        result: [
          {
            hash: "0xhash3",
            timeStamp: String(
              Math.floor((fixedNow - 30 * 60 * 60 * 1000) / 1000)
            ),
            from: address,
            to: counterparty,
            value: "1000000000000000000",
            isError: "0"
          }
        ]
      });
    }
    if (action === "tokentx" && reqAddress === address.toLowerCase()) {
      return jsonResponse({ result: [] });
    }
    if (action === "getsourcecode" && reqAddress === counterparty) {
      return jsonResponse({
        result: [{ ABI: "", SourceCode: "", ContractName: "" }]
      });
    }
    throw new Error(`Unexpected fetch: ${url.toString()}`);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = buildFetchMock(handler) as typeof fetch;

  try {
    const report = await traceWallet(address, {
      maxHops: 0,
      startTime: "2023-12-31T00:00:00Z",
      endTime: "2024-01-02T00:00:00Z"
    });
    assert.ok(report);
    assert.equal(report?.hops[0]?.transfers.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    if (originalApiKey === undefined) {
      delete process.env.ETHERSCAN_API_KEY;
    } else {
      process.env.ETHERSCAN_API_KEY = originalApiKey;
    }
    if (originalBase === undefined) {
      delete process.env.ETHERSCAN_BASE;
    } else {
      process.env.ETHERSCAN_BASE = originalBase;
    }
  }
});
