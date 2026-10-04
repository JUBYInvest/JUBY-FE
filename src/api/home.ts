import { getLeadingStocks, getStockDetail } from './stock'
import { delay, withRetry } from '../utils/async'
import { readCache, writeCache } from '../utils/cache'
import type {
  Candle,
  CardFailure,
  LeadingStocks,
  TopStock,
  TopTheme,
} from '../types/stock'

/**
 * 서버에서 대장주를 못 받았을 때 쓰는 고정 목록.
 *
 * 2026-10-04에 `GET /api/stocks/leading-stocks`로 갈아탔다. 그 전에는 이 셋이 유일한 목록이어서
 * 대장이 바뀌면 코드를 고쳐 배포해야 했다. 지금은 첫 그림을 그릴 때와 서버가 못 줄 때만 쓴다.
 * 카드 자리를 비워 두는 것보다 조금 묵은 종목이라도 세워 두는 편이 낫다.
 */
export const FALLBACK_THEMES: TopTheme[] = [
  { stockCode: '000660', stockName: 'SK하이닉스', theme: '기술주 대장' },
  { stockCode: '012450', stockName: '한화에어로스페이스', theme: '방산주 대장' },
  { stockCode: '207940', stockName: '삼성바이오로직스', theme: '바이오주 대장' },
]

/** 서버가 못 줬을 때의 자리. 머리말은 근거를 밝히지 않고 예전 문구로 둔다 */
export const FALLBACK_LEADING: LeadingStocks = {
  basis: { strategyName: null, periodLabel: null },
  themes: FALLBACK_THEMES,
}

/**
 * 카드 사이에 쉬는 시간.
 *
 * 상세 API는 일봉을 DB에서 주지만 현재가 하나는 증권사에 물어보므로, 세 장을 동시에
 * 던지면 초당 제한(EGW00201)에 걸려 500이 섞인다. 순차로 보내되 잠깐 띄운다.
 */
const CARD_REQUEST_GAP = 200

const TOP_CACHE_KEY = 'topStocks'
const THEMES_CACHE_KEY = 'topThemes'
/** 한 달 등락률이라 반나절 지난 값이어도 화면에 잠깐 띄우기엔 충분하다 */
const TOP_CACHE_MAX_AGE = 12 * 60 * 60 * 1000

/**
 * 이만큼 안에 받아 둔 카드면 다시 부르지 않는다. 홈에 올 때마다 증권사 3회가 나갔다(사용자 결정 2026-09-27).
 * 카드는 한 달치 일봉(DB, 16시 배치로 하루 한 번 바뀜)만 그리므로 10분 묵어도 그래프가 같다.
 */
const TOP_FRESH_AGE = 10 * 60 * 1000

/**
 * 지난 방문에서 받아 둔 대장주. 첫 그림의 테마 이름과 종목명을 즉시 그리는 용도다.
 *
 * 테마는 서버 배치가 새벽 4시에 한 번 바꾸므로 반나절 묵은 값도 대개 맞다. 틀렸더라도
 * loadTopStocks()가 곧 새 값으로 갈아끼운다.
 */
export function readCachedLeading(): LeadingStocks | null {
  const cached = readCache<unknown>(THEMES_CACHE_KEY, TOP_CACHE_MAX_AGE)
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
    typeof theme.theme === 'string'
  )
}

/**
 * 지난번 방문에서 받아둔 카드. 첫 그림을 즉시 그리는 용도다.
 * 이 값을 띄운 뒤에도 loadTopStocks()는 그대로 돌아 최신 값으로 갈아끼운다.
 *
 * 지금 믿고 있는 테마(서버 캐시 또는 고정 목록)를 받아 그것과 맞는지 본다. 테마가 바뀌면
 * 카드 캐시는 버려야 한다 — 새 테마 이름 아래 옛 종목의 그래프가 뜨면 안 된다.
 */
export function readCachedTopStocks(
  themes: TopTheme[],
  maxAge: number = TOP_CACHE_MAX_AGE,
): TopStock[] | null {
  const cached = readCache<unknown>(TOP_CACHE_KEY, maxAge)
  /*
   * 하나라도 어긋나면 캐시 전체를 없는 셈 친다. 개수만 보면 두 가지가 샜다.
   * ① 테마의 종목이 바뀌면 최대 12시간 동안 새 테마 이름 아래 옛 종목의 그래프가 먼저 떴다.
   * ② 모양이 틀린 값(예전 버전이 다른 모양으로 저장, 사람이 손댄 값)은 카드를 그리다 던져 홈 전체가
   *    오류 화면이 됐고, 다시 시도(새로고침)해도 같은 캐시를 읽어 12시간 동안 홈이 안 열렸다.
   */
  if (!Array.isArray(cached) || cached.length !== themes.length) return null
  return cached.every((stock, index) => isCachedTopStock(stock, themes[index].stockCode))
    ? (cached as TopStock[])
    : null
}

