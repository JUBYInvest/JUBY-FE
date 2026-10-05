import type { BacktestPeriod, QuantScoring } from '../types/backtest'
import { isFiniteNumber } from './format'
import type { PersonalityType } from '../types/personality'

/**
 * 백테스트 도메인 규칙. **전부 JUBY-BE 소스에서 그대로 옮긴 값이다.**
 *
 * 서버에도 `GET /api/backtest/preset/options`가 있어 성향별 기간 목록을 내려주지만,
 * 화면이 열리자마자 선택지를 그려야 해서 여기 사본을 둔다.
 * 백엔드가 전략이나 기간 정책을 바꾸면 이 파일도 같이 고쳐야 한다.
 */

/** 기간 프리셋. 배열 순서 = 백엔드 enum 선언 순서 = 짧은 기간부터 */
export const PERIODS: {
  period: BacktestPeriod
  label: string
  months: number
}[] = [
  { period: 'ONE_MONTH', label: '1개월', months: 1 },
  { period: 'THREE_MONTHS', label: '3개월', months: 3 },
  { period: 'SIX_MONTHS', label: '6개월', months: 6 },
  { period: 'ONE_YEAR', label: '1년', months: 12 },
]

/** 채점 4축. 화면에서 순서대로 그린다 */
export const AXES = ['stable', 'profit', 'effect', 'growth'] as const
type Axis = (typeof AXES)[number]

export const AXIS_LABEL: Record<Axis, string> = {
  stable: '안정성',
  profit: '수익성',
  effect: '효율성',
  growth: '성장성',
}

interface InvestTypeInfo {
  /** 백엔드에 보내는 값(1~5). 커질수록 공격적이다 */
  investType: number
  personality: PersonalityType
  strategyName: string
  /** 가이드에 적는 한 줄 설명 */
  strategySummary: string
  /** 매수·매도 조건. 백엔드 전략 클래스의 Rule을 사람 말로 옮긴 것 */
  entryRule: string
  exitRule: string
  /**
   * 이 성향이 고를 수 있는 가장 짧은 기간.
   * 지표가 쓰는 봉 수(RSI 14, 볼린저 20, SMA 60, MACD 26, 돌파 20)를 감당하려면
   * 이만큼은 있어야 한다. 더 짧게 요청하면 서버가 400을 준다.
   */
  minPeriod: BacktestPeriod
  /** 4축을 최종 점수로 합칠 때 쓰는 비중. 합이 1이다 */
  weights: Record<Axis, number>
  /** 이 성향이 특히 들여다보는 지표(설명 문구에 쓴다) */
  focusMetrics: string
}

/**
 * 성향 → 전략 → 기간 제한 → 가중치.
 *
 * **전략은 사용자가 고르는 값이 아니다.** 백엔드 BacktestService가 investType으로
 * 전략을 결정하므로 둘은 1:1이다. 화면에서 따로 고르는 것처럼 보여도
 * 실제로 서버에 나가는 값은 investType 하나뿐이다.
 */
export const INVEST_TYPES: InvestTypeInfo[] = [
  {
    investType: 1,
    personality: '안정형',
    strategyName: 'RSI 역추세 전략',
    strategySummary:
      '너무 많이 팔려 눌린 종목이 제자리로 돌아오는 힘을 노리는 전략이에요.',
    entryRule: 'RSI가 40을 위로 뚫을 때 (과매도에서 회복하기 시작할 때)',
    exitRule: 'RSI가 70을 아래로 뚫을 때 (과열이 식기 시작할 때)',
    minPeriod: 'ONE_MONTH',
    weights: { stable: 0.4, profit: 0.15, effect: 0.3, growth: 0.15 },
    focusMetrics: 'MDD와 표준편차',
  },
  {
    investType: 2,
    personality: '안정추구형',
    strategyName: '볼린저 밴드 돌파 전략',
    strategySummary:
      '주가가 평소 움직이던 띠를 벗어나는 순간을 신호로 삼는 전략이에요.',
    entryRule: '종가가 밴드 상단을 위로 뚫을 때',
    exitRule: '종가가 밴드 하단을 아래로 뚫을 때',
    minPeriod: 'THREE_MONTHS',
    weights: { stable: 0.35, profit: 0.2, effect: 0.3, growth: 0.15 },
    focusMetrics: 'MDD와 샤프비율',
  },
  {
    investType: 3,
    personality: '위험중립형',
    strategyName: '이동평균 교차 전략',
    strategySummary:
      '단기 이동평균선이 장기선을 뚫고 올라갈 때 사고, 내려갈 때 파는 전략이에요.',
    entryRule: '20일선이 60일선을 위로 뚫을 때',
    exitRule: '20일선이 60일선을 아래로 뚫을 때',
    minPeriod: 'SIX_MONTHS',
    weights: { stable: 0.25, profit: 0.25, effect: 0.25, growth: 0.25 },
    focusMetrics: '샤프비율과 연평균수익률',
  },
  {
    investType: 4,
    personality: '적극투자형',
    strategyName: 'MACD 추세추종 전략',
    strategySummary:
      '단기·장기 이동평균의 차이로 추세의 강도와 방향을 함께 읽는 전략이에요.',
    entryRule: 'MACD선이 시그널선을 위로 뚫을 때',
    exitRule: 'MACD선이 시그널선을 아래로 뚫을 때',
    minPeriod: 'THREE_MONTHS',
    weights: { stable: 0.15, profit: 0.3, effect: 0.25, growth: 0.3 },
    focusMetrics: '연평균수익률과 샤프비율',
  },
  {
    investType: 5,
    personality: '공격투자형',
    strategyName: '돌파 전략',
    strategySummary:
      '거래량이 함께 터지며 신고가를 뚫는 순간에 올라타는 전략이에요.',
    entryRule: '최근 20일 최고가를 뚫고, 거래량이 20일 평균의 1.5배 이상일 때',
    exitRule: '돌파 기준선이 무너지고, 매수가에서 ATR의 2배만큼 밀렸을 때',
    minPeriod: 'THREE_MONTHS',
    weights: { stable: 0.1, profit: 0.3, effect: 0.2, growth: 0.4 },
    focusMetrics: '누적수익률과 샤프비율',
  },
]

