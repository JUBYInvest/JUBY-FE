import { readCardSeries } from './cardSeries'
import { canSpendKisCall, getLeadingStocks, getStockDetail, primeKisToken } from './stock'
import { readCache, writeCache } from '../utils/cache'
import { isFiniteNumber } from '../utils/format'
import type { CardSeries, LeadingStocks, TopTheme } from '../types/stock'

/*
 * 홈 상단 "테마별 대표 종목" 카드의 데이터.
 *
 * - 어떤 종목인지: GET /api/stocks/leading-stocks (DB)
 * - 종가: 홈 시세표 GET /api/stocks (DB)
 * - 1년 그래프: 종목 상세 GET /api/stocks/{code}?period=ONE_YEAR (일봉은 DB, 그 앞에 증권사 현재가)
 *
 * 그래프 일봉도 DB에 있지만, 그걸 꺼내 주는 API가 상세 하나뿐이고 그 API가 증권사 현재가부터 묻는다.
 * 서버에 저장된 증권사 토큰이 없으면(주말) 그 현재가가 서버 전체에서 1분에 1번만 돼서, 2026-10-04에는
 * 2·3번 카드가 비었고 그래프를 한때 뺐다(5da71f7). 같은 날 사용자 결정으로 되살리며 이렇게 막는다.
 * - 받은 그래프는 다음 일봉 배치까지 담아 두고 다시 묻지 않는다(api/cardSeries.ts). 상세를 본 종목도 담긴다.
 * - 로그인했으면 먼저 토큰을 심는다(primeKisToken) — 그러면 카드도 상세도 1분 제한 없이 된다.
 * - 그 밖에는 서버에 토큰이 있을 때만 묻는다(canSpendKisCall). 없으면 카드는 그래프 없이 선다 —
 *   카드 그래프가 그 1분을 써 버리면 사용자가 바로 누른 종목이 1분 넘게 기다린다.
 */

/**
 * 서버에서 대장주를 못 받았을 때 쓰는 고정 목록.
 *
 * 2026-10-04에 leading-stocks로 갈아탔다. 그 전에는 이 셋이 유일한 목록이어서 대장이 바뀌면
 * 코드를 고쳐 배포해야 했다. 지금은 첫 방문의 첫 그림과, 서버가 못 줄 때만 쓴다.
 * 수익률은 서버만 알므로 비워 둔다 — 카드는 이름과 종가만 보이고 수익률 자리는 "–"가 된다.
 */
export const FALLBACK_THEMES: TopTheme[] = [
  { stockCode: '000660', stockName: 'SK하이닉스', theme: '기술주 대장', returnRate: null, tradeCount: null },
  { stockCode: '012450', stockName: '한화에어로스페이스', theme: '방산주 대장', returnRate: null, tradeCount: null },
  { stockCode: '207940', stockName: '삼성바이오로직스', theme: '바이오주 대장', returnRate: null, tradeCount: null },
]

/** 서버가 못 줬을 때의 자리. 머리말은 근거를 지어내지 않고 예전 문구로 둔다 */
export const FALLBACK_LEADING: LeadingStocks = {
  basis: { strategyName: null, periodLabel: null },
  themes: FALLBACK_THEMES,
}

/*
 * 키를 예전('topThemes')과 다르게 둔다. 예전 값에는 수익률이 없어서, 같은 키로 읽으면
 * 첫 그림에서 수익률 자리가 "–"로 떴다가 바뀐다. 새 키는 그런 반쪽 값을 아예 읽지 않는다.
 */
const LEADING_CACHE_KEY = 'leadingStocks'
/** 서버 배치가 새벽 4시에 하루 한 번 다시 고르므로 반나절 묵은 값도 첫 그림으로는 충분하다 */
const LEADING_CACHE_MAX_AGE = 12 * 60 * 60 * 1000

