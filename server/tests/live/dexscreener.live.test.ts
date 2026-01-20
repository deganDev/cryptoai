import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveDexPair } from "../../src/services/dexscreener.js";

test("DexScreener live: resolveDexPair for bitcoin", async () => {
  const pair = await resolveDexPair("bitcoin");
  assert.ok(pair, "expected pair report");
  assert.ok(pair?.url?.includes("dexscreener.com"));
  assert.ok(pair?.baseToken?.symbol);
  assert.ok(pair?.quoteToken?.symbol);
});
