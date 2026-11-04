import { useEffect, useState } from 'react'
import { getStockList } from '../api/stock'

export interface StockQuote {
  /** 등락률(%) — 홈 시세표와 같은 값 */
  fluctuate: number | null
  /** YYYYMMDD. 그날 종가 기준이다 */
  baseDate: string
}

/** 같은 탭에서 커뮤니티 목록 ↔ 글 상세를 오갈 때 다시 묻지 않는다(1분). 실패는 담지 않는다 */
const MEMO_MS = 60_000
let memo: { at: number; quotes: Promise<Map<string, StockQuote>> } | null = null

function loadQuotes(): Promise<Map<string, StockQuote>> {
  if (memo !== null && Date.now() - memo.at < MEMO_MS) return memo.quotes
  const quotes = getStockList().then(({ baseDate, stocks }) => new Map(stocks.map((stock) => [stock.stockCode, { fluctuate: stock.fluctuate, baseDate }])))
  memo = { at: Date.now(), quotes }
  quotes.catch(() => {
    memo = null
  })
  return quotes
}

/** 종목별 그날 등락률(`GET /api/stocks` — DB만 읽는다, 증권사 0건). 받는 100종목 밖이거나 못 받으면 그 종목은 이름만 선다 */
export function useStockQuotes(): Map<string, StockQuote> {
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(() => new Map())

  useEffect(() => {
    let isStale = false
    loadQuotes()
      .then((loaded) => {
        if (!isStale) setQuotes(loaded)
      })
      .catch((error: unknown) => {
        console.warn('커뮤니티 종목 등락률을 받지 못했습니다', error)
      })
    return () => {
      isStale = true
    }
  }, [])

  return quotes
}
