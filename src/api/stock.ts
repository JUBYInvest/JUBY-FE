import { ApiError, get, malformedResponse } from './client'
import { rememberCardSeries } from './cardSeries'
import { forgetKisTokenPrime, markDetailSent, markKisLimited } from './kisBudget'
import { memberKey, readMemo, shared, writeMemo, type Memo } from './memo'
import { fromDashedYmd, fromKstDateTime } from '../utils/date'
import { finiteOrNull } from '../utils/format'
import type { Candle, LeadingStocks, Period, Stock, StockDetail, TopTheme } from '../types/stock'
import { filledOr, isFilledText } from '../utils/text'

/**
 * 종목 창구(목록·대장주·상세와 증권사 호출 게이팅). 백엔드 `/api/stocks/**`를 부른다.
 * 뉴스 셋은 api/news.ts, 검색(가진 목록·서버·순위)은 api/search.ts다.
 *
 * 목록은 DB에서 한 번에 오고 상세도 일봉은 DB라, 요청을 쪼개거나 다시 보내는 장치(chunk·retry·prefetch)를 두지 않는다.
 * 증권사로 가는 요청의 목록은 CLAUDE.md "증권사(KIS) 호출" 표가 정답이다 — 이 파일에서는 상세의 현재가, 토큰 심기(primeKisToken),
 * 홈 카드 그래프(api/home.ts가 getStockDetail을 부른다)이고, 휴장일·거래대금 순위·임시 차트는 api/marketCalendar.ts·api/kisMarket.ts다.
 */

interface StockList {
  /** YYYYMMDD. 장 밖에는 이 날 종가 기준이다 */
  baseDate: string
  /** 서버가 값을 만든 때(ms). 장중에는 종가 자리에 그때의 현재가가 들어 있다(realtime) */
  asOf: number | null
  /** 한 종목이라도 장중 현재가면 true — 화면이 "종가 기준" 대신 시각을 적는다 */
  realtime: boolean
  stocks: Stock[]
}

/*
 * 아래 *Response는 서버가 실제로 주는 모양이다. 스웨거에 필수 표시가 없어 필드를 전부 비어 올 수 있게 적는다.
 * 화면 타입(types/*.ts)으로 옮기는 자리에서 거른다 — 숫자는 finiteOrNull, 문자열은 typeof로 보고 비면 null이나 대신할 값을 둔다.
 */

/** GET /api/stocks */
interface StockListResponse {
  /** YYYY-MM-DD */
  baseDate?: string | null
  /** 응답을 만든 한국 시각 */
  asOf?: string | null
  stockList?: (StockRowResponse | null)[] | null
}

interface StockRowResponse {
  stockCode?: string | null
  stockName?: string | null
  closePrice?: number | null
  fluctuate?: number | null
  tradingValue?: number | null
  isLiked?: boolean | null
  /** 종가 자리가 장중 현재가인가 */
  realtime?: boolean | null
}

/** 100종목 시세(장중엔 서버가 받아 둔 실시간 값, 증권사 호출 없음). 화면 여럿이 1분 동안 같이 쓴다 — 하트(isLiked)가 회원마다 달라 열쇠에 계정을 넣는다 */
export function getStockList(): Promise<StockList> {
  return shared(memberKey('stocks'), 60_000, fetchStockList)
}

async function fetchStockList(): Promise<StockList> {
  const response = await get<StockListResponse | null>('/api/stocks')
  // 목록 자체가 없으면 그릴 게 없다. 한 행의 값이 빈 건 그 칸만 "-"로 두고 넘긴다
  if (response === null || !Array.isArray(response.stockList)) throw malformedResponse()
  const stocks = response.stockList.flatMap(toStock)
  if (stocks.length < response.stockList.length) {
    console.warn(`종목코드가 틀린 행 ${response.stockList.length - stocks.length}개를 뺐습니다`)
  }
  return {
    baseDate: fromDashedYmd(response.baseDate),
    asOf: fromKstDateTime(response.asOf),
    realtime: response.stockList.some((row) => row?.realtime === true),
    stocks,
  }
}

/**
 * 종목 한 행이 쓸 만하면 [행], 아니면 []. 종목코드가 없거나 틀린 행은 뺀다 — 상세 링크(`/stocks/null`)도 하트도
 * 걸 수 없고, 검색이 `null.includes`로 던져 화면 전체가 오류 화면이 된다.
 * 이름이 비면 종목코드로 대신한다(`null.replace`로 똑같이 멈춘다). 값 칸이 빈 건 포맷 함수가 "-"로 적고
 * 정렬이 맨 뒤로 보낸다(sortStocks).
 */
