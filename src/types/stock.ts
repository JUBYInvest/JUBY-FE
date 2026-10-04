/** 종목 식별 정보. 백엔드 stock 테이블과 같은 형태 */
export interface StockInfo {
  stockCode: string
  stockName: string
}

/**
 * GET /api/stocks 한 줄. **기준일(baseDate) 종가**다.
 *
 * 예전에는 종목당 현재가를 따로 받아 값이 null일 수 있었는데, 지금은 백엔드가
 * daily_price 테이블에서 100종목을 한 번에 주므로 값이 비는 일이 없다.
 * 16시 배치 전에는 전 거래일, 후에는 당일 값이다.
 */
export interface Stock extends StockInfo {
  closePrice: number
  /** 등락률(%). 1.01이면 +1.01% */
  fluctuate: number
  /** 거래대금(원). 거래량이 아니다 */
  tradingValue: number
  /** 로그인한 회원의 관심종목이면 true. 비로그인은 항상 false */
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
  volume: number
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
  currentPrice: number
  /** 전일 대비 등락률(%) */
  comparePrev: number
  period: Period
  /** 오름차순 */
  candles: Candle[]
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

/** 카드 제목에 필요한 부분. 그래프가 도착하기 전에 이것만으로 먼저 그린다 */
export type TopTheme = Pick<TopStock, 'stockCode' | 'stockName' | 'theme'>

/** 홈 상단 테마별 대표 종목 카드 */
export interface TopStock extends StockInfo {
  /** "기술주 대장" 같은 테마 라벨 */
  theme: string
  /** 받아온 구간(최근 1개월) 처음 대비 등락률(%) */
  changeRate: number
  prices: number[]
  /** prices와 같은 길이 */
  volumes: number[]
}

/** 홈 테마 카드 한 장을 못 채운 이유. 요청 실패와 받은 일봉이 없는 경우를 화면이 다르게 그린다 */
export type CardFailure = 'error' | 'empty'

/**
 * 대장주를 무엇으로 뽑았는지. 홈 머리말의 "백테스트 기법으로 투자한"을 실제 값으로 적는다.
 * 서버가 비워 보낼 수 있어 전부 null을 허용한다 — 하나라도 비면 머리말은 예전 문구로 둔다.
 */
export interface LeadingBasis {
  /** 예: "SMA 이동평균선 전략" */
  strategyName: string | null
  /** 예: "1년" */
  periodLabel: string | null
}

/** GET /api/stocks/leading-stocks 를 화면 쓰임새로 옮긴 모양 */
export interface LeadingStocks {
  basis: LeadingBasis
  /** 카드 순서대로. 비어 있을 수 없다(비면 호출한 쪽이 고정 목록으로 물러선다) */
  themes: TopTheme[]
}