/** 10분 안에 받아 둔 온전한 카드가 있는가. 있으면 홈이 다시 부르지 않는다 */
export function hasFreshTopStocks(themes: TopTheme[]): boolean {
  return readCachedTopStocks(themes, TOP_FRESH_AGE) !== null
}

function isFiniteNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

/** 이 자리 테마의 종목이고, 그래프를 그릴 값(가격·거래량·등락률)이 온전한가 */
function isCachedTopStock(value: unknown, stockCode: string): boolean {
  if (typeof value !== 'object' || value === null) return false
  const stock = value as Partial<TopStock>
  return (
    stock.stockCode === stockCode &&
    typeof stock.changeRate === 'number' &&
    Number.isFinite(stock.changeRate) &&
    isFiniteNumbers(stock.prices) &&
    isFiniteNumbers(stock.volumes) &&
    stock.prices.length === stock.volumes.length
  )
}

/**
 * 테마별 대장주를 서버에서 받고, 각 종목의 일봉을 하나씩 조회해 받는 대로 넘긴다.
 *
 * 순서가 중요하다. 어떤 종목인지부터 정해야 어느 종목의 일봉을 받을지 알 수 있다.
 * 대장주 조회가 실패하면 고정 목록으로 물러서서 그래프만이라도 채운다 — 테마 목록 하나 때문에
 * 홈 상단이 통째로 비면 안 된다.
 *
 * 일봉은 셋을 모아 한 번에 주지 않는다. 가장 느린 하나에 카드 세 장이 전부 묶이기 때문이다.
 * 한 장이 실패해도 멈추지 않는다 — 한 종목이 거래정지이거나 하필 그 요청만 제한에 걸린 경우,
 * 멀쩡한 나머지 두 장까지 시도조차 못 하고 통째로 에러가 되면 안 된다.
 */
export async function loadTopStocks(
  /** 대장주가 정해진 순간. 그래프보다 먼저 와서 카드 제목과 머리말을 바꾼다 */
  onThemes: (leading: LeadingStocks) => void,
  onEach: (index: number, stock: TopStock) => void,
  /** 한 장을 못 채웠을 때. 조용히 넘기면 카드가 로딩 자리표시 그대로 남아 실패와 구분되지 않는다 */
  onFail: (index: number, reason: CardFailure) => void,
  /** 다시 시도처럼 방금 받은 상세를 쓰지 않고 새로 받을 때 true */
  options: { fresh?: boolean } = {},
): Promise<void> {
  let leading: LeadingStocks
  try {
    leading = await getLeadingStocks()
    writeCache(THEMES_CACHE_KEY, leading)
  } catch (error: unknown) {
    console.warn('테마별 대장주 조회 실패. 고정 목록으로 그립니다', error)
    leading = readCachedLeading() ?? FALLBACK_LEADING
  }
  onThemes(leading)

  const loaded: TopStock[] = []

  for (const [index, theme] of leading.themes.entries()) {
    if (index > 0) await delay(CARD_REQUEST_GAP)

    try {
      const detail = await withRetry(
        () => getStockDetail(theme.stockCode, 'ONE_MONTH', options),
        1,
        400,
      )
      if (detail.candles.length === 0) {
        onFail(index, 'empty')
        continue
      }

      const stock = toTopStock(theme, detail.candles)
      loaded.push(stock)
      onEach(index, stock)
    } catch (error: unknown) {
      console.warn(`${theme.stockName} 카드 조회 실패`, error)
      onFail(index, 'error')
    }
  }

  // 다 모였을 때만 저장한다. 반쯤 찬 카드를 다음 방문에 그려봐야 소용없다
  if (loaded.length === leading.themes.length) {
    writeCache(TOP_CACHE_KEY, loaded)
    return
  }

  // 한 장도 못 받았을 때만 실패로 알린다. 부르는 쪽이 에러 화면으로 바꾼다
  if (loaded.length === 0) {
    throw new Error('테마별 대표 종목을 한 건도 받지 못했습니다')
  }
}

/** 받아온 1개월치를 그대로 쓴다 */
function toTopStock(theme: TopTheme, points: Candle[]): TopStock {
  const first = points[0].close
  const last = points[points.length - 1].close

  return {
    ...theme,
    // 거래정지 등으로 첫 종가가 0이면 나눌 수 없다. 보합으로 둔다
    changeRate: first === 0 ? 0 : ((last - first) / first) * 100,
    prices: points.map((point) => point.close),
    volumes: points.map((point) => point.volume),
  }
}
