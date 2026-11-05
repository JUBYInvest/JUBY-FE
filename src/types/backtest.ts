/**
 * 백엔드 BacktestResDto와 같은 모양이다.
 * 자바 BigDecimal은 JSON에서 그냥 숫자로 내려오므로 전부 number로 받는다.
 *
 * 비율 계열(수익률·MDD·변동성)은 백분율이 아니라 **소수**다.
 * 0.1856이 18.56%다. ScoreCalculator가 0.0~0.5 같은 범위로 정규화하는 것에서 확인했다.
 */

/** 백엔드 BacktestPeriod enum. 선언 순서가 곧 기간 길이 순서다 */
export type BacktestPeriod =
  | 'ONE_MONTH'
  | 'THREE_MONTHS'
  | 'SIX_MONTHS'
  | 'ONE_YEAR'

/**
 * 백테스트 채점 4축. 각 축을 이루는 지표 3개씩이다.
 * 낱개 지표는 서버가 비워 보낼 수 있어 `number | null`이다(api/backtest.ts toScoring이 거른다) — 화면은 "-"로 적고
 * 그 축 점수를 비운다(utils/backtest.ts calculateAxisScores). 점수(finalScore)만은 없으면 결과 자체가 없는 것이라 숫자다.
 */
export interface QuantScoring {
  stockCode: string
  investType: number
  /** 성향별 가중치로 4축을 합산한 최종 적합도(0~100) */
  finalScore: number
  /** 안정성 — 얼마나 안 깨지는가 */
  stable: {
    /** 최대낙폭 */
    mdd: number | null
    /** 연환산 변동성 */
    volatility: number | null
    /** 연환산 하방 변동성 */
    dVolatility: number | null
  }
  /** 수익성 — 얼마나 벌었는가 */
  profit: {
    totalReturn: number | null
    annualReturn: number | null
    avgTradeReturn: number | null
  }
  /** 효율성 — 위험 대비 얼마나 벌었는가 */
  effect: {
    sharpeRatio: number | null
    sortinoRatio: number | null
    calmarRatio: number | null
  }
  /** 성장성 — 지금 뜨고 있는가 */
  growth: {
    momentumRatio: number | null
    volGrowthRatio: number | null
    /** 기간 중 체결된 매수~매도 한 쌍의 개수 */
    positionCount: number | null
  }
}

/**
 * 백테스트 결과 한 건. 두 곳에서 온다(api/backtest.ts getBacktestResult).
 *
 * - `preset`: GET /api/backtest/preset — 매일 새벽 4시 배치가 미리 채워 둔 값. startDate/endDate가 요청한 날짜가
 *   아니라 **계산에 실제로 쓰인 날짜**다(updatedAt은 받아만 두고 화면에는 아직 안 쓴다 — 바닥 글은 배치 규칙을 적는다).
 * - `live`: GET /api/backtest/run — 프리셋이 아직 없을 때(BACKTEST404_5) 그 자리에서 돌린 값.
 *   같은 규칙(종료일 = 그 종목의 마지막 일봉, 시작일 = 기간으로 역산)인데 응답에 날짜가 없어 셋 다 null이다.
 */
export interface BacktestPreset {
  stockCode: string
  investType: number
  period: BacktestPeriod
  source: 'preset' | 'live'
  /** YYYYMMDD(다른 화면과 같다 — 서버의 YYYY-MM-DD는 api/backtest.ts가 바꾼다). 비어 오거나 즉석 실행이면 null */
  startDate: string | null
  endDate: string | null
  /** ISO 날짜시각. 즉석 실행이면 null */
  updatedAt: string | null
  result: QuantScoring
}