function toStock(row: StockRowResponse | null): Stock[] {
  if (typeof row !== 'object' || row === null) return []
  const { stockCode } = row
  if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return []
  return [{
    stockCode,
    stockName: nameOrCode(row.stockName, stockCode),
    closePrice: finiteOrNull(row.closePrice),
    fluctuate: finiteOrNull(row.fluctuate),
    tradingValue: finiteOrNull(row.tradingValue),
    isLiked: row.isLiked === true,
  }]
}

/** GET /api/stocks/leading-stocks */
interface LeadingStocksResponse {
  strategyName?: string | null
  periodLabel?: string | null
  leadingStocks?: (LeadingStockResponse | null)[] | null
}

interface LeadingStockResponse {
  stockCode?: string | null
  stockName?: string | null
  /** 영문 코드(TECH·DEFENSE·BIO). 화면에는 themeLabel을 쓴다 */
  theme?: string | null
  /** 사람이 읽는 테마 이름. 예: "기술주" */
  themeLabel?: string | null
  /** 이 전략으로 돌렸을 때의 수익률(%). 주가 등락률이 아니다. **받기만 하고 화면에 쓰지 않는다**(아래 getLeadingStocks) */
  returnPercentage?: number | null
  /** 그 기간에 전략이 사고판 횟수. 받기만 하고 쓰지 않는다 */
  tradeCount?: number | null
}

/**
 * 홈 카드에 올릴 테마별 대장주.
 *
 * 어떤 종목이 대장인지를 서버가 정한다(테마마다 정해 둔 목록, JUBY-BE LeadingStockTheme) — 프론트에 박아 두면 대장이 바뀔 때마다
 * 코드를 고쳐 배포해야 한다.
 *
 * 홈 카드가 이 응답에서 쓰는 건 종목·테마 라벨뿐이다. 전략 수익률(returnPercentage)·매매 횟수(tradeCount)·전략 이름·기간은
 * 카드에 적지 않는다 — 매매 0~1회 종목은 0.0%라 "제자리"로 읽히고, 종목은 전략 결과로 고른 것도
 * 아니다(CLAUDE.md "홈 테마별 대표 종목"). 그래서 받기만 하고 옮기지 않는다.
 * 그래프(1년 일봉)는 따로 받는다(api/home.ts loadCardSeries).
 */
export async function getLeadingStocks(): Promise<LeadingStocks> {
  const response = await get<LeadingStocksResponse | null>('/api/stocks/leading-stocks')
  if (response === null || !Array.isArray(response.leadingStocks)) throw malformedResponse()

  const themes = response.leadingStocks.flatMap(toTopTheme)
  // 한 장도 못 건지면 고정 목록으로 물러서는 편이 낫다. 부르는 쪽이 그렇게 받는다
  if (themes.length === 0) throw malformedResponse()

  return { themes }
}

/** 쓸 만한 테마면 [테마], 아니면 []. 종목코드가 없거나 틀린 행은 카드로 세울 수 없어 뺀다 */
function toTopTheme(row: LeadingStockResponse | null): TopTheme[] {
  if (typeof row !== 'object' || row === null) return []
  const { stockCode } = row
  if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return []

  /*
   * 카드 라벨은 "기술주 대장" 꼴이다. 서버는 "기술주"까지만 주므로 여기서 "대장"을 붙인다.
   * themeLabel이 비면 영문 코드(TECH)라도 쓰고, 그마저 없으면 라벨 없이 종목명만 보인다.
   */
  const label = trimmedOrNull(row.themeLabel) ?? trimmedOrNull(row.theme)

  return [{
    stockCode,
    stockName: nameOrCode(row.stockName, stockCode),
    theme: label === null ? '' : `${label} 대장`,
  }]
}

/** 테마 이름은 앞뒤 공백을 다듬는다. 비었으면 null */
function trimmedOrNull(value: unknown): string | null {
  return isFilledText(value) ? value.trim() : null
}

/** 화면에 적을 종목 이름. 비었거나(공백 포함) 문자열이 아니면 종목코드로 대신한다. 관심종목 행도 같이 쓴다 */
export function nameOrCode(name: unknown, stockCode: string): string {
  return filledOr(name, stockCode)
}