export function findInvestType(investType: number): InvestTypeInfo | null {
  return INVEST_TYPES.find((item) => item.investType === investType) ?? null
}

export function findByPersonality(
  personality: PersonalityType,
): InvestTypeInfo | null {
  return INVEST_TYPES.find((item) => item.personality === personality) ?? null
}

/**
 * 이 성향이 고를 수 있는 기간만 남긴다.
 * 백엔드가 enum ordinal로 비교하므로 배열 인덱스로 같은 판정을 한다.
 */
export function supportedPeriods(investType: number): BacktestPeriod[] {
  const info = findInvestType(investType)
  if (info === null) return []

  const minIndex = PERIODS.findIndex((item) => item.period === info.minPeriod)
  return PERIODS.slice(minIndex).map((item) => item.period)
}

/**
 * 화면에 적는 기간 이름.
 *
 * '1년'만 몇 개월인지 덧붙인다. 나머지는 이름 자체가 이미 개월 수라
 * 그대로 붙이면 "3개월 (3개월)"처럼 같은 말이 두 번 나온다.
 */
export function periodLabel(period: BacktestPeriod): string {
  const found = PERIODS.find((item) => item.period === period)
  if (found === undefined) return ''
  return found.label === `${found.months}개월`
    ? found.label
    : `${found.label} (${found.months}개월)`
}

/**
 * 적합도 점수를 말로 옮긴다.
 *
 * 프리셋 API는 숫자만 주고 등급을 나누지 않는다. 화면에서 "적합/보통/부적합"을
 * 말하려면 어딘가에서 선을 그어야 해서 여기서 긋는다.
 * 서버가 등급을 내려주기 시작하면 이 함수는 버린다.
 *
 * 50점 선은 AI 답변과 맞춘다. 서버 AI는 같은 점수를 50점 이상이면 "추천 (투자성향에 비교적 적합한 편)",
 * 미만이면 "비추천"으로 말한다(OpenAiService RECOMMEND_SCORE_THRESHOLD). 그래서 50~70점은 "비교적 잘 맞아요"다 —
 * 예전엔 "무난해요"(중립)라 같은 종목이 AI에서는 추천, 이 화면에서는 무난으로 읽혔다(2026-10-04 사용자 결정으로 바꿈).
 */
export function scoreVerdict(score: number): {
  /** 문장 안에 넣는 꼴: "~에 적합한 종목이에요" */
  label: string
  /** 홀로 쓰는 꼴: 점수 밑에 붙이는 짧은 말 */
  short: string
  tone: 'good' | 'normal' | 'bad'
} {
  /*
   * 화면은 점수를 소수 첫째 자리로 적는다. 그 값으로 가르지 않으면 49.95가 "50.0"으로 보이면서
   * "잘 안 맞아요"가 되어, 보이는 숫자와 등급이 어긋난다.
   */
  const shown = Number(score.toFixed(1))
  if (shown >= 70) return { label: '적합한', short: '잘 맞아요', tone: 'good' }
  if (shown >= 50)
    return { label: '비교적 잘 맞는', short: '비교적 잘 맞아요', tone: 'normal' }
  return { label: '맞지 않는', short: '잘 안 맞아요', tone: 'bad' }
}

/**
 * 소수 비율(0.1856)을 백분율 문자열(18.56%)로.
 * 숫자가 아니면 "-"다. 예전엔 null이 0으로 계산돼 "0.00%"가 나와 값이 없는 것과 0이 구분되지 않았다.
 */
export function toPercent(ratio: number | null | undefined, digits = 2): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '-'
  return `${(ratio * 100).toFixed(digits)}%`
}

