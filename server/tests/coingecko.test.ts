import assert from "node:assert/strict";
import test from "node:test";
import { mapCoinGeckoMarket } from "../src/services/coingecko.js";
import type { CoinGeckoMarket } from "../src/services/coingecko.js";

test("mapCoinGeckoMarket maps CoinGecko market fields", () => {
  const sample: CoinGeckoMarket = {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 69321,
    price_change_percentage_24h: 1.23,
    market_cap: 1234567890,
    total_volume: 987654321
  };

  const card = mapCoinGeckoMarket(sample);
  assert.equal(card.id, "bitcoin");
  assert.equal(card.symbol, "btc");
  assert.equal(card.name, "Bitcoin");
  assert.equal(card.priceUSD, 69321);
  assert.equal(card.change24h, 1.23);
  assert.equal(card.mcapUSD, 1234567890);
  assert.equal(card.vol24hUSD, 987654321);
  assert.equal(
    card.sourceUrl,
    "https://www.coingecko.com/en/coins/bitcoin"
  );
});
