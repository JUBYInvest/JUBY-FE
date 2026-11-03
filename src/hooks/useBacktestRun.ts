import { useEffect, useRef, useState } from 'react'
import { getBacktestResult } from '../api/backtest'
import { ApiError } from '../api/client'
import { INVEST_TYPES } from '../utils/backtest'
import { rememberBacktest } from '../utils/recentBacktests'
import type { BacktestPeriod, BacktestPreset } from '../types/backtest'
import type { StockInfo } from '../types/stock'

/**
 * 종목의 성향을 가릴 때 쓰는 기준 기간.
 *
 * 전략 5개의 점수를 견주려면 **같은 기간**이어야 한다. 그런데 전략마다 고를 수 있는
 * 최소 기간이 달라서(이동평균 교차는 6개월부터), 다섯 전략이 모두 갖춘 기간으로 고정한다.
 * 사용자가 3개월을 골라도 종목 성향만은 늘 이 기간으로 비교한다.
 */
export const COMPARE_PERIOD: BacktestPeriod = 'ONE_YEAR'

export interface Ranked {
  investType: number
  score: number
}

/** 다섯 전략 비교에서 못 받은 것. 이유에 따라 안내가 다르다 */
export interface CompareMiss {
  count: number
  /** 못 받은 것이 전부 "일봉이 모자라 계산할 수 없는 조합"(BACKTEST404_4·404_6)인가 */
  allDataShort: boolean
}

/** 그 기간을 계산할 일봉이 모자란 경우. 기다려도 안 풀리고 더 짧은 기간이면 된다 */
function isDataShort(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'BACKTEST404_4' || error.code === 'BACKTEST404_6')
  )
}

type ResultState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preset: BacktestPreset; ranking: Ranked[]; missed: CompareMiss }
  | { kind: 'error'; message: string; hint: string | null; needsLogin: boolean }

/**
 * 서버 실패 코드를 사람 말로. 코드는 백엔드 BacktestErrorCode 참고.
 * 아는 코드가 아니면(네트워크, 서버 오류, 응답 모양 어긋남) 일반 문구로 둔다.
 * 서버가 준 message는 화면에 쓰지 않는다 — 개발자용 문구나 예외 이름이 섞여 올 수 있다.
 * 원문은 run이 콘솔에 남긴다.
 */
function describeFailure(error: unknown): { message: string; hint: string | null; needsLogin: boolean } {
  if (error instanceof ApiError) {
    /*
     * 백엔드가 /api/backtest/**를 로그인한 회원만 쓰게 바꿨다(JUBY-BE dev 7e5b023, 2026-09-28). 비로그인이면 401이라
     * 기다려도 안 풀린다 — 다시 시도 대신 로그인으로 보낸다. 로그인 상태의 401은 client.ts가 이미 로그인 화면으로 보냈다.
     */
    if (error.status === 401) {
      return { message: '로그인하면 결과를 볼 수 있어요.', hint: null, needsLogin: true }
    }
    switch (error.code) {
      /*
       * 프리셋이 없으면 api/backtest.ts가 즉석 실행으로 넘어가므로 보통 여기까지 오지 않는다. 즉석 실행이 거절한 이유가 온다:
       * 404_6은 시작일 앞의 일봉(지표 워밍업용)이 모자란 것, 404_4는 그 기간에 일봉이 없는 것. 둘 다 더 짧은 기간이면 된다
       */
      case 'BACKTEST404_6':
      case 'BACKTEST404_4':
        return {
          message: '이 종목은 그 기간을 계산할 일봉이 모자라요.',
          hint: '더 짧은 기간을 골라 주세요.',
          needsLogin: false,
        }
      case 'BACKTEST404_5':
        return {
          message: '아직 계산되지 않은 조합이에요.',
          hint: '잠시 후 다시 시도해 주세요.',
          needsLogin: false,
        }
      case 'BACKTEST400_1':
        return {
          message: '이 전략은 그 기간을 지원하지 않아요.',
          hint: '더 긴 기간을 골라 주세요.',
          needsLogin: false,
        }
      case 'BACKTEST404_1':
      case 'STOCK404_1':
        return { message: '목록에 없는 종목이에요.', hint: null, needsLogin: false }
    }
  }
  return {
    message: '결과를 불러오지 못했어요.',
    hint: '잠시 후 다시 시도해 주세요.',
    needsLogin: false,
  }
}

