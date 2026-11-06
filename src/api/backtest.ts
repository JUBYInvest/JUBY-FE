import { ApiError, get, malformedResponse } from './client'
import { PERIODS } from '../utils/backtest'
import { fromDashedYmd } from '../utils/date'
import { finiteOrNull } from '../utils/format'
import type { BacktestPeriod, BacktestPreset, QuantScoring } from '../types/backtest'

/**
 * 백테스트 창구. **로그인해야 한다**(토큰 없으면 401) —
 * 비로그인 실행은 BacktestPage가 로그인 안내로 바꾼다.
 *
 * - `/preset`·`/preset/options`는 DB만 읽는다 — 새벽 4시 배치가 미리 계산해 둔 값이라 증권사 호출이 없고 응답도 즉시 온다.
 * - `/run`은 그 자리에서 전략을 돌린다. DB의 일봉만 쓰므로 역시 증권사 호출은 없고, 결과를 저장하지 않는다.
 *   프리셋이 아직 없는 조합(BACKTEST404_5)에만 쓴다(getBacktestResult) — 있는 조합은 프리셋이 먼저다. AI 답변도 프리셋을 읽으므로
 *   둘이 같은 값을 보여야 한다.
 */

/**
 * 종목·성향·기간의 결과. 프리셋이 있으면 그것, 아직 계산되지 않았으면(BACKTEST404_5) 즉석 실행으로 받는다.
 *
 * 실패 코드(둘 다):
 *   - BACKTEST404_1 종목 없음
 *   - BACKTEST400_1 그 성향이 지원하지 않는 기간(프리셋만. 즉석 실행은 최소 기간을 안 보고 아래 404_6으로 거른다)
 *   - BACKTEST404_4 그 기간에 일봉이 없음(즉석 실행)
 *   - BACKTEST404_6 시작일 앞의 일봉(지표 워밍업용)이 모자람(즉석 실행) — 더 짧은 기간이면 된다
 */
export async function getBacktestResult(
  stockCode: string,
  investType: number,
  period: BacktestPeriod,
): Promise<BacktestPreset> {
  try {
    return await getPreset(stockCode, investType, period)
  } catch (error: unknown) {
    if (!(error instanceof ApiError) || error.code !== 'BACKTEST404_5') throw error
    return runBacktest(stockCode, investType, period)
  }
}

function toQuery(stockCode: string, investType: number, period: BacktestPeriod): string {
  return new URLSearchParams({ stockCode, investType: String(investType), period }).toString()
}

/** GET /api/backtest/preset — 미리 계산된 결과. 없으면 BACKTEST404_5(배치가 그 종목을 건너뛴 경우) */
async function getPreset(
  stockCode: string,
  investType: number,
  period: BacktestPeriod,
): Promise<BacktestPreset> {
  const response = await get<PresetResponse | null>(`/api/backtest/preset?${toQuery(stockCode, investType, period)}`)
  const result = toScoring(response?.result)
  if (result === null) throw malformedResponse()
  return {
    // 종목·성향·기간은 보낸 값을 되돌려 주는 칸이라 보낸 값을 쓴다
    stockCode,
    investType,
    period,
    source: 'preset',
    // 서버는 YYYY-MM-DD로 준다. 다른 날짜처럼 받는 자리에서 YYYYMMDD로 바꾼다(CLAUDE.md "날짜는 YYYYMMDD")
    startDate: dateOrNull(response?.startDate),
    endDate: dateOrNull(response?.endDate),
    updatedAt: textOrNull(response?.updatedAt),
    result,
  }
}

/** GET /api/backtest/run — 그 자리에서 돌린 결과. 응답은 지표뿐이라 날짜는 비운다 */
async function runBacktest(
  stockCode: string,
  investType: number,
  period: BacktestPeriod,
): Promise<BacktestPreset> {
  const response = await get<ScoringResponse | null>(`/api/backtest/run?${toQuery(stockCode, investType, period)}`)
  const result = toScoring(response)
  if (result === null) throw malformedResponse()
  return { stockCode, investType, period, source: 'live', startDate: null, endDate: null, updatedAt: null, result }
}

/*
 * 서버가 실제로 주는 모양. 스웨거에 필수 표시가 없어 지표 묶음과 그 안의 낱개를 비어 올 수 있게 적는다.
 * 화면 타입(types/backtest.ts)으로 옮기는 자리(toScoring)에서 걸러 낸다.
 */

/** 묶음 안의 낱개 지표가 전부 비어 올 수 있다 */
type LooseMetrics<T> = { [K in keyof T]?: T[K] | null }

/** QuantScoringResponse. 프리셋의 result이자 즉석 실행의 본문이다 */
interface ScoringResponse {
  stockCode?: string | null
  investType?: number | null
  finalScore?: number | null
  stable?: LooseMetrics<QuantScoring['stable']> | null
  profit?: LooseMetrics<QuantScoring['profit']> | null
  effect?: LooseMetrics<QuantScoring['effect']> | null
  growth?: LooseMetrics<QuantScoring['growth']> | null
}

