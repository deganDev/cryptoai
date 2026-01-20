import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveDexPair } from "../../src/services/dexscreener.js";
import { buildRiskReport } from "../../src/services/risk.js";

test("Risk live: buildRiskReport from DexScreener data", async () => {
  const pair = await resolveDexPair("ethereum");
  assert.ok(pair, "expected a DexScreener pair");

  const report = buildRiskReport({ pair });
  assert.ok(["LOW", "MEDIUM", "HIGH"].includes(report.riskLevel));
  assert.ok(report.score >= 0);
  assert.ok(Array.isArray(report.flags));
});
