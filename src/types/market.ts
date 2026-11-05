/** 국내 지수 한 줄(코스피·코스닥). 화면 아래 지수 띠(MarketIndexBar)가 그린다 */
export interface MarketIndex {
  /** 증권사 업종 코드. 코스피 0001, 코스닥 1001. 서버가 비워 보내면 이름으로 대신한다 */
  code: string
  name: string
  /** 지수(포인트) */
  value: number
  /** 전일 대비율(%). 0.47이면 +0.47% */
  changeRate: number | null
}

export interface MarketIndices {
  indices: MarketIndex[]
  /** 서버가 값을 만든 때(ms). 띠는 "10월 29일 15:30 기준"으로 적는다 */
  receivedAt: number
}

/** 하루가 장이 열리는 날인지. 증권사 휴장일 조회(GET /api/market/holiday)의 개장일 여부(opnd_yn)다 */
export interface MarketDay {
  /** YYYYMMDD */
  date: string
  open: boolean
}

/**
 * 지금 장 상태(한국 시간). 아래 지수 띠가 적는다(api/marketCalendar.ts marketStatus).
 * beforeOpen 장 열기 전(9:00 전) · open 장 중(9:00~15:30) · closed 오늘 장 마감 · dayOff 오늘은 장이 열리지 않는 날
 */
export interface MarketStatus {
  phase: 'beforeOpen' | 'open' | 'closed' | 'dayOff'
  /** 다음에 장이 열리는 날(YYYYMMDD). 받아 둔 휴장일 안에서 못 찾으면 null — 띠가 그 줄을 뺀다 */
  nextOpen: string | null
}

/** 실시간 거래대금 순위 한 줄(GET /api/market/volume-rank). 응답에 종목코드가 없어 이름으로 상세를 찾는다 */
export interface VolumeRankItem {
  rank: number
  stockName: string
  /** 현재가(원) */
  price: number | null
  /** 증권사가 주는 평균 거래대금(원, avrg_tr_pbmn) */
  averageTradingValue: number | null
}
