import { ApiError, get, malformedResponse, unchecked } from './client'
import { rememberCardSeries } from './cardSeries'
import { isLoggedIn } from '../utils/auth'
import { fromDashedYmd } from '../utils/date'
import { isFiniteNumber } from '../utils/format'
import { safeLink } from '../utils/link'
import { sortStocks } from '../utils/sort'
import type {
  Candle,
  LeadingStocks,
  Period,
  Stock,
  StockDetail,
  StockInfo,
  TopTheme,
} from '../types/stock'
import type { NewsItem, NewsPage, NewsSort } from '../types/news'

/**
 * 종목 창구. 2026-09-18에 백엔드 `/api/stocks/**`로 갈아탔다.
 *
 * 예전에는 `/api/market/**`가 증권사를 종목마다 한 번씩 중계해서 홈 한 번에 108건이
 * 나갔고, 그걸 버티려고 chunk·retry·캐시·prefetch가 잔뜩 붙어 있었다.
 * 지금은 목록이 DB에서 한 번에 오고, 상세도 일봉은 DB라 그 장치들이 전부 필요 없다.
 * 남은 증권사 호출은 상세의 현재가 한 번뿐이다.
 */

interface StockList {
  /** YYYYMMDD. 이 날 종가 기준이다 */
  baseDate: string
  stocks: Stock[]
}

/*
 * 아래 *Response는 서버가 실제로 주는 모양이다. 스웨거에 필수 표시가 없어 필드를 전부 비어 올 수 있게 적는다.
 * 화면 타입(types/*.ts)으로 옮기는 자리에서 걸러 내고, 걸러 내지 않은 값은 unchecked()로 넘긴다.
 */

/** GET /api/stocks */
interface StockListResponse {
  /** YYYY-MM-DD */
  baseDate?: string | null
  stockList?: (StockRowResponse | null)[] | null
}

interface StockRowResponse {
  stockCode?: string | null
  stockName?: string | null
  closePrice?: number | null
  fluctuate?: number | null
  tradingValue?: number | null
  isLiked?: boolean | null
}

/** 100종목 시세. DB만 읽는다 — 증권사 호출이 없어 몇 번을 불러도 부담이 없다 */
export async function getStockList(): Promise<StockList> {
  const response = await get<StockListResponse | null>('/api/stocks')
  // 목록 자체가 없으면 그릴 게 없다. 한 행의 값이 빈 건 그 칸만 "-"로 두고 넘긴다
  if (response === null || !Array.isArray(response.stockList)) throw malformedResponse()
  const stocks = response.stockList.flatMap(toStock)
  if (stocks.length < response.stockList.length) {
    console.warn(`종목코드가 틀린 행 ${response.stockList.length - stocks.length}개를 뺐습니다`)
  }
  return {
    baseDate: fromDashedYmd(response.baseDate),
    stocks,
  }
}

/**
 * 종목 한 행이 쓸 만하면 [행], 아니면 []. 종목코드가 없거나 틀린 행은 뺀다 — 상세 링크(`/stocks/null`)도 하트도
 * 걸 수 없고, 검색에서 `null.includes`로 던져 화면 전체가 오류 화면이 됐다(2026-09-27 확인).
 * 이름이 비면 종목코드로 대신한다(`null.replace`로 똑같이 멈췄다). 값 칸이 빈 건 포맷 함수가 "-"로 적고
 * 정렬이 맨 뒤로 보낸다(sortStocks).
 */
