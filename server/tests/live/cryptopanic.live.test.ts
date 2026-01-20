import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { fetchNewsBrief } from "../../src/services/cryptopanic.js";

test("CryptoPanic live: fetchNewsBrief returns headlines", async () => {
  const headlines = await fetchNewsBrief(["BTC", "ETH", "BNB"], 5);
  assert.ok(headlines.length > 0, "expected at least one headline");
  const first = headlines[0];
  assert.ok(first?.title);
  assert.ok(first?.url?.startsWith("http"));
});
