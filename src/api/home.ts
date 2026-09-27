import { getStockDetail } from './stock'
import { delay, withRetry } from '../utils/async'
import { readCache, writeCache } from '../utils/cache'
import type { Candle, CardFailure, TopStock, TopTheme } from '../types/stock'

/** 테마 라벨과 종목 선정은 API에 없어 프론트에서 고정한다 */
export const TOP_THEMES: TopTheme[] = [
  { stockCode: '000660', stockName: 'SK하이닉스', theme: '기술주 대장' },
  { stockCode: '012450', stockName: '한화에어로스페이스', theme: '방산주 대장' },
  { stockCode: '207940', stockName: '삼성바이오로직스', theme: '바이오주 대장' },
]

/**
 * 카드 사이에 쉬는 시간.
 *
 * 상세 API는 일봉을 DB에서 주지만 현재가 하나는 증권사에 물어보므로, 세 장을 동시에
 * 던지면 초당 제한(EGW00201)에 걸려 500이 섞인다. 순차로 보내되 잠깐 띄운다.
 */
const CARD_REQUEST_GAP = 200

const TOP_CACHE_KEY = 'topStocks'
/** 한 달 등락률이라 반나절 지난 값이어도 화면에 잠깐 띄우기엔 충분하다 */
const TOP_CACHE_MAX_AGE = 12 * 60 * 60 * 1000

/**
 * 이만큼 안에 받아 둔 카드면 다시 부르지 않는다. 홈에 올 때마다 증권사 3회가 나갔다(사용자 결정 2026-09-27).
 * 카드는 한 달치 일봉(DB, 16시 배치로 하루 한 번 바뀜)만 그리므로 10분 묵어도 그래프가 같다.
 */
const TOP_FRESH_AGE = 10 * 60 * 1000

/**
 * 지난번 방문에서 받아둔 카드. 첫 그림을 즉시 그리는 용도다.
 * 이 값을 띄운 뒤에도 loadTopStocks()는 그대로 돌아 최신 값으로 갈아끼운다.
 */
export function readCachedTopStocks(maxAge: number = TOP_CACHE_MAX_AGE): TopStock[] | null {
  const cached = readCache<unknown>(TOP_CACHE_KEY, maxAge)
  /*
   * 하나라도 어긋나면 캐시 전체를 없는 셈 친다. 개수만 보면 두 가지가 샜다.
   * ① TOP_THEMES의 종목을 바꾸면 최대 12시간 동안 새 테마 이름 아래 옛 종목의 그래프가 먼저 떴다.
   * ② 모양이 틀린 값(예전 버전이 다른 모양으로 저장, 사람이 손댄 값)은 카드를 그리다 던져 홈 전체가
   *    오류 화면이 됐고, 다시 시도(새로고침)해도 같은 캐시를 읽어 12시간 동안 홈이 안 열렸다.
   */
  if (!Array.isArray(cached) || cached.length !== TOP_THEMES.length) return null
  return cached.every((stock, index) => isCachedTopStock(stock, TOP_THEMES[index].stockCode))
    ? (cached as TopStock[])
    : null
}

/** 10분 안에 받아 둔 온전한 카드가 있는가. 있으면 홈이 다시 부르지 않는다 */
export function hasFreshTopStocks(): boolean {
  return readCachedTopStocks(TOP_FRESH_AGE) !== null
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
 * 테마별 대표 종목을 하나씩 조회해 받는 대로 넘긴다.
 *
 * 셋을 모아 한 번에 주면 가장 느린 하나에 카드 세 장이 전부 묶인다.
 * 받는 대로 넘겨야 첫 장이 먼저 뜬다.
 *
 * 한 장이 실패해도 멈추지 않는다. 한 종목이 거래정지이거나 하필 그 요청만 제한에
 * 걸린 경우, 멀쩡한 나머지 두 장까지 시도조차 못 하고 통째로 에러가 되면 안 된다.
 */
export async function loadTopStocks(
  onEach: (index: number, stock: TopStock) => void,
  /** 한 장을 못 채웠을 때. 조용히 넘기면 카드가 로딩 자리표시 그대로 남아 실패와 구분되지 않는다 */
  onFail: (index: number, reason: CardFailure) => void,
): Promise<void> {
  const loaded: TopStock[] = []

  for (const [index, theme] of TOP_THEMES.entries()) {
    if (index > 0) await delay(CARD_REQUEST_GAP)

    try {
      const detail = await withRetry(
        () => getStockDetail(theme.stockCode, 'ONE_MONTH'),
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

  // 셋이 다 모였을 때만 저장한다. 반쯤 찬 카드를 다음 방문에 그려봐야 소용없다
  if (loaded.length === TOP_THEMES.length) {
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
