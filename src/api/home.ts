import { getLeadingStocks } from './stock'
import { readCache, writeCache } from '../utils/cache'
import { isFiniteNumber } from '../utils/format'
import type { LeadingStocks, TopTheme } from '../types/stock'

/*
 * 홈 상단 "테마별 대표 종목" 카드의 데이터.
 *
 * 카드는 GET /api/stocks/leading-stocks 하나로 그린다(종가는 홈 시세표가 따로 받는다).
 * 둘 다 DB만 읽는 API라 늘 받아지고, 홈에서 증권사를 거치는 요청은 하나도 나가지 않는다.
 *
 * 2026-10-04까지는 카드마다 종목 상세 API(GET /api/stocks/{code})를 불러 한 달 그래프를 그렸다.
 * 그 API는 증권사 현재가를 함께 물어서 1분에 1건만 성공했고, 홈에 올 때마다 2·3번 카드가 비었다.
 * 스웨거상 그 API는 상세 페이지용이고, 홈 카드용은 leading-stocks("홈 화면 테마별 대장주 수익률
 * 조회 API")다. 홈이 그 API를 부르지 않으니 증권사 호출 한도는 상세 페이지 몫으로 남는다.
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
