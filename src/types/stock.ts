export type Market = "KOSPI" | "KOSDAQ";

export type DailyCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockInfo = {
  name: string;
  code: string;
  market: Market;
};

export type PriceChange = {
  amount: number;
  rate: number;
  direction: "up" | "down" | "flat";
};