/*
 * 같은 탭에서 방금 받은 상세는 잠깐 다시 쓴다(api/memo.ts). 같은 종목을 다시 열 때 증권사 현재가를
 * 또 기다리지 않게 한다. 현재가가 실시간이라 1분. 뉴스의 10분 메모는 api/news.ts에 있다.
 */
const DETAIL_MEMO_AGE = 60 * 1000
const detailMemo = new Map<string, Memo<StockDetail>>()

/** 같은 탭에서 방금(1분) 받아 둔 상세. 있으면 화면이 서버에 묻지 않고 바로 그린다 */
export function peekStockDetail(stockCode: string, period: Period = 'ALL'): StockDetail | null {
  return readMemo(detailMemo, `${stockCode}|${period}`, DETAIL_MEMO_AGE)
}

/**
 * 지금 서버에 묻고 있는 상세. 같은 종목을 또 부르면 새로 보내지 않고 이 답을 같이 기다린다.
 * 없으면 개발 모드(StrictMode)가 effect를 두 번 돌려 처음 연 종목에도 요청이 둘 나가고, 1분에 1건만 되는 날엔 둘째가 실패한다.
 * A를 부르는 중에 B로 갔다가 A로 돌아와도 같다.
 */
const detailInFlight = new Map<string, Promise<StockDetail>>()

/** 이 종목 상세를 지금 묻고 있는가. 그렇다면 화면은 새로 보내지 않고 그 답을 받는다 */
export function isStockDetailInFlight(stockCode: string, period: Period = 'ALL'): boolean {
  return detailInFlight.has(`${stockCode}|${period}`)
}

/** GET /api/stocks/{code} */
interface StockDetailResponse {
  stockName?: string | null
  stockCode?: string | null
  currentPrice?: number | null
  comparePrev?: number | null
  period?: Period | null
  dailyPrices?: (DailyPriceResponse | null)[] | null
}

interface DailyPriceResponse {
  /** YYYY-MM-DD */
  date?: string | null
  openPrice?: number | null
  highPrice?: number | null
  lowPrice?: number | null
  closePrice?: number | null
  volume?: number | null
}

/**
 * 종목코드 형식(6자리 숫자)인가. 주소창에 아무 글자나 넣어도 상세 화면이 열리는데,
 * 형식이 틀린 코드로 요청하면 서버가 증권사까지 물으러 갈 수 있다(상세는 현재가를 증권사에 묻는다).
 * 그래서 형식부터 보고, 틀리면 요청 없이 "없는 종목"으로 본다.
 */
export function isStockCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

/**
 * 종목 상세. 일봉은 DB, **현재가·등락률만 증권사를 한 번 거친다.**
 *
 * 기간을 바꿀 때마다 부르면 그때마다 증권사 호출이 한 번씩 나간다. 상세 화면은
 * ALL로 한 번 받아 두고 기간 탭은 화면에서 잘라 쓴다(StockChartPage 참고).
 * 없는 종목이면 ApiError(404, STOCK404_1)가 난다.
 * 실패한 뒤 다시 부를 때는 부르는 쪽이 detailWaitMs()로 간격을 지킨다(위 "실패한 뒤 다시 부를 간격").
 * 같은 종목을 이미 묻고 있으면 새로 보내지 않고 그 답을 준다(fresh여도 — 묻고 있는 답이 곧 새 값이다).
 */
export async function getStockDetail(
  stockCode: string,
  period: Period = 'ALL',
  /** 다시 시도처럼 방금 받은 값을 쓰지 않고 새로 받을 때 true */
  options: { fresh?: boolean } = {},
): Promise<StockDetail> {
  const memoKey = `${stockCode}|${period}`
  const remembered = options.fresh ? null : readMemo(detailMemo, memoKey, DETAIL_MEMO_AGE)
  if (remembered !== null) return remembered

  const pending = detailInFlight.get(memoKey)
  if (pending !== undefined) return pending

  const request = fetchStockDetail(stockCode, period, memoKey)
  detailInFlight.set(memoKey, request)
  // 부르는 쪽보다 먼저 지운다. 실패를 받은 화면이 다시 부를 때는 묻는 중이 아니어야 간격을 기다린다
  const settle = () => {
    if (detailInFlight.get(memoKey) === request) detailInFlight.delete(memoKey)
  }
  request.then(settle, (error: unknown) => {
    settle()
    // 서버 오류(5xx·못 닿음)면 서버에 토큰이 없을 수 있다. 다음엔 다시 심고, 30분 동안 카드 그래프는 증권사를 쓰지 않는다
    if (!(error instanceof ApiError) || error.status >= 500) {
      markKisLimited()
      forgetKisTokenPrime()
    }
  })
  return request
}