/** GET /api/backtest/preset */
interface PresetResponse {
  stockCode?: string | null
  investType?: number | null
  period?: BacktestPeriod | null
  startDate?: string | null
  endDate?: string | null
  updatedAt?: string | null
  result?: ScoringResponse | null
}

/**
 * 결과 화면이 반드시 읽는 값이 다 있으면 화면 타입으로 옮기고, 아니면 null.
 * 점수(finalScore)와 네 축의 지표 묶음이다. 하나라도 비면 그리다가 null.필드를 읽어 화면 전체가
 * 오류 화면이 된다.
 * 묶음 안의 낱개 지표는 유한한 숫자가 아니면 null로 넘긴다 — 화면이 "-"로 적고 그 축 점수를 비운다.
 */
function toScoring(scoring: ScoringResponse | null | undefined): QuantScoring | null {
  if (scoring === null || scoring === undefined || typeof scoring !== 'object') return null
  if (typeof scoring.finalScore !== 'number' || !Number.isFinite(scoring.finalScore)) return null
  const { stable, profit, effect, growth } = scoring
  if (!isGroup(stable) || !isGroup(profit) || !isGroup(effect) || !isGroup(growth)) return null
  return {
    stockCode: typeof scoring.stockCode === 'string' ? scoring.stockCode : '',
    investType: typeof scoring.investType === 'number' ? scoring.investType : 0,
    finalScore: scoring.finalScore,
    stable: {
      mdd: finiteOrNull(stable.mdd),
      volatility: finiteOrNull(stable.volatility),
      dVolatility: finiteOrNull(stable.dVolatility),
    },
    profit: {
      totalReturn: finiteOrNull(profit.totalReturn),
      annualReturn: finiteOrNull(profit.annualReturn),
      avgTradeReturn: finiteOrNull(profit.avgTradeReturn),
    },
    effect: {
      sharpeRatio: finiteOrNull(effect.sharpeRatio),
      sortinoRatio: finiteOrNull(effect.sortinoRatio),
      calmarRatio: finiteOrNull(effect.calmarRatio),
    },
    growth: {
      momentumRatio: finiteOrNull(growth.momentumRatio),
      volGrowthRatio: finiteOrNull(growth.volGrowthRatio),
      positionCount: finiteOrNull(growth.positionCount),
    },
  }
}

function isGroup<T extends object>(group: T | null | undefined): group is T {
  return typeof group === 'object' && group !== null
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** 서버의 YYYY-MM-DD를 YYYYMMDD로. 비었거나 여덟 자리가 안 되면 null(화면이 그 줄을 숨긴다) */
function dateOrNull(value: unknown): string | null {
  const ymd = fromDashedYmd(value)
  return ymd === '' ? null : ymd
}

interface PresetOptions {
  investType: number
  /** 이 성향으로 실제 DB에 계산되어 있는 기간. enum 순서(짧은 것부터)대로 온다 */
  periods: { period: BacktestPeriod; label: string }[]
}

/** GET /api/backtest/preset/options 한 줄. 스웨거에 필수 표시가 없어 전부 비어 올 수 있게 적는다 */
interface PresetOptionsResponse {
  investType?: number | null
  periods?: ({ period?: string | null; label?: string | null } | null)[] | null
}

/**
 * 성향별로 고를 수 있는 기간 목록.
 *
 * 종목과 무관한 전역 값이다(백엔드가 "어떤 종목이든 이 기간이 계산된 적 있나"로 만든다).
 * 그래서 목록에 있어도 특정 종목에는 없을 수 있고, 그때 프리셋이 BACKTEST404_5라 즉석 실행으로 넘어간다(getBacktestResult).
 *
 * 백테스트 화면이 들어오자마자 부르는 요청이라 401이어도 로그인 화면으로 끌고 가지 않는다(공개 화면 규칙, CLAUDE.md "API 계층") —
 * 안 그러면 만료된 토큰으로 /backtest를 열 때 아무것도 누르기 전에 로그인 화면으로 간다.
 * 모양이 틀린 줄(성향 번호가 없거나 모르는 기간)은 뺀다 — 화면은 로컬 표와 교집합을 낸다.
 */
export async function getPresetOptions(): Promise<PresetOptions[]> {
  const rows = await get<(PresetOptionsResponse | null)[] | null>('/api/backtest/preset/options', {
    ignoreUnauthorized: true,
  })
  if (!Array.isArray(rows)) throw malformedResponse()
  return rows.flatMap(toPresetOptions)
}

function toPresetOptions(row: PresetOptionsResponse | null): PresetOptions[] {
  if (typeof row !== 'object' || row === null) return []
  const { investType } = row
  if (typeof investType !== 'number' || !Number.isInteger(investType)) return []
  const periods = (Array.isArray(row.periods) ? row.periods : []).flatMap((item) => {
    const known = PERIODS.find((candidate) => candidate.period === item?.period)
    if (known === undefined) return []
    return [{ period: known.period, label: typeof item?.label === 'string' ? item.label : known.label }]
  })
  return [{ investType, periods }]
}
