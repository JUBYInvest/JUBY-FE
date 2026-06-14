import type { DailyCandle, StockInfo } from "../../types/stock";
import { formatKRW, formatPercent, formatSignedKRW, getPriceChange } from "../../utils/chartFormat";

type PriceSummaryProps = {
  stock: StockInfo;
  candles: DailyCandle[];
};

export default function PriceSummary({ stock, candles }: PriceSummaryProps) {
  const latest = candles[candles.length - 1];
  const change = getPriceChange(candles);

  return (
    <section className="price-summary" aria-label={`${stock.name} 현재가`}>
      <div>
        <p className="stock-label">
          {stock.name} <span>{stock.code}</span>
        </p>
        <h1>{latest ? formatKRW(latest.close) : "-"}</h1>
        <p className={`price-change price-change-${change.direction}`}>
          전일 대비 {formatSignedKRW(change.amount)} {formatPercent(change.rate)}
        </p>
      </div>
      <dl className="market-stats">
        <div>
          <dt>시장</dt>
          <dd>{stock.market}</dd>
        </div>
        <div>
          <dt>고가</dt>
          <dd>{latest ? formatKRW(latest.high) : "-"}</dd>
        </div>
        <div>
          <dt>저가</dt>
          <dd>{latest ? formatKRW(latest.low) : "-"}</dd>
        </div>
      </dl>
    </section>
  );
}