function toStock(row: StockRowResponse | null): Stock[] {
  if (typeof row !== 'object' || row === null) return []
  const { stockCode } = row
  if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return []
  return [{
    stockCode,
    stockName: nameOrCode(row.stockName, stockCode),
    closePrice: unchecked(row.closePrice),
    fluctuate: unchecked(row.fluctuate),
    tradingValue: unchecked(row.tradingValue),
    isLiked: unchecked(row.isLiked),
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
  /** 이 전략으로 돌렸을 때의 수익률(%). 주가 등락률이 아니다 */
  returnPercentage?: number | null
  /** 그 기간에 전략이 사고판 횟수 */
  tradeCount?: number | null
}

/**
 * 홈 카드에 올릴 테마별 대장주.
 *
 * 어떤 종목이 대장인지를 서버가 정한다. 예전에는 종목 셋을 프론트에 박아 두어, 대장이 바뀌면
 * 코드를 고쳐 배포해야 했다. 서버는 매일 새벽 백테스트 배치를 돌려 테마마다 성적이 가장 좋은
 * 종목을 올려 준다.
 *
 * 홈 카드는 이 응답만으로 그린다. 카드의 큰 숫자가 returnPercentage(전략 수익률)이고,
 * 옆에 tradeCount(매매 횟수)를 적는다. 일봉은 이 응답에 없고, 카드도 이제 일봉을 받지 않는다 —
 * 일봉을 주는 종목 상세 API는 증권사를 거쳐 1분에 1건만 성공한다(types/stock.ts의 TopTheme 참고).
 */
export async function getLeadingStocks(): Promise<LeadingStocks> {
  const response = await get<LeadingStocksResponse | null>('/api/stocks/leading-stocks')
  if (response === null || !Array.isArray(response.leadingStocks)) throw malformedResponse()

  const themes = response.leadingStocks.flatMap(toTopTheme)
  // 한 장도 못 건지면 고정 목록으로 물러서는 편이 낫다. 부르는 쪽이 그렇게 받는다
  if (themes.length === 0) throw malformedResponse()

  return {
    basis: {
      strategyName: textOrNull(response.strategyName),
      periodLabel: textOrNull(response.periodLabel),
    },
    themes,
  }
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
  const label = textOrNull(row.themeLabel) ?? textOrNull(row.theme)

  return [{
    stockCode,
    stockName: nameOrCode(row.stockName, stockCode),
    theme: label === null ? '' : `${label} 대장`,
    // 숫자가 아니면 지어내지 않고 비워 둔다. 카드가 "–"로 적는다
    returnRate: isFiniteNumber(row.returnPercentage) ? row.returnPercentage : null,
    tradeCount: isFiniteNumber(row.tradeCount) ? row.tradeCount : null,
  }]
}

/** 비었거나(공백 포함) 문자열이 아니면 null */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** 화면에 적을 종목 이름. 비었거나(공백 포함) 문자열이 아니면 종목코드로 대신한다. 관심종목 행도 같이 쓴다 */
export function nameOrCode(name: unknown, stockCode: string): string {
  return typeof name === 'string' && name.trim() !== '' ? name : stockCode
}

/*
 * 같은 탭에서 방금 받은 상세·뉴스는 잠깐 다시 쓴다(사용자 결정 2026-09-27). 같은 종목을 다시 열거나 뉴스 정렬을
 * 오갈 때 증권사 현재가·Pinecone 검색을 또 기다리지 않게 한다. 상세는 현재가가 실시간이라 1분, 뉴스는 백엔드가
 * 매달 1일에 넣으므로 10분. 메모리에만 두므로 새로고침하면 비고, 실패는 담지 않는다(다시 시도는 늘 새로 받는다).
 */
const DETAIL_MEMO_AGE = 60 * 1000
const NEWS_MEMO_AGE = 10 * 60 * 1000

interface Memo<T> {
  savedAt: number
  value: T
}

const detailMemo = new Map<string, Memo<StockDetail>>()
const newsMemo = new Map<string, Memo<NewsPage>>()

function readMemo<T>(memo: Map<string, Memo<T>>, key: string, maxAge: number): T | null {
  const entry = memo.get(key)
  if (entry === undefined) return null
  if (Date.now() - entry.savedAt > maxAge) {
    memo.delete(key)
    return null
  }
  return entry.value
}

/*
 * 상세를 실패한 뒤 다시 부를 간격. **임시다 — 백엔드가 docs/남은-일.md 백엔드 10번을 고치면 이 장치를 걷는다.**
 *
 * 2026-10-04(일) 상세가 1분에 1건만 성공했다. 앞 요청 뒤 1분 안에 보내면 다른 종목이든 같은 종목이든 500이라,
 * 종목 하나를 본 뒤 곧바로 다른 종목을 누르면 "차트를 불러오지 못했습니다"가 떴다. 0.4초 뒤 다시 부르던
 * 재시도도 같은 1분 안이라 반드시 실패했다. 70초 간격으로는 늘 성공했다.
 * 백엔드 소스로 보면 증권사 토큰이 DB에 살아 있으면(평일 16시 일봉 배치가 받아 둔다) 한도가 없고, 토큰이 끝난
 * 주말에는 상세가 새 토큰을 저장하지 못해 요청마다 발급을 받으려다 증권사의 "1분에 1회 발급"에 걸린다.
 *
 * 그래서 처음에는 곧바로 보낸다 — 서버가 멀쩡하면 기다릴 까닭이 없다. 실패한 뒤 다시 부를 때만, 이 브라우저가
 * 마지막으로 보낸 때에서 DETAIL_GAP_MS가 지나기를 기다린다(그 안에 부르면 또 실패한다). 요청이 서버에 닿는 시각은
 * 보낸 시각과 조금씩 달라 1분에 몇 초를 더 둔다. 기다리는 동안 화면이 남은 시간을 적는다(StockChartPage).
 * 탭 여러 개도 같은 서버 한도를 나눠 쓰므로 보낸 때를 localStorage에도 둔다.
 */
export const DETAIL_GAP_MS = 65 * 1000
const DETAIL_SENT_KEY = 'stockDetailSentAt'
/** localStorage를 못 쓰는 브라우저(사생활 보호 창 등)에서도 이 탭 안에서는 간격을 지키도록 메모리에도 둔다 */
let detailSentAt = 0

function lastDetailSentAt(): number {
  let stored = 0
  try {
    const value = Number(localStorage.getItem(DETAIL_SENT_KEY))
    if (Number.isFinite(value)) stored = value
  } catch {
  }
  return Math.max(detailSentAt, stored)
}

function markDetailSent(): void {
  detailSentAt = Date.now()
  try {
    localStorage.setItem(DETAIL_SENT_KEY, String(detailSentAt))
  } catch {
  }
}

/**
 * 상세를 지금 보내도 되면 0, 아니면 기다릴 ms.
 * 시계를 되돌려 보낸 때가 미래로 남아도 DETAIL_GAP_MS보다 오래 기다리지는 않는다.
 */
export function detailWaitMs(): number {
  const wait = lastDetailSentAt() + DETAIL_GAP_MS - Date.now()
  return Math.min(Math.max(wait, 0), DETAIL_GAP_MS)
}

/*
 * 증권사 토큰 심기. **임시다 — 위 "실패한 뒤 다시 부를 간격"과 함께 걷는다.**
 *
 * 상세가 1분에 1건만 되는 까닭은 서버가 새로 받은 증권사 토큰을 저장하지 못해서다(읽기 전용 트랜잭션 안에서
 * 받는다). 그런데 /api/market/** 은 읽기 전용이 아니라 거기서 받은 토큰은 저장된다. 그래서 로그인한 사용자가
 * 상세를 열기 전에 GET /api/market/{code}/price 를 한 번 부르면, 그 뒤 24시간 동안은 **모든 사용자**의 상세가
 * 저장된 토큰을 써서 발급 없이 바로 된다. 평일 16시 일봉 배치가 하는 일을 프론트가 대신 하는 셈이다.
 * docs/남은-일.md 백엔드 7번("프론트는 /api/market 을 부르지 않는다")을 깨는 우회다 — 사용자 결정(2026-10-04).
 *
 * - 로그인해야 부를 수 있다(/api/market 은 인증 경로). 비로그인은 심지 못하고 위 간격만 지킨다.
 * - 되면 6시간 동안 다시 심지 않는다(토큰은 24시간 가고 평일 16시에 배치가 갈아 끼운다). 탭끼리 나누려고 localStorage.
 * - 4xx면 6시간 쉰다 — 백엔드가 7번대로 이 경로를 막으면(403) 저절로 꺼지고 위 간격으로 돌아간다.
 *   401(남아 있는 로그인 토큰이 죽음)은 10분만 쉰다. 다시 로그인하면 그 뒤 곧 심는다.
 * - 5xx·서버에 못 닿음은 65초만 쉰다. 누가 1분 안에 발급을 받아 간 뒤일 수 있어서다. 상세가 실패해 기다렸다
 *   다시 부를 때(StockChartPage) 다시 심는다.
 * - 심는 요청도 토큰 발급 한 번을 쓸 수 있으므로 보낸 때로 센다(markDetailSent).
 * - 응답 본문은 보지 않는다. 토큰이 저장됐는지는 알 수 없고, 그 뒤 상세가 되는지로만 드러난다.
 */
const PRIME_OK_KEY = 'kisTokenPrimedAt'
const PRIME_SKIP_KEY = 'kisTokenPrimeSkipUntil'
const PRIME_OK_AGE = 6 * 60 * 60 * 1000
const PRIME_SKIP_FORBIDDEN = 6 * 60 * 60 * 1000
const PRIME_SKIP_UNAUTHORIZED = 10 * 60 * 1000
/**
 * 심기를 기다리는 한도. 상세가 이 뒤에 나가므로 길면 그대로 딜레이가 된다(기본 12초).
 * 끊어도 서버는 하던 일을 마치므로 토큰은 대개 저장된다 — 끊는 건 브라우저가 기다리는 것뿐이다.
 */
const PRIME_TIMEOUT = 3_000
/** localStorage를 못 쓰는 브라우저에서도 이 탭 안에서는 기억하도록 메모리에도 둔다 */
const primeStamps = new Map<string, number>()
let primeInFlight: Promise<void> | null = null

function readStamp(key: string): number {
  let stored = 0
  try {
    const value = Number(localStorage.getItem(key))
    if (Number.isFinite(value)) stored = value
  } catch {
  }
  return Math.max(primeStamps.get(key) ?? 0, stored)
}

function writeStamp(key: string, value: number): void {
  primeStamps.set(key, value)
  try {
    localStorage.setItem(key, String(value))
  } catch {
  }
}

/** 6시간 안에 이 브라우저가 토큰을 심었는가. 시계를 되돌려 미래 값이 남아도 정해진 길이보다 오래 믿지 않는다 */
export function isKisTokenPrimed(now: number = Date.now()): boolean {
  const primedAt = readStamp(PRIME_OK_KEY)
  return now - primedAt < PRIME_OK_AGE && primedAt - now < PRIME_OK_AGE
}

/**
 * 심어 둔 표시를 지운다. 상세가 서버 오류를 내면 부른다 — 심을 때 남이 받아 둔 곧 끝날 토큰을 그대로 썼으면
 * 표시는 6시간인데 토큰은 먼저 끝난다. 그대로 두면 남은 시간 내내 심기를 건너뛰어 다시 1분에 1건이 됐다.
 */
export function forgetKisTokenPrime(): void {
  writeStamp(PRIME_OK_KEY, 0)
}

/**
 * 상세를 부르기 전에 한 번(홈에 와도 한 번 — 상세를 누를 때 이걸 기다리지 않게).
 * 던지지 않는다 — 못 심어도 상세는 그대로 부른다.
 */
export function primeKisToken(stockCode: string): Promise<void> {
  if (!isLoggedIn()) return Promise.resolve()
  const now = Date.now()
  if (isKisTokenPrimed(now)) return Promise.resolve()
  // 시계를 되돌려 미래 값이 남아도 정해진 길이보다 오래 건너뛰지는 않는다
  if (now < readStamp(PRIME_SKIP_KEY) && readStamp(PRIME_SKIP_KEY) - now <= PRIME_SKIP_FORBIDDEN) {
    return Promise.resolve()
  }
  // 이미 심는 중이면 같이 기다린다(개발 모드 StrictMode의 두 번 도는 effect)
  if (primeInFlight !== null) return primeInFlight

  primeInFlight = (async () => {
    markDetailSent()
    try {
      await get<unknown>(`/api/market/${encodeURIComponent(stockCode)}/price`, {
        ignoreUnauthorized: true,
        timeoutMs: PRIME_TIMEOUT,
      })
      writeStamp(PRIME_OK_KEY, Date.now())
      // 토큰이 저장됐으니 "방금 서버 오류가 났다"는 표시는 더 맞지 않다
      writeStamp(KIS_LIMITED_KEY, 0)
    } catch (error: unknown) {
      const status = error instanceof ApiError ? error.status : 0
      const skip =
        status === 401
          ? PRIME_SKIP_UNAUTHORIZED
          : status >= 400 && status < 500
            ? PRIME_SKIP_FORBIDDEN
            : DETAIL_GAP_MS
      writeStamp(PRIME_SKIP_KEY, Date.now() + skip)
      console.warn(`증권사 토큰을 심지 못했습니다. ${Math.round(skip / 1000)}초 뒤에 다시 시도합니다`, error)
    } finally {
      primeInFlight = null
    }
  })()
  return primeInFlight
}

/*
 * 사용자가 누르지 않은 증권사 호출(홈 카드 그래프)을 지금 써도 되는가. **임시다 — 위 두 장치와 함께 걷는다.**
 *
 * 서버에 저장된 토큰이 없으면 상세 한 건이 서버 전체의 "토큰 발급 1분 1회"를 써 버린다. 그러면 바로 뒤에
 * 사용자가 누른 종목이 1분 넘게 기다린다. 카드 그래프 하나 빠지는 것보다 그 딜레이가 훨씬 나쁘다.
 * 그래서 토큰이 서버에 있을 때만 쓴다.
 * - 이 브라우저가 6시간 안에 심었다(isKisTokenPrimed) → 있다.
 * - 한국 시간으로 토큰이 끝나 있는 때가 아니고(kisTokenLikelyExpired), 30분 안에 증권사 경유 요청이 서버 오류를
 *   낸 적도 없다 → 있을 것이다. 틀려도 30분 표시가 남아 그다음부터는 쓰지 않는다.
 */
const KIS_LIMITED_KEY = 'kisLimitedAt'
const KIS_LIMITED_AGE = 30 * 60 * 1000

function markKisLimited(): void {
  writeStamp(KIS_LIMITED_KEY, Date.now())
}

/**
 * 서버에 저장된 토큰이 끝나 있을 것 같은 때(한국 시간).
 * 평일 16시 일봉 배치(DailyPriceScheduler — 휴장일 조회가 실전 토큰을 받아 저장한다. 공휴일도 평일이면 돈다)가 받은
 * 토큰은 24시간 가고, 서버는 끝나기 10분 전부터 못 쓰는 토큰으로 본다(TokenService.isValid). 그래서
 * 토 15시 45분 ~ 월 16시 5분, 그리고 평일 15시 45분 ~ 16시 5분에는 토큰이 없다.
 */
export function kisTokenLikelyExpired(now: number = Date.now()): boolean {
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const day = kst.getUTCDay()
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes()
  const from = 15 * 60 + 45
  const until = 16 * 60 + 5
  if (day === 0) return true
  if (day === 6) return minutes >= from
  if (day === 1) return minutes < until
  return minutes >= from && minutes < until
}

export function canSpendKisCall(now: number = Date.now()): boolean {
  if (isKisTokenPrimed(now)) return true
  const limitedAt = readStamp(KIS_LIMITED_KEY)
  const limitedRecently = now - limitedAt < KIS_LIMITED_AGE && limitedAt - now < KIS_LIMITED_AGE
  return !kisTokenLikelyExpired(now) && !limitedRecently
}

/** 같은 탭에서 방금(1분) 받아 둔 상세. 있으면 화면이 서버에 묻지 않고 바로 그린다 */
export function peekStockDetail(stockCode: string, period: Period = 'ALL'): StockDetail | null {
  return readMemo(detailMemo, `${stockCode}|${period}`, DETAIL_MEMO_AGE)
}

/**
 * 지금 서버에 묻고 있는 상세. 같은 종목을 또 부르면 새로 보내지 않고 이 답을 같이 기다린다.
 * 없으면 개발 모드(StrictMode)는 effect를 두 번 돌려 처음 연 종목에도 요청이 둘 나갔고, 1분에 1건만 되는 날엔 둘째가 실패했다.
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
  dailyPrices?: DailyPriceResponse[] | null
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
   *   차트 구역이 "이 부분을 표시하지 못했어요"가 됐다 — 다시 시도해도 같은 데이터라 안 풀린다.
   * - 시·고·저·종 중 하나라도 유한한 숫자가 아닌 봉: 라이브러리가 "Value is null"을 던져 캔들·시간축이 안 그려지고
   *   마우스를 올려도 범례가 안 바뀌었다. 그리는 곳이 React 밖이라 구역 안내도 안 떴다(2026-09-28 발견). 빼면 그 날만 빈다.
   * 거래량만 빈 봉·날짜가 겹친 봉은 그대로 그려져(2026-09-27 확인) 거르지 않는다. 범례가 거래량을 "-"로 적는다.
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
    stockName: unchecked(response.stockName),
    stockCode: unchecked(response.stockCode),
    // 현재가·등락률이 빈 건 포맷 함수가 "-"로 적는다
    currentPrice: unchecked(response.currentPrice),
    comparePrev: unchecked(response.comparePrev),
    period: unchecked(response.period),
    // 서버가 오름차순으로 주지만 기대지 않는다. 차트는 순서가 어긋나면 그리지 못한다
    candles: usable.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }
  detailMemo.set(memoKey, { savedAt: Date.now(), value: detail })
  // 받은 일봉의 마지막 한 달은 홈 카드 그래프로도 쓴다. 상세를 본 종목은 카드가 다시 묻지 않는다
  rememberCardSeries(stockCode, detail.candles)
  return detail
}

/** 날짜가 틀린 봉과 시·고·저·종이 빈 봉은 getStockDetail이 뺀다(hasPrices). 거래량은 비어도 둔다 */
function toCandle(price: DailyPriceResponse): Candle {
  return {
    date: fromDashedYmd(price.date),
    open: unchecked(price.openPrice),
    high: unchecked(price.highPrice),
    low: unchecked(price.lowPrice),
    close: unchecked(price.closePrice),
    volume: unchecked(price.volume),
  }
}

/** 차트가 그릴 수 있는 봉인가. 시·고·저·종이 모두 유한한 숫자여야 한다(unchecked로 넘긴 자리라 여기서 본다) */
function hasPrices(candle: Candle): boolean {
  return [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
}

/** GET /api/stocks/{code}/news */
interface StockNewsResponse {
  stockCode?: string | null
  stockName?: string | null
  sort?: NewsSort | null
  newsList?: NewsItemResponse[] | null
  page?: number | null
  totalCount?: number | null
}

interface NewsItemResponse {
  timeAgo?: string | null
  /** "2026-08-19T23:09:00" (시간대 없음, KST) */
  publishedAt?: string | null
  title?: string | null
  description?: string | null
  originalLink?: string | null
}

/** 서버는 page를 0~9로 제한한다(@Max(9)). 그 밖을 보내면 400이다 */
export const NEWS_LAST_PAGE = 9

/** 서버가 한 페이지에 주는 기사 수 */
export const NEWS_PAGE_SIZE = 10

/**
 * 종목 뉴스. Pinecone에 모아 둔 기사라 증권사와 무관하다.
 * 10건씩, 최신순(LATEST)은 발행일 내림차순, 관련도순(RELEVANCE)은 벡터 검색 순서다.
 */
export async function getStockNews(
  stockCode: string,
  sort: NewsSort,
  page: number,
): Promise<NewsPage> {
  const memoKey = `${stockCode}|${sort}|${page}`
  const remembered = readMemo(newsMemo, memoKey, NEWS_MEMO_AGE)
  if (remembered !== null) return remembered

  const response = await get<StockNewsResponse | null>(
    `/api/stocks/${encodeURIComponent(stockCode)}/news?sort=${sort}&page=${page}`,
  )
  if (response === null || !Array.isArray(response.newsList)) throw malformedResponse()

  const newsPage: NewsPage = {
    /*
     * 제목이나 링크가 빈 기사는 뺀다. 그리면 제목 없는 카드가 href=""로 지금 페이지를 새 탭에 연다.
     * http(s)가 아닌 링크(javascript:, data:, 상대 주소)도 toNewsItem이 비워 여기서 빠진다
     */
    items: response.newsList
      .map(toNewsItem)
      .filter((item) => item.title.trim() !== '' && item.link.trim() !== ''),
    receivedCount: response.newsList.length,
    page: unchecked(response.page),
    // 비면 "더 보기"를 못 가린다. null로 넘기면 화면이 꽉 찬 페이지인지로 가린다
    totalCount: isFiniteNumber(response.totalCount) ? response.totalCount : null,
    sort: unchecked(response.sort),
  }
  newsMemo.set(memoKey, { savedAt: Date.now(), value: newsPage })
  return newsPage
}

/**
 * 제목·본문에 <b> 태그나 HTML 엔티티가 섞여 올 수 있다(원문이 네이버 검색 결과다).
 * 태그를 지운 뒤 textarea에 넣어 엔티티를 되돌린다. textarea 내용은 HTML로
 * 해석되지 않으므로 무엇이 남아 있어도 실행되지 않는다.
 */
function stripHtml(text: string): string {
  const element = document.createElement('textarea')
  element.innerHTML = text.replace(/<[^>]+>/g, '')
  return element.value
}

/** 언론사명이 응답에 없어 링크 도메인으로 대신한다 */
function toSource(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return '출처 미상'
  }
}

/** 문자열이 아니면 빈 문자열. 기사 한 건의 null 하나가 목록 전체를 실패시키지 않게 한다 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNewsItem(item: NewsItemResponse): NewsItem {
  // http·https가 아니면 빈 문자열이라 그 기사는 빠진다
  const link = safeLink(item.originalLink)
  return {
    title: stripHtml(textOf(item.title)),
    description: stripHtml(textOf(item.description)),
    link,
    source: toSource(link),
    timeAgo: textOf(item.timeAgo),
    publishedAt: new Date(textOf(item.publishedAt)),
  }
}

/* ── 검색 ─────────────────────────────────────────────────────────────── */

/** 검색창 후보 목록에 한 번에 보여줄 최대 개수 */
const MAX_RESULTS = 8

/**
 * 띄어쓰기와 대소문자를 무시하고 비교하려고 다듬는다. "sk 하이닉스" → "sk하이닉스"
 * 검색창이 쓴다.
 */
export function normalize(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

/** 정확히 일치 → 앞부분 일치 → 그 밖의 순서로 보여주기 위한 정렬 키 */
function matchRank(stock: StockInfo, keyword: string): number {
  const name = normalize(stock.stockName)

  if (name === keyword || stock.stockCode === keyword) return 0
  if (name.startsWith(keyword) || stock.stockCode.startsWith(keyword)) return 1
  return 2
}

/** GET /api/stocks/search */
interface SearchRowResponse {
  stockCode?: string | null
  stockName?: string | null
}

/**
 * 서버에서 종목명을 찾는다.
 *
 * **순서는 믿지 않는다.** 서버는 가나다순으로 주므로 "삼성"에 삼성E&A·삼성SDI가 앞을 다 차지하고
 * 정작 찾는 삼성전자가 잘린다. 찾은 종목이 무엇인지만 받아 와서, 순서는 rankStocks가 다시 매긴다.
 *
 * **이것만으로 후보를 정하지 않는다.** 서버는 종목명만 찾아서 종목코드("005930")와 띄어쓴 이름
 * ("sk 하이닉스")은 0건이다. 부르는 쪽이 가진 목록의 결과(searchStocks)와 합쳐 써야 한다.
 *
 * 검색창은 이것이 오기 전에도 가진 목록으로 먼저 후보를 보여 준다(components/SearchBar.tsx).
 * 그래서 이 호출이 늦거나 실패해도 검색이 멈추지 않는다.
 */
export async function searchStocksRemote(keyword: string): Promise<StockInfo[]> {
  const trimmed = keyword.trim()
  if (trimmed === '') return []

  const rows = await get<(SearchRowResponse | null)[] | null>(
    `/api/stocks/search?keyword=${encodeURIComponent(trimmed)}`,
  )
  if (!Array.isArray(rows)) throw malformedResponse()

  return rows.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []
    const { stockCode } = row
    if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return []
    return [{ stockCode, stockName: nameOrCode(row.stockName, stockCode) }]
  })
}

/**
 * 찾아 놓은 후보에 순서를 매긴다. 규칙은 searchStocks와 같다 —
 * 일치 종류(정확→앞부분→그 밖)로 먼저 세우고, 같은 종류 안에서는 거래대금 순으로 둔다.
 *
 * `preferred`는 거래대금 순으로 세운 목록(홈이 가진 것)이다. 여기 없는 종목은 맨 뒤로 보낸다.
 */
export function rankStocks(
  found: StockInfo[],
  keyword: string,
  preferred: StockInfo[],
): StockInfo[] {
  const normalized = normalize(keyword)
  if (normalized === '') return []

  const priority = new Map(preferred.map((stock, index) => [stock.stockCode, index]))

  return [...found]
    // 두 번 세운다. sort가 안정 정렬이라 뒤 기준이 같으면 앞 기준의 순서가 남는다
    .sort(
      (a, b) =>
        (priority.get(a.stockCode) ?? Number.MAX_SAFE_INTEGER) -
        (priority.get(b.stockCode) ?? Number.MAX_SAFE_INTEGER),
    )
    .sort((a, b) => matchRank(a, normalized) - matchRank(b, normalized))
    .slice(0, MAX_RESULTS)
}

/**
 * 종목명·종목코드 부분 검색. 넘겨받은 목록에서 찾는다.
 * 목록은 GET /api/stocks 로 받은 것을 쓴다(도착 전에는 stockList.ts의 사본).
 * "삼성"처럼 여러 종목에 걸리는 말은 후보를 전부 돌려주고 고르는 건 화면에 맡긴다.
 *
 * 서버 검색(searchStocksRemote)이 도착하기 전과 실패했을 때 쓰는 길이다.
 *
 * **넘겨주는 목록의 순서가 곧 같은 순위 안의 우선순위다.** 서버 목록은 가나다순이라
 * 그대로 쓰면 "삼성"에 삼성E&A·삼성SDI·…·삼성전기가 앞을 다 차지하고 삼성전자가 잘린다.
 * 부르는 쪽이 거래대금 순으로 세워서 넘기면 사람들이 찾는 종목이 먼저 온다.
 */
export function searchStocks(stocks: StockInfo[], keyword: string): StockInfo[] {
  const normalized = normalize(keyword)
  if (normalized === '') return []

  return stocks
    .filter(
      (stock) =>
        normalize(stock.stockName).includes(normalized) ||
        stock.stockCode.includes(normalized),
    )
    /*
     * 일치 종류로만 세우고, 같은 종류 안에서는 넘겨받은 순서(거래대금 순)를 그대로 둔다(sort는 안정 정렬).
     * 예전엔 이름 길이를 먼저 봐서 "SK"에 SK하이닉스가 4번째, "삼성"에 거래대금 1위가 맨 뒤로 밀렸다.
     * "삼성전자"를 치면 정확히 같은 삼성전자가 앞부분만 같은 삼성전자우보다 먼저 온다(일치 종류).
     */
    .sort((a, b) => matchRank(a, normalized) - matchRank(b, normalized))
    .slice(0, MAX_RESULTS)
}

/**
 * 거래대금 큰 순. 검색 후보에 쓴다 — 찾는 종목이 위에 오게.
 * 홈 시세표 정렬과 같은 규칙이라 거래대금이 빈 종목은 맨 뒤로 간다(sortStocks)
 */
export function byTradingValue(stocks: Stock[]): Stock[] {
  return sortStocks(stocks, { key: 'tradingValue', direction: 'desc' })
}
