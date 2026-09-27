import { get, malformedResponse, unchecked } from './client'
import { fromDashedYmd } from '../utils/date'
import { isFiniteNumber } from '../utils/format'
import { sortStocks } from '../utils/sort'
import type {
  Candle,
  Period,
  Stock,
  StockDetail,
  StockInfo,
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

/** 화면에 적을 종목 이름. 비었거나(공백 포함) 문자열이 아니면 종목코드로 대신한다. 관심종목 행도 같이 쓴다 */
export function nameOrCode(name: unknown, stockCode: string): string {
  return typeof name === 'string' && name.trim() !== '' ? name : stockCode
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
 */
export async function getStockDetail(
  stockCode: string,
  period: Period = 'ALL',
): Promise<StockDetail> {
  const response = await get<StockDetailResponse | null>(
    `/api/stocks/${encodeURIComponent(stockCode)}?period=${period}`,
  )
  // 일봉 배열이 없으면 차트를 그릴 수 없다. 현재가·등락률이 빈 건 "-"로 두고 넘긴다
  if (response === null || !Array.isArray(response.dailyPrices)) throw malformedResponse()

  /*
   * 날짜가 여덟 자리가 아닌 봉은 뺀다. 한 봉의 날짜가 null이면 ""가 되어 차트 라이브러리가 던지고, 기간 탭을
   * 바꾸는 순간 차트 구역이 "이 부분을 표시하지 못했어요"가 됐다 — 다시 시도해도 같은 데이터라 안 풀린다.
   * 값이 빈 봉·날짜가 겹친 봉은 차트가 그대로 그려져(2026-09-27 확인) 거르지 않는다.
   */
  const candles = response.dailyPrices.map(toCandle)
  const usable = candles.filter((candle) => /^\d{8}$/.test(candle.date))
  if (usable.length < candles.length) {
    console.warn(`날짜가 틀린 일봉 ${candles.length - usable.length}개를 뺐습니다`, stockCode)
  }

  return {
    stockName: unchecked(response.stockName),
    stockCode: unchecked(response.stockCode),
    // 현재가·등락률이 빈 건 포맷 함수가 "-"로 적는다
    currentPrice: unchecked(response.currentPrice),
    comparePrev: unchecked(response.comparePrev),
    period: unchecked(response.period),
    // 서버가 오름차순으로 주지만 기대지 않는다. 차트는 순서가 어긋나면 그리지 못한다
    candles: usable.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }
}

/** 날짜가 틀린 봉은 getStockDetail이 뺀다. 값이 빈 봉은 거르지 않는다(차트가 그대로 그린다) */
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
  const response = await get<StockNewsResponse | null>(
    `/api/stocks/${encodeURIComponent(stockCode)}/news?sort=${sort}&page=${page}`,
  )
  if (response === null || !Array.isArray(response.newsList)) throw malformedResponse()

  return {
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

/**
 * 새 탭으로 열어도 되는 주소만 남긴다(http·https). 서버가 주는 링크라도 javascript:·data:·상대 주소는
 * 그대로 두면 누르는 순간 이 사이트 안에서 뭔가가 실행되거나 열린다. 아니면 빈 문자열이라 그 기사는 빠진다.
 */
function safeLink(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : ''
  } catch {
    // 기준 주소 없이 풀리지 않는 값(상대 주소 등)
    return ''
  }
}

function toNewsItem(item: NewsItemResponse): NewsItem {
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
 * 검색창과 AI 질문의 종목명 찾기(utils/stockName.ts)가 같이 쓴다.
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

/**
 * 종목명·종목코드 부분 검색. 백엔드에 검색 API가 없어 넘겨받은 목록에서 찾는다.
 * 목록은 GET /api/stocks 로 받은 것을 쓴다(도착 전에는 stockList.ts의 사본).
 * "삼성"처럼 여러 종목에 걸리는 말은 후보를 전부 돌려주고 고르는 건 화면에 맡긴다.
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
