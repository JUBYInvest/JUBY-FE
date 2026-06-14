import type { CandlestickData, HistogramData, LineData, Time } from "lightweight-charts";
import type { DailyCandle, PriceChange } from "../types/stock";

export function formatKRW(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatSignedKRW(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatCompactVolume(value: number) {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}억`;
  }

  if (value >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`;
  }

  return value.toLocaleString("ko-KR");
}

export function getPriceChange(candles: DailyCandle[]): PriceChange {
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  if (!latest || !previous) {
    return { amount: 0, rate: 0, direction: "flat" };
  }

  const amount = latest.close - previous.close;
  const rate = (amount / previous.close) * 100;
  const direction = amount > 0 ? "up" : amount < 0 ? "down" : "flat";

  return { amount, rate, direction };
}

export function toCandlestickData(candles: DailyCandle[]): CandlestickData<Time>[] {
  return candles.map((candle) => ({
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

export function toVolumeData(candles: DailyCandle[]): HistogramData<Time>[] {
  return candles.map((candle) => ({
    time: candle.time as Time,
    value: candle.volume,
    color: candle.close >= candle.open ? "rgba(233, 64, 87, 0.42)" : "rgba(33, 102, 209, 0.36)",
  }));
}

export function getMovingAverageData(candles: DailyCandle[], period: number): LineData<Time>[] {
  return candles.flatMap((candle, index) => {
    if (index < period - 1) {
      return [];
    }

    const slice = candles.slice(index - period + 1, index + 1);
    const value = slice.reduce((sum, item) => sum + item.close, 0) / period;

    return [
      {
        time: candle.time as Time,
        value: Math.round(value),
      },
    ];
  });
}
