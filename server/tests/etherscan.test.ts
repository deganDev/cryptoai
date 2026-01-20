import assert from "node:assert/strict";
import test from "node:test";
import {
  scanAbiForRisks,
  buildContractReport,
  type EtherscanSourceResult
} from "../src/services/etherscan.js";

test("scanAbiForRisks finds risky functions in ABI", () => {
  const abi = JSON.stringify([
    { type: "function", name: "mint" },
    { type: "function", name: "setTaxFee" },
    { type: "function", name: "blacklistUser" },
    { type: "function", name: "pause" }
  ]);

  const risks = scanAbiForRisks(abi);
  const keywords = risks.map((risk) => risk.keyword);
  assert.ok(keywords.includes("mint"));
  assert.ok(keywords.includes("settax"));
  assert.ok(keywords.includes("blacklist"));
  assert.ok(keywords.includes("pause"));
});

test("buildContractReport maps etherscan metadata", () => {
  const source: EtherscanSourceResult = {
    SourceCode: "contract Test {}",
    ABI: "[]",
    ContractName: "Test",
    CompilerVersion: "v0.8.21",
    OptimizationUsed: "1",
    Runs: "200",
    Proxy: "1",
    Implementation: "0xabc"
  };

  const report = buildContractReport("0x123", source);
  assert.equal(report.verified, true);
  assert.equal(report.proxy, true);
  assert.equal(report.implementation, "0xabc");
  assert.equal(report.contractName, "Test");
  assert.equal(report.compilerVersion, "v0.8.21");
  assert.equal(report.optimizationUsed, true);
  assert.equal(report.runs, 200);
  assert.equal(report.sourceUrl, "https://etherscan.io/address/0x123#code");
});
