import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { fetchPriceCard } from "../../src/services/coingecko.js";

test("CoinGecko live: fetchPriceCard for bitcoin", async () => {
  const card = await fetchPriceCard("bitcoin", 5_000);
  assert.ok(card, "expected price card");
  assert.equal(card?.id, "bitcoin");
  assert.equal(card?.symbol, "btc");
  assert.ok(typeof card?.priceUSD === "number");
  assert.ok(card?.priceUSD && card.priceUSD > 0);
});
