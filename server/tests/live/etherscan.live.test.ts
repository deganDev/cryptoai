import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { fetchContractReport } from "../../src/services/etherscan.js";

const USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

test("Etherscan live: fetchContractReport for USDT", async () => {
  const report = await fetchContractReport(USDT_CONTRACT, {
    fetchAbi: true
  });
  assert.ok(report, "expected contract report");
  assert.equal(report?.address.toLowerCase(), USDT_CONTRACT.toLowerCase());
  assert.ok(report?.sourceUrl.includes("etherscan.io"));
});
