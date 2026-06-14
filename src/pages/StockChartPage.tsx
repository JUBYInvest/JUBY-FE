import { useEffect, useState } from "react";
import ChartToolbar from "../components/chart/ChartToolbar";
import PriceSummary from "../components/chart/PriceSummary";
import StockChart from "../components/chart/StockChart";
import { samsungStockInfo } from "../data/samsungDaily";
import { getDailyCandles, getStockInfo } from "../services/stockApi";
import type { DailyCandle, StockInfo } from "../types/stock";

export default function StockChartPage() {
  const [stock, setStock] = useState<StockInfo>(samsungStockInfo);
  const [candles, setCandles] = useState<DailyCandle[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadSamsungChart() {
      const [stockInfo, dailyCandles] = await Promise.all([getStockInfo("005930"), getDailyCandles("005930")]);

      if (!isMounted) {
        return;
      }

      setStock(stockInfo);
      setCandles(dailyCandles);
    }

    loadSamsungChart();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="stock-chart-page">
      <div className="stock-chart-layout">
        <PriceSummary stock={stock} candles={candles} />
        <div className="chart-shell">
          <ChartToolbar />
          <StockChart candles={candles} />
        </div>
      </div>
    </main>
  );
}
