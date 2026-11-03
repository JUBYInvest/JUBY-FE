import { toKoreanDate } from './date'
import { isFiniteNumber } from './format'
import type { StockPreview } from '../types/stock'

/**
 * 목록 → 상세 링크에 싣는 state. 상세 화면이 응답을 기다리는 동안 이름·가격 자리를 먼저 채운다.
 * 홈 표·관심종목은 이름과 기준일 종가를, 카드·검색은 이름만 싣는다.
 */
export function toPreviewState(preview: StockPreview): { preview: StockPreview } {
  return { preview }
}

/**
 * 시세 한 줄(종가·등락률이 비어 올 수 있다)을 그 기준일과 함께 싣는다. 홈 시세표·주식 모아보기(지도·목록)·마이페이지 관심종목이 같이 쓴다 —
 * 네 곳에 같은 다섯 칸을 따로 적고 있었다(2026-11-03). 빈 값은 싣지 않는다(상세는 날짜 없는 가격을 쓰지 않는다 — readPreview)
 */
export function toQuotePreviewState(
  stock: { stockCode: string; stockName: string; closePrice: number | null; fluctuate: number | null },
  baseDate: string,
): { preview: StockPreview } {
  return toPreviewState({
    stockCode: stock.stockCode,
    stockName: stock.stockName,
    closePrice: stock.closePrice ?? undefined,
    fluctuate: stock.fluctuate ?? undefined,
    baseDate,
  })
}

/**
 * 상세 화면이 `location.state`에서 꺼낸다. 없거나 쓸 수 없으면 null.
 *
 * state는 주소 기록에 남아 새로고침·뒤로가기에도 살아 있고 모양을 보장할 수 없어서,
 * 종목코드가 지금 주소와 같은지와 값 모양을 확인한다. 가격은 **기준일과 함께 있을 때만**
 * 쓴다 — 날짜 없이 보여주면 현재가로 읽힌다.
 */
export function readPreview(state: unknown, stockCode: string): StockPreview | null {
  if (typeof state !== 'object' || state === null || !('preview' in state)) return null
  const preview: unknown = state.preview
  if (typeof preview !== 'object' || preview === null) return null

  const { stockCode: code, stockName, closePrice, fluctuate, baseDate } =
    preview as Record<string, unknown>
  if (code !== stockCode || typeof stockName !== 'string' || stockName.trim() === '') {
    return null
  }

  const result: StockPreview = { stockCode, stockName }
  if (isFiniteNumber(closePrice) && typeof baseDate === 'string' && toKoreanDate(baseDate) !== '') {
    result.closePrice = closePrice
    result.baseDate = baseDate
    if (isFiniteNumber(fluctuate)) result.fluctuate = fluctuate
  }
  return result
}