/**
 * 백테스트 실행(2026-10-31 pages/BacktestPage.tsx에서 나눔) — 고른 조합 하나와 종목 성향을 가릴 다섯 성향(1년 기준)을 함께 받아
 * 결과 상태로 둔다. 화면은 조건(종목·전략·기간)을 고르고 run을 부르며, 조건을 건드리면 clear로 거둔다.
 *
 * - 같은 조합은 이 화면에 있는 동안 한 번만 받는다(loadPreset — B-3, 사용자 결정 2026-09-27). 고른 전략이 1년이면 비교용 다섯 건 중
 *   하나와 같은 요청이라 6건이 5건이 되고, 같은 종목에서 기간만 바꾸면 1건이다. 실패한 요청은 지워 다시 시도가 새로 받는다.
 * - 실행 번호(runSeq)로 늦게 온 결과를 버린다 — 기다리는 사이 조건이 바뀌거나(clear) 화면을 떠나면(언마운트).
 * - 결과를 받으면 '최근 본 백테스트'(이 브라우저)에 남긴다.
 */
export function useBacktestRun(): {
  result: ResultState
  run: (stock: StockInfo, investType: number, period: BacktestPeriod) => Promise<void>
  clear: () => void
} {
  const [result, setResult] = useState<ResultState>({ kind: 'idle' })
  /** 실행 번호. 기다리는 사이 조건이 바뀌거나 화면을 떠나면 늦게 온 결과를 버린다 */
  const runSeqRef = useRef(0)
  // 떠난 뒤 도착한 결과는 버린다 — 화면도 없는데 '최근 본 백테스트'에 본 적 없는 결과가 "본 것"으로 남았다(2026-10-31)
  useEffect(
    () => () => {
      runSeqRef.current += 1
    },
    [],
  )
  /*
   * 받은(받는 중인) 결과(프리셋, 없으면 즉석 실행 — api/backtest.ts). 값은 새벽 4시 배치로 바뀌지만 화면에 머무는 동안은 둔다.
   */
  const presetRequestsRef = useRef(new Map<string, Promise<BacktestPreset>>())

  function loadPreset(stockCode: string, investType: number, period: BacktestPeriod): Promise<BacktestPreset> {
    const key = `${stockCode}|${investType}|${period}`
    const saved = presetRequestsRef.current.get(key)
    if (saved !== undefined) return saved

    const request = getBacktestResult(stockCode, investType, period)
    presetRequestsRef.current.set(key, request)
    request.catch(() => presetRequestsRef.current.delete(key))
    return request
  }

  /**
   * 고른 조합 하나와, 종목 성향을 가릴 다섯 성향(1년 기준)을 함께 받는다.
   * 전부 DB 조회라 동시에 보내도 된다. 이미 받은 조합은 다시 보내지 않는다(loadPreset).
   * 다섯 중 일부가 없어도(404) 나머지로 순위를 낸다.
   */
  async function run(stock: StockInfo, investType: number, period: BacktestPeriod) {
    runSeqRef.current += 1
    const seq = runSeqRef.current
    setResult({ kind: 'loading' })

    const rankingTask = Promise.allSettled(
      INVEST_TYPES.map((item) =>
        loadPreset(stock.stockCode, item.investType, COMPARE_PERIOD).then(
          (preset): Ranked => ({
            investType: item.investType,
            score: preset.result.finalScore,
          }),
        ),
      ),
    )

    try {
      const [preset, settled] = await Promise.all([loadPreset(stock.stockCode, investType, period), rankingTask])
      if (seq !== runSeqRef.current) return

      const ranking = settled
        .flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
        .sort((left, right) => right.score - left.score)

      /*
       * 못 받은 이유를 가른다. 전부 "아직 계산 안 됨"이 아닌데 그 문구를 쓰면
       * 서버가 죽었을 때도 기다리면 된다고 읽힌다.
       */
      const failures = settled.flatMap((s) => (s.status === 'rejected' ? [s.reason] : []))
      if (failures.length > 0) console.warn('다섯 성향 비교 일부 조회 실패', failures)
      const missed: CompareMiss = {
        count: failures.length,
        allDataShort: failures.every(isDataShort),
      }

      setResult({ kind: 'ready', preset, ranking, missed })
      rememberBacktest({
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        investType,
        period,
        finalScore: preset.result.finalScore,
      })
    } catch (error: unknown) {
      if (seq !== runSeqRef.current) return
      console.warn('백테스트 조회 실패', error)
      setResult({ kind: 'error', ...describeFailure(error) })
    }
  }

  /**
   * 조건을 건드리면 이전 결과는 더 이상 그 조건의 결과가 아니다.
   * 남겨 두면 화면의 입력과 결과가 어긋난 채로 보인다. 받는 중이던 것도 버린다.
   */
  function clear() {
    runSeqRef.current += 1
    setResult({ kind: 'idle' })
  }

  return { result, run, clear }
}
