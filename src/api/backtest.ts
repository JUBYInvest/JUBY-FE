import { get, malformedResponse } from './client'
import type { BacktestPeriod, BacktestPreset, QuantScoring } from '../types/backtest'

/**
 * 백테스트 창구. 둘 다 DB만 읽는다 — 새벽 4시 배치가 미리 계산해 둔 값이라
 * 증권사 호출이 없고 응답도 즉시 온다. 로그인도 필요 없다.
 */

/**
 * 종목·성향·기간의 미리 계산된 결과.
 *
 * 실패 코드:
 *   - BACKTEST404_1 종목 없음
 *   - BACKTEST404_5 아직 계산되지 않은 프리셋 (배치가 그 종목을 건너뛴 경우)
 *   - BACKTEST400_1 그 성향이 지원하지 않는 기간
 */
export async function getPreset(
  stockCode: string,
  investType: number,
  period: BacktestPeriod,
): Promise<BacktestPreset> {
  const query = new URLSearchParams({
    stockCode,
    investType: String(investType),
    period,
  })
  const preset = toPreset(await get<PresetResponse | null>(`/api/backtest/preset?${query}`))
  if (preset === null) throw malformedResponse()
  return preset
}

/*
 * 서버가 실제로 주는 모양. 스웨거에 필수 표시가 없어 지표 묶음과 그 안의 낱개를 비어 올 수 있게 적는다.
 * 화면 타입(types/backtest.ts)으로 옮기는 자리(toPreset)에서 걸러 낸다.
 */

/** 묶음 안의 낱개 지표가 전부 비어 올 수 있다 */
type LooseMetrics<T> = { [K in keyof T]?: T[K] | null }

interface ScoringResponse
  extends Omit<QuantScoring, 'stable' | 'profit' | 'effect' | 'growth'> {
  stable?: LooseMetrics<QuantScoring['stable']> | null
  profit?: LooseMetrics<QuantScoring['profit']> | null
  effect?: LooseMetrics<QuantScoring['effect']> | null
  growth?: LooseMetrics<QuantScoring['growth']> | null
}

/** GET /api/backtest/preset */
interface PresetResponse extends Omit<BacktestPreset, 'result'> {
  result?: ScoringResponse | null
}

/**
 * 결과 화면이 반드시 읽는 값이 다 있으면 화면 타입으로 옮기고, 아니면 null.
 * 점수(finalScore)와 네 축의 지표 묶음이다. 하나라도 비면 그리다가 null.필드를 읽어 화면 전체가
 * 오류 화면이 된다(2026-09-23 검사).
 * 묶음 안의 낱개 지표는 걸러 내지 않는다 — 비면 화면이 "-"로 적고 그 축 점수를 비운다(F-2).
 */
function toPreset(preset: PresetResponse | null): BacktestPreset | null {
  if (preset === null || typeof preset !== 'object') return null
  if (typeof preset.investType !== 'number') return null

  const scoring = preset.result
  if (scoring === null || scoring === undefined || typeof scoring !== 'object') return null
  if (typeof scoring.finalScore !== 'number' || !Number.isFinite(scoring.finalScore)) {
    return null
  }
  const { stable, profit, effect, growth } = scoring
  if (!isGroup(stable) || !isGroup(profit) || !isGroup(effect) || !isGroup(growth)) {
    return null
  }
  return {
    ...preset,
    result: {
      ...scoring,
      // 낱개 지표는 거르지 않고 넘긴다(위 설명). 타입만 화면 쪽으로 맞춘다
      stable: stable as QuantScoring['stable'],
      profit: profit as QuantScoring['profit'],
      effect: effect as QuantScoring['effect'],
      growth: growth as QuantScoring['growth'],
    },
  }
}

function isGroup<T extends object>(group: T | null | undefined): group is T {
  return typeof group === 'object' && group !== null
}

interface PresetOptions {
  investType: number
  /** 이 성향으로 실제 DB에 계산되어 있는 기간. enum 순서(짧은 것부터)대로 온다 */
  periods: { period: BacktestPeriod; label: string }[]
}

/**
 * 성향별로 고를 수 있는 기간 목록.
 *
 * 종목과 무관한 전역 값이다(백엔드가 "어떤 종목이든 이 기간이 계산된 적 있나"로 만든다).
 * 그래서 목록에 있어도 특정 종목에는 없을 수 있고, 그때 getPreset이 BACKTEST404_5를 준다.
 */
export function getPresetOptions(): Promise<PresetOptions[]> {
  return get<PresetOptions[]>('/api/backtest/preset/options')
}
