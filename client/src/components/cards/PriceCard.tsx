type PriceCardProps = {
  symbol: string;
  priceUSD: string;
  change24h?: string;
  mcapUSD?: string;
  volume24hUSD?: string;
};

export default function PriceCard({
  symbol,
  priceUSD,
  change24h,
  mcapUSD,
  volume24hUSD
}: PriceCardProps) {
  return (
    <div className="card price-card">
      <div className="card-title">{symbol} Price</div>
      <div className="price-row">
        <span className="price-value">{priceUSD}</span>
        {change24h ? <span className="price-change">{change24h}</span> : null}
      </div>
      <div className="price-meta">
        {mcapUSD ? <span>Market Cap {mcapUSD}</span> : null}
        {volume24hUSD ? <span>24h Vol {volume24hUSD}</span> : null}
      </div>
    </div>
  );
}