async function fetchStockDetail(stockCode: string, period: Period, memoKey: string): Promise<StockDetail> {
  // 실패해도 서버 한도는 쓴 것으로 본다 — 실패한 요청이 다음 1분을 비워 주는지 확인하지 못했다
  markDetailSent()
  const response = await get<StockDetailResponse | null>(
    `/api/stocks/${encodeURIComponent(stockCode)}?period=${period}`,
  )
  // 일봉 배열이 없으면 차트를 그릴 수 없다. 현재가·등락률이 빈 건 "-"로 두고 넘긴다
  if (response === null || !Array.isArray(response.dailyPrices)) throw malformedResponse()

  /*
   * 차트가 그릴 수 없는 봉은 뺀다.
   * - 날짜가 여덟 자리가 아닌 봉: 날짜가 null이면 ""가 되어 차트 라이브러리가 던지고, 기간 탭을 바꾸는 순간
   *   차트 구역이 "이 부분을 표시하지 못했어요"가 된다 — 다시 시도해도 같은 데이터라 안 풀린다.
   * - 시·고·저·종 중 하나라도 유한한 숫자가 아닌 봉: 라이브러리가 "Value is null"을 던져 캔들·시간축이 안 그려지고
   *   마우스를 올려도 범례가 안 바뀐다. 그리는 곳이 React 밖이라 구역 안내도 안 뜬다. 빼면 그 날만 빈다.
   * 거래량만 빈 봉·날짜가 겹친 봉은 그대로 그려져 거르지 않는다. 범례가 거래량을 "-"로 적는다.
   */
  const candles = response.dailyPrices.map(toCandle)
  const datedCandles = candles.filter((candle) => /^\d{8}$/.test(candle.date))
  const usable = datedCandles.filter(hasPrices)
  if (usable.length < candles.length) {
    console.warn(
      `날짜가 틀린 일봉 ${candles.length - datedCandles.length}개, 가격이 빈 일봉 ${datedCandles.length - usable.length}개를 뺐습니다`,
      stockCode,
    )
  }

  const detail: StockDetail = {
    stockName: nameOrCode(response.stockName, stockCode),
    // 종목코드·기간은 보낸 값을 되돌려 주는 자리라 보낸 값을 쓴다. 비어 와도 화면이 흔들리지 않는다
    stockCode,
    // 현재가·등락률이 빈 건 포맷 함수가 "-"로 적는다
    currentPrice: finiteOrNull(response.currentPrice),
    comparePrev: finiteOrNull(response.comparePrev),
    period,
    // 서버가 오름차순으로 주지만 기대지 않는다. 차트는 순서가 어긋나면 그리지 못한다
    candles: usable.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    receivedAt: Date.now(),
  }
  writeMemo(detailMemo, memoKey, detail, DETAIL_MEMO_AGE)
  // 받은 일봉의 마지막 한 달은 홈 카드 그래프로도 쓴다. 상세를 본 종목은 카드가 다시 묻지 않는다
  rememberCardSeries(stockCode, detail.candles)
  return detail
}

/** 거르기 전의 봉. 시·고·저·종이 비어 올 수 있다 */
interface RawCandle extends Omit<Candle, 'open' | 'high' | 'low' | 'close'> {
  open: number | null
  high: number | null
  low: number | null
  close: number | null
}

/**
 * 날짜가 틀린 봉과 시·고·저·종이 빈 봉은 getStockDetail이 뺀다(hasPrices). 거래량은 비어도 둔다.
 * 배열 칸 자체가 null이면 날짜가 ""라 날짜 검사에서 빠진다
 */
function toCandle(price: DailyPriceResponse | null): RawCandle {
  return {
    date: fromDashedYmd(price?.date),
    open: finiteOrNull(price?.openPrice),
    high: finiteOrNull(price?.highPrice),
    low: finiteOrNull(price?.lowPrice),
    close: finiteOrNull(price?.closePrice),
    volume: finiteOrNull(price?.volume),
  }
}

/** 차트가 그릴 수 있는 봉인가. 시·고·저·종이 모두 유한한 숫자여야 한다 */
function hasPrices(candle: RawCandle): candle is Candle {
  return candle.open !== null && candle.high !== null && candle.low !== null && candle.close !== null
}
