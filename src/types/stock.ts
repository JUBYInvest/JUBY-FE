/** 종목 식별 정보. 백엔드 stock 테이블과 같은 형태 */
export interface StockInfo {
  stockCode: string
  stockName: string
}

/**
 * GET /api/stocks 한 줄. **기준일(baseDate) 종가**다.
 * 16시 배치 전에는 전 거래일, 후에는 당일 값이다.
 *
 * 백엔드가 daily_price 테이블에서 100종목을 한 번에 주어 보통은 값이 다 있다. 그래도 스웨거에 필수 표시가 없고
 * 그날 일봉이 빠진 종목은 비어 온다 — 숫자 칸은 null일 수 있다(포맷 함수가 "-"로 적고 정렬이 맨 뒤로 보낸다).
 */
export interface Stock extends StockInfo {
  closePrice: number | null
  /** 등락률(%). 1.01이면 +1.01% */
  fluctuate: number | null
  /** 거래대금(원). 거래량이 아니다 */
  tradingValue: number | null
  /** 로그인한 회원의 관심종목이면 true. 비로그인은 항상 false(서버가 비워 보내도 false) */
  isLiked: boolean
}

export type SortKey = 'stockName' | 'closePrice' | 'fluctuate' | 'tradingValue'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  direction: SortDirection
}

/** 화면에서 쓰기 좋게 변환한 일봉 한 개 */
export interface Candle {
  /** YYYYMMDD. 서버는 YYYY-MM-DD로 주지만 다른 화면과 맞추려고 경계에서 바꾼다 */
  date: string
  open: number
  high: number
  low: number
  close: number
  /** 비어 온 날은 null이다(범례는 "-", 거래량 막대는 그날만 빈다) */
  volume: number | null
}

/** 백엔드 Period enum. 상세 화면의 기간 탭이 이 값을 그대로 쓴다 */
export type Period =
  | 'ONE_WEEK'
  | 'ONE_MONTH'
  | 'THREE_MONTH'
  | 'SIX_MONTH'
  | 'ONE_YEAR'
  | 'THREE_YEAR'
  | 'ALL'

/** GET /api/stocks/{code} — 일봉은 DB, 현재가·등락률만 증권사에서 */
export interface StockDetail extends StockInfo {
  /** 증권사에서 받은 현재가. 비어 오면 null("-") */
  currentPrice: number | null
  /** 전일 대비 등락률(%). 비어 오면 null("-") */
  comparePrev: number | null
  period: Period
  /** 오름차순 */
  candles: Candle[]
  /**
   * 응답을 받은 때(ms). 상세 응답에는 시각이 없어(StockDetailRes) 머리 가격이 언제 값인지는
   * 받은 시각으로 적는다. 1분 캐시에서 꺼내도 처음 받은 때다
   */
  receivedAt: number
}

/**
 * 목록에서 상세로 넘어갈 때 링크에 실어 가는 값(`utils/stockPreview.ts`).
 * 상세 응답이 오기 전에 이름·가격 자리를 먼저 채운다.
 * 가격은 목록의 **기준일 종가**라 현재가가 아니다. 상세 화면은 날짜를 붙여 "종가"로 적는다.
 */
export interface StockPreview extends StockInfo {
  closePrice?: number
  /** 기준일 등락률(%) */
  fluctuate?: number
  /** closePrice가 언제 값인지. YYYYMMDD */
  baseDate?: string
}

/**
 * 홈 상단 테마별 대표 종목 카드 한 장. GET /api/stocks/leading-stocks 의 한 행이다.
 *
 * 어떤 종목을 카드에 올릴지는 이 API가 정하고, 그래프(CardSeries)와 종가(CardQuote)는 따로 받는다.
 * 전략 수익률·매매 횟수는 카드에 적지 않아 받지도 않는다(api/stock.ts getLeadingStocks).
 */
export interface TopTheme extends StockInfo {
  /** "기술주 대장" 같은 테마 라벨 */
  theme: string
}

/**
 * 홈 카드의 1년 그래프. 종목 상세 API의 일봉에서 마지막 1년을 잘라 주 단위로 묶어 만든다(api/cardSeries.ts).
 * prices(주마다 마지막 종가)·volumes(주마다 합)는 날짜 오름차순이고 길이가 같다.
 */
export interface CardSeries {
  stockCode: string
  /** 그래프 마지막 봉의 날짜. YYYYMMDD */
  lastDate: string
  /** 종가 */
  prices: number[]
  volumes: number[]
  /** 1년 첫날 종가 대비 마지막 종가의 등락률(%). 주로 묶기 전 일봉으로 낸다 */
  changeRate: number
}

/**
 * 카드 아래쪽에 적는 종가. 홈 시세표(GET /api/stocks, DB)에서 가져온다.
 * 그래프가 어느 날까지인지, 그날 종가가 얼마인지를 밝힌다. 그래프를 못 그린 카드도 이 줄은 있다.
 */
export interface CardQuote {
  closePrice: number
  /** 전일 대비 등락률(%). 서버가 비워 보내면 null */
  fluctuate: number | null
  /** closePrice가 언제 값인지. YYYYMMDD */
  baseDate: string
}

/**
 * GET /api/stocks/leading-stocks 를 화면 쓰임새로 옮긴 모양. 응답의 전략 이름·기간은 대장을 고른 근거가 아니라
 * 머리말에 쓰지 않는다(CLAUDE.md "홈 테마별 대표 종목") — 그래서 옮기지 않는다.
 */
export interface LeadingStocks {
  /** 카드 순서대로. 비어 있을 수 없다(비면 호출한 쪽이 고정 목록으로 물러선다) */
  themes: TopTheme[]
}
