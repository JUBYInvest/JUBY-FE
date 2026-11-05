import { useEffect, useMemo, useState } from 'react'
import { useRealtime } from '../api/realtime'
import { getStockList } from '../api/stock'
import { basisLabel } from '../utils/priceBasis'

export interface StockQuote {
  /** 등락률(%) — 홈 시세표와 같은 값 */
  fluctuate: number | null
  /** 어느 때 값인가("10월 28일 종가 기준"·"실시간" — utils/priceBasis) */
  basis: string
}

/**
 * 종목별 등락률(`GET /api/stocks`를 홈과 같이 쓴다 — api/memo.ts shared). 장중에는 실시간 값으로 바꾼다.
 * 받는 100종목 밖이거나 못 받으면 그 종목은 이름만 선다
 */
export function useStockQuotes(): Map<string, StockQuote> {
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(() => new Map())
  const { prices } = useRealtime()

  useEffect(() => {
    let isStale = false
    getStockList()
      .then(({ stocks, ...basis }) => {
        const label = basisLabel(basis, false)
        if (!isStale) setQuotes(new Map(stocks.map((stock) => [stock.stockCode, { fluctuate: stock.fluctuate, basis: label }])))
      })
      .catch((error: unknown) => {
        console.warn('커뮤니티 종목 등락률을 받지 못했습니다', error)
      })
    return () => {
      isStale = true
    }
  }, [])

  return useMemo(() => {
    if (prices.size === 0) return quotes
    const next = new Map(quotes)
    for (const code of quotes.keys()) {
      const live = prices.get(code)
      if (live !== undefined) next.set(code, { fluctuate: live.changeRate, basis: '실시간' })
    }
    return next
  }, [quotes, prices])
}
