import { samsungDailyCandles, samsungStockInfo } from "../data/samsungDaily";
import type { DailyCandle, StockInfo } from "../types/stock";

// 추후 DB 연동 필요: 현재는 하드코딩된 mock 데이터를 API 응답처럼 반환합니다.
export async function getStockInfo(stockCode: string): Promise<StockInfo> {
  if (stockCode !== samsungStockInfo.code) {
    return samsungStockInfo;
  }

  return samsungStockInfo;
}

// 추후 DB 연동 필요: `/api/stocks/${stockCode}/daily?period=1y` 형태의 백엔드 호출로 교체하면 됩니다.
export async function getDailyCandles(stockCode: string): Promise<DailyCandle[]> {
  if (stockCode !== samsungStockInfo.code) {
    return samsungDailyCandles;
  }

  return samsungDailyCandles;
}
