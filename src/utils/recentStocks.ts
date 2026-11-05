import { readJson, writeJson } from './cache'
import { isStockCode } from '../api/stock'
import type { StockInfo } from '../types/stock'

/**
 * 최근 본 종목. 종목 상세를 열면 맨 앞에 넣고(같은 종목은 한 줄), 홈 검색창이 비어 있을 때 후보 자리에 보인다.
 * **이 브라우저에만** 있다(8개). 로그인과 상관없이 남는다 — 비로그인으로 본 종목도 이 브라우저의 방문 기록이라서다.
 * 검색창의 "기록 지우기"로 지운다.
 */
const KEY = 'recentStocks'
const MAX_ENTRIES = 8

function isEntry(value: unknown): value is StockInfo {
  if (typeof value !== 'object' || value === null) return false
  const { stockCode, stockName } = value as Record<string, unknown>
  return typeof stockCode === 'string' && isStockCode(stockCode) && typeof stockName === 'string' && stockName.trim() !== ''
}

/** 최근 본 순. 모양이 틀린 줄은 빼고 읽는다 */
export function readRecentStocks(): StockInfo[] {
  const saved = readJson(KEY)
  if (!Array.isArray(saved)) return []
  return saved.filter(isEntry).slice(0, MAX_ENTRIES)
}

export function rememberStock(stock: StockInfo): void {
  const others = readRecentStocks().filter((row) => row.stockCode !== stock.stockCode)
  writeJson(KEY, [{ stockCode: stock.stockCode, stockName: stock.stockName }, ...others].slice(0, MAX_ENTRIES))
}

export function forgetRecentStocks(): void {
  writeJson(KEY, [])
}