/* ------------------------------------------------------------------ *
 * 축별 점수 되계산
 *
 * ⚠️ 여기부터는 백엔드 ScoreCalculator를 그대로 베낀 코드다. 원래는 없어야 한다.
 *
 * 백엔드는 안정성·수익성·효율성·성장성 점수를 계산해 놓고 **로그로만 찍고 버린다**
 * (AnalysisCriterionConverter). 응답 DTO에는 finalScore 하나만 담긴다.
 * 그런데 "왜 이 점수인지"를 화면에서 보여주려면 축별 점수가 있어야 해서,
 * 서버가 함께 주는 원시 지표로 같은 계산을 다시 한다.
 *
 * **백엔드 응답에 축별 점수가 추가되면 이 구간은 통째로 지운다.**
 * 그때까지는 정규화 기준값(0.05, 0.4 같은 숫자)이 양쪽에 흩어져 있으므로,
 * 백엔드가 기준을 바꾸면 화면 점수만 조용히 어긋난다. 오래 둘 코드가 아니다.
 * ------------------------------------------------------------------ */

/** 클수록 좋은 지표: min이 0점, max가 100점 */
function normalizePositive(value: number, min: number, max: number): number {
  if (max === min) return 0
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

/** 작을수록 좋은 지표: best가 100점, worst가 0점 */
function normalizeNegative(value: number, best: number, worst: number): number {
  if (worst === best) return 0
  return Math.min(100, Math.max(0, ((worst - value) / (worst - best)) * 100))
}

/** 축 하나의 지표와 정규화·비중. 지표 중 하나라도 비면 그 축은 계산하지 않는다 */
type AxisPart = [value: unknown, score: (value: number) => number, weight: number]

function axisScore(parts: AxisPart[]): number | null {
  let sum = 0
  for (const [value, score, weight] of parts) {
    // 빈 값을 0으로 치면 MDD·변동성이 "0 = 가장 안전"이 되어 값이 없는데 안정성 100점이 나왔다
    if (!isFiniteNumber(value)) return null
    sum += score(value) * weight
  }
  return Math.round(sum * 100) / 100
}

/** 축별 점수(0~100). 그 축의 지표가 하나라도 비면 그 축은 null이다 — 화면이 "-"로 적는다 */
export function calculateAxisScores(
  result: QuantScoring,
): Record<Axis, number | null> {
  return {
    stable: axisScore([
      [result.stable.mdd, (v) => normalizeNegative(v, 0.05, 0.4), 0.5],
      [result.stable.volatility, (v) => normalizeNegative(v, 0.05, 0.4), 0.25],
      [result.stable.dVolatility, (v) => normalizeNegative(v, 0.03, 0.3), 0.25],
    ]),
    profit: axisScore([
      [result.profit.totalReturn, (v) => normalizePositive(v, 0, 0.1), 0.1],
      [result.profit.annualReturn, (v) => normalizePositive(v, 0, 0.5), 0.6],
      [result.profit.avgTradeReturn, (v) => normalizePositive(v, 0, 0.1), 0.3],
    ]),
    effect: axisScore([
      [result.effect.sharpeRatio, (v) => normalizePositive(v, 0, 2), 0.5],
      [result.effect.sortinoRatio, (v) => normalizePositive(v, 0, 3), 0.25],
      [result.effect.calmarRatio, (v) => normalizePositive(v, 0, 3), 0.25],
    ]),
    growth: axisScore([
      [result.growth.momentumRatio, (v) => normalizePositive(v, -0.2, 0.2), 0.4],
      [result.growth.volGrowthRatio, (v) => normalizePositive(v, 0, 0.5), 0.3],
      [result.growth.positionCount, (v) => normalizePositive(v, 0, 20), 0.3],
    ]),
  }
}

/**
 * 기간 끝까지 팔지 않고 들고 있던 매수만 있는 결과인가. **임시 — 백엔드가 끝에 청산하면 지운다.**
 *
 * 백엔드는 기간 끝에 열린 포지션을 청산하지 않는다(CLAUDE.md "백엔드 사정 > 백테스트"). 거래 횟수·수익률은 끝난
 * 거래만 세고 낙폭·변동성은 들고 있던 동안까지 세서, 사서 끝까지 들고 있으면 "거래 0회·수익률 0%"인데 낙폭은 남는다.
 * 정말 한 번도 안 샀으면 손익 흐름이 평평해 낙폭·변동성이 모두 0이다(2026-09-27 실제 프리셋 300건 중 거래 0회
 * 167건: 셋 다 0인 것 68건, 아닌 것 99건). 끝난 거래 뒤에 다시 사서 들고 있는 경우는 여기서 가려낼 수 없다.
 */
export function isHeldToEnd(result: QuantScoring): boolean {
  if (result.growth.positionCount !== 0) return false
  return [result.stable.mdd, result.stable.volatility, result.stable.dVolatility].some(
    (value) => isFiniteNumber(value) && value > 0,
  )
}
