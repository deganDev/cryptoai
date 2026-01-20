import assert from "node:assert/strict";
import test from "node:test";
import {
  selectBestPair,
  type DexScreenerPair
} from "../src/services/dexscreener.js";

test("selectBestPair prefers liquidity, falls back to volume", () => {
  const pairs: DexScreenerPair[] = [
    {
      chainId: "ethereum",
      dexId: "uniswap",
      pairAddress: "0x111",
      url: "https://dexscreener.com/ethereum/0x111",
      baseToken: { address: "0xaaa", name: "AAA", symbol: "AAA" },
      quoteToken: { address: "0xbbb", name: "BBB", symbol: "BBB" },
      liquidity: { usd: 120 },
      volume: { h24: 1000 }
    },
    {
      chainId: "ethereum",
      dexId: "uniswap",
      pairAddress: "0x222",
      url: "https://dexscreener.com/ethereum/0x222",
      baseToken: { address: "0xccc", name: "CCC", symbol: "CCC" },
      quoteToken: { address: "0xddd", name: "DDD", symbol: "DDD" },
      liquidity: { usd: 450 },
      volume: { h24: 200 }
    }
  ];

  const best = selectBestPair(pairs);
  assert.equal(best?.pairAddress, "0x222");

  const volumePairs: DexScreenerPair[] = [
    {
      chainId: "bsc",
      dexId: "pancake",
      pairAddress: "0x333",
      url: "https://dexscreener.com/bsc/0x333",
      baseToken: { address: "0xeee", name: "EEE", symbol: "EEE" },
      quoteToken: { address: "0xfff", name: "FFF", symbol: "FFF" },
      volume: { h24: 500 }
    },
    {
      chainId: "bsc",
      dexId: "pancake",
      pairAddress: "0x444",
      url: "https://dexscreener.com/bsc/0x444",
      baseToken: { address: "0xggg", name: "GGG", symbol: "GGG" },
      quoteToken: { address: "0xhhh", name: "HHH", symbol: "HHH" },
      volume: { h24: 2000 }
    }
  ];

  const bestByVolume = selectBestPair(volumePairs);
  assert.equal(bestByVolume?.pairAddress, "0x444");
});