/**
 * 지난 방문에서 받아 둔 대장주. 첫 그림을 즉시 그리는 용도다.
 * 이 값을 띄운 뒤에도 loadLeading()이 새 값을 받아 갈아끼운다.
 *
 * 모양이 하나라도 틀리면(예전 버전이 다른 모양으로 저장, 사람이 손댄 값) 없는 셈 친다.
 * 그대로 그리면 카드가 던져 홈 상단이 오류 화면이 되고, 새로고침해도 같은 값을 읽어 반나절 안 열렸다.
 */
export function readCachedLeading(): LeadingStocks | null {
  const cached = readCache<unknown>(LEADING_CACHE_KEY, LEADING_CACHE_MAX_AGE)
  if (typeof cached !== 'object' || cached === null) return null

  const { basis, themes } = cached as Partial<LeadingStocks>
  if (!Array.isArray(themes) || themes.length === 0 || !themes.every(isTopTheme)) return null
  if (typeof basis !== 'object' || basis === null) return null

  return {
    basis: {
      strategyName: typeof basis.strategyName === 'string' ? basis.strategyName : null,
      periodLabel: typeof basis.periodLabel === 'string' ? basis.periodLabel : null,
    },
    themes,
  }
}

function isTopTheme(value: unknown): value is TopTheme {
  if (typeof value !== 'object' || value === null) return false
  const theme = value as Partial<TopTheme>
  return (
    typeof theme.stockCode === 'string' &&
    typeof theme.stockName === 'string' &&
    typeof theme.theme === 'string' &&
    (theme.returnRate === null || isFiniteNumber(theme.returnRate)) &&
    (theme.tradeCount === null || isFiniteNumber(theme.tradeCount))
  )
}

/**
 * 테마별 대장주를 받는다. **실패해도 던지지 않는다.**
 *
 * 못 받으면 지난 방문의 값, 그것도 없으면 고정 목록을 돌려준다. 테마 목록 하나 때문에
 * 홈 상단이 통째로 비면 안 된다. 어느 쪽이었는지는 basis·returnRate가 비었는지로 화면이 안다.
 */
export async function loadLeading(): Promise<LeadingStocks> {
  try {
    const leading = await getLeadingStocks()
    writeCache(LEADING_CACHE_KEY, leading)
    return leading
  } catch (error: unknown) {
    console.warn('테마별 대장주 조회 실패. 지난 값이나 고정 목록으로 그립니다', error)
    return readCachedLeading() ?? FALLBACK_LEADING
  }
}

/**
 * 카드 그래프를 채운다. **던지지 않는다.** 받은 대로 onEach로 넘기고, 못 그리는 카드는 null로 넘긴다.
 *
 * 담아 둔 게 있는 종목은 묻지 않는다. 로그인했으면 그래프가 다 있어도 토큰은 심는다 — 이어서 누를 상세가
 * 심기를 기다리지 않게 홈에서 미리 해 둔다(6시간에 한 번).
 * 셋을 한꺼번에 보낸다. 토큰이 서버에 있으면 증권사 한도에 걸리지 않고, 없을 때는 아예 보내지 않는다.
 */
export async function loadCardSeries(
  stockCodes: string[],
  /** 홈 시세표 기준일(YYYYMMDD). 아직 모르면 null */
  baseDate: string | null,
  onEach: (stockCode: string, series: CardSeries | null) => void,
): Promise<void> {
  const first = stockCodes[0]
  if (first !== undefined) await primeKisToken(first)

  const missing = stockCodes.filter((code) => readCardSeries(code, baseDate) === null)
  if (missing.length === 0) return

  if (!canSpendKisCall()) {
    for (const code of missing) onEach(code, null)
    return
  }

  await Promise.all(
    missing.map(async (code) => {
      try {
        // 받은 일봉은 getStockDetail이 카드 그래프로도 담는다(rememberCardSeries)
        const detail = await getStockDetail(code, 'ONE_YEAR')
        // 마지막 봉이 기준일에 못 미쳐도(거래정지) 막 받은 값이니 그린다
        onEach(code, detail.candles.length === 0 ? null : readCardSeries(code, null))
      } catch (error: unknown) {
        console.warn(`카드 그래프를 받지 못했습니다 (${code})`, error)
        onEach(code, null)
      }
    }),
  )
}
