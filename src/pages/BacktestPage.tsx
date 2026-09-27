import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPreset, getPresetOptions } from '../api/backtest'
import { ApiError } from '../api/client'
import { byTradingValue, getStockList, searchStocks } from '../api/stock'
import { STOCK_LIST } from '../api/stockList'
import SectionBoundary from '../components/SectionBoundary'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useMyPersonality } from '../hooks/useMyPersonality'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { StockInfo } from '../types/stock'
import type { BacktestPeriod, BacktestPreset } from '../types/backtest'
import { isFiniteNumber } from '../utils/format'
import { PERSONALITY_INFO, isPersonalityType } from '../utils/personality'
import {
  AXES,
  AXIS_LABEL,
  INVEST_TYPES,
  PERIODS,
  calculateAxisScores,
  findByPersonality,
  findInvestType,
  isHeldToEnd,
  periodLabel,
  scoreVerdict,
  supportedPeriods,
  toPercent,
} from '../utils/backtest'
import styles from './BacktestPage.module.css'

/**
 * 종목의 성향을 가릴 때 쓰는 기준 기간.
 *
 * 전략 5개의 점수를 견주려면 **같은 기간**이어야 한다. 그런데 전략마다 고를 수 있는
 * 최소 기간이 달라서(이동평균 교차는 6개월부터), 다섯 전략이 모두 갖춘 기간으로 고정한다.
 * 사용자가 3개월을 골라도 종목 성향만은 늘 이 기간으로 비교한다.
 */
const COMPARE_PERIOD: BacktestPeriod = 'ONE_YEAR'

/** 끝까지 들고 있던 매수가 빠진 지표(수익률·거래횟수)의 설명. 임시 — isHeldToEnd 참고 */
const HELD_DESC = '끝까지 팔지 않은 매수는 빠진 값이에요'

/**
 * 이 전략으로 고를 수 있는 기간. 로컬 표(최소 기간)와 서버가 실제로 계산해 둔 기간의 교집합이다.
 * 서버 목록을 못 받았으면(null) 로컬 표만 쓴다.
 * 기간 선택지와 전략을 바꿀 때 기간을 놓아 줄지 가르는 곳이 같이 쓴다 — 따로 셈하면
 * 선택지에는 없는 기간이 고른 값으로 남는다.
 */
function availablePeriods(
  investType: number,
  serverPeriods: Map<number, BacktestPeriod[]> | null,
): BacktestPeriod[] {
  const local = supportedPeriods(investType)
  const server = serverPeriods?.get(investType)
  return server === undefined ? local : local.filter((p) => server.includes(p))
}

/**
 * 받침이 있으면 '은', 없으면 '는'.
 * 한글이 아니면(NAVER 등) '는'이 자연스러워 기본값으로 둔다.
 */
function withTopicParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  const isHangul = last >= 0xac00 && last <= 0xd7a3
  if (!isHangul) return `${word}는`
  return (last - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`
}

/** 성향테스트를 하러 가는 곳. 끝나면 doneRoute가 홈으로 보낸다(from 없음) */
const PERSONALITY_TEST_URL = '/personality-test'

interface Ranked {
  investType: number
  score: number
}

/** 다섯 전략 비교에서 못 받은 것. 이유에 따라 안내가 다르다 */
interface CompareMiss {
  count: number
  /** 못 받은 것이 전부 "아직 계산 안 된 조합"(BACKTEST404_5)인가 */
  allNotComputed: boolean
}

type ResultState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; preset: BacktestPreset; ranking: Ranked[]; missed: CompareMiss }
  | { kind: 'error'; message: string; hint: string | null }

/**
 * 서버 실패 코드를 사람 말로. 코드는 백엔드 BacktestErrorCode 참고.
 * 아는 코드가 아니면(네트워크, 서버 오류, 응답 모양 어긋남) 일반 문구로 둔다.
 * 서버가 준 message는 화면에 쓰지 않는다 — 개발자용 문구나 예외 이름이 섞여 올 수 있다.
 * 원문은 handleSubmit이 콘솔에 남긴다.
 */
function describeFailure(error: unknown): { message: string; hint: string | null } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'BACKTEST404_5':
        return {
          message: '아직 계산되지 않은 조합이에요.',
          hint: '매일 새벽 4시에 계산돼요. 이 종목은 일봉이 모자라 건너뛰었을 수 있어요.',
        }
      case 'BACKTEST400_1':
        return {
          message: '이 전략은 그 기간을 지원하지 않아요.',
          hint: '더 긴 기간을 골라 주세요.',
        }
      case 'BACKTEST404_1':
      case 'STOCK404_1':
        return { message: '목록에 없는 종목이에요.', hint: null }
    }
  }
  return {
    message: '결과를 불러오지 못했어요.',
    hint: '잠시 후 다시 시도해 주세요.',
  }
}

export default function BacktestPage() {
  useDocumentTitle('주식 백테스트')
  const loggedIn = useIsLoggedIn()

  const [query, setQuery] = useState('')
  const [stock, setStock] = useState<StockInfo | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  /**
   * 검색 대상 종목. 로컬 사본으로 시작해 서버 목록이 오면 바꾼다.
   * 서버에 없는 종목을 골라 봐야 프리셋도 없으므로 서버 목록이 맞다.
   */
  const [stockOptions, setStockOptions] = useState<StockInfo[]>(STOCK_LIST)

  /**
   * 성향은 고르는 값이 아니라 성향테스트 결과다. 로그인했으면 서버에서 받아 오고,
   * 그에 맞는 전략을 미리 골라 둔다. 사용자는 전략만 바꾼다.
   * 서버로 나가는 값은 어차피 investType 하나뿐이라 전략을 고르는 것이 곧 성향을 고르는 것과 같다.
   */
  /*
   * 로그인 상태일 때만 부르고, 로그인·로그아웃(다른 탭 포함)을 따라간다 — 로그아웃하면 성향 문구를 지운다.
   * 만료된 토큰(401)이면 토큰만 지우고 이 화면에 머물고, 못 불러온 것은 "없음"이 아니라 실패로 보인다(useMyPersonality)
   */
  const { personality, retry: retryPersonality } = useMyPersonality(loggedIn)
  const savedPersonality = personality.kind === 'found' ? personality.name : null
  // 모르는 성향 이름이면 맞는 전략도 모른다. 미리 고르지 않는다(실패·없음도 마찬가지)
  const recommended = isPersonalityType(savedPersonality)
    ? findByPersonality(savedPersonality)
    : null

  const [investType, setInvestType] = useState<number | null>(null)
  const [period, setPeriod] = useState<BacktestPeriod | null>(null)

  /**
   * 서버가 실제로 계산해 둔 기간(성향별). 못 받으면 null이고 로컬 표만 쓴다.
   * 로컬 표(supportedPeriods)와 교집합을 내서 선택지를 만든다.
   */
  const [serverPeriods, setServerPeriods] = useState<Map<
    number,
    BacktestPeriod[]
  > | null>(null)

  /**
   * 서버 목록(종목·기간 옵션) 중 하나라도 못 받아 프론트 값으로 대신 보여주는 중인가.
   * 조용히 바꾸면 고른 조합이 서버에 없을 때 "아직 계산되지 않은 조합"만 보고 이유를 모른다
   */
  const [usingFallback, setUsingFallback] = useState(false)

  const [result, setResult] = useState<ResultState>({ kind: 'idle' })
  const resultRef = useRef<HTMLDivElement>(null)
  /** 실행 번호. 기다리는 사이 조건이 바뀌면 늦게 온 결과를 버린다 */
  const runSeqRef = useRef(0)
  /*
   * 받은(받는 중인) 프리셋. 같은 조합은 이 화면에 있는 동안 한 번만 받는다(B-3, 사용자 결정 2026-09-27).
   * 고른 전략이 1년이면 비교용 다섯 건 중 하나와 같은 요청이라 한 번에 6건이 나가며 하나가 겹쳤고,
   * 기간이나 전략만 바꿔 다시 실행해도 같은 종목의 비교 5건을 매번 다시 받았다.
   * 실패한 요청은 지워서 다시 시도가 새로 받게 한다. 값은 새벽 4시 배치로 바뀌지만 화면에 머무는 동안은 둔다.
   */
  const presetRequestsRef = useRef(new Map<string, Promise<BacktestPreset>>())

  function loadPreset(
    stockCode: string,
    investType: number,
    period: BacktestPeriod,
  ): Promise<BacktestPreset> {
    const key = `${stockCode}|${investType}|${period}`
    const saved = presetRequestsRef.current.get(key)
    if (saved !== undefined) return saved

    const request = getPreset(stockCode, investType, period)
    presetRequestsRef.current.set(key, request)
    request.catch(() => presetRequestsRef.current.delete(key))
    return request
  }

  // 서버 목록·기간·내 성향을 한 번에 받는다. 셋 다 실패해도 화면은 로컬 값으로 뜬다
  useEffect(() => {
    getStockList()
      // 거래대금 순으로 세운다. 가나다순이면 "삼성"에 삼성전자가 후보 밖으로 밀린다
      .then(({ stocks }) => setStockOptions(byTradingValue(stocks)))
      .catch((error: unknown) => {
        console.warn('종목 목록 조회 실패', error)
        setUsingFallback(true)
      })

    getPresetOptions()
      .then((options) =>
        setServerPeriods(
          new Map(
            options.map((o) => [o.investType, o.periods.map((p) => p.period)]),
          ),
        ),
      )
      .catch((error: unknown) => {
        console.warn('프리셋 기간 조회 실패', error)
        setUsingFallback(true)
      })
  }, [])

  // 내 성향이 도착했고 아직 전략을 안 골랐으면 맞는 전략을 미리 고른다
  useEffect(() => {
    if (recommended !== null && investType === null) {
      setInvestType(recommended.investType)
    }
    // investType은 일부러 뺀다. 사용자가 비운 뒤 다시 채워 넣으면 안 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended])

  const selected = investType === null ? null : findInvestType(investType)

  const periodChoices = useMemo(
    () => (investType === null ? [] : availablePeriods(investType, serverPeriods)),
    [investType, serverPeriods],
  )

  const isRunning = result.kind === 'loading'
  const canRun =
    stock !== null && investType !== null && period !== null && !isRunning

  const matches = useMemo(() => {
    const keyword = query.trim()
    if (keyword === '') return []
    // 고른 종목의 이름이 그대로 적혀 있으면 다시 펼칠 이유가 없다
    if (stock !== null && keyword === stock.stockName) return []

    return searchStocks(stockOptions, keyword)
  }, [query, stock, stockOptions])

  /*
   * 조건을 건드리면 이전 결과는 더 이상 그 조건의 결과가 아니다.
   * 남겨 두면 화면의 입력과 결과가 어긋난 채로 보인다. 받는 중이던 것도 버린다.
   */
  function clearResult() {
    runSeqRef.current += 1
    setResult({ kind: 'idle' })
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setStock(null)
    setIsSearchOpen(true)
    clearResult()
  }

  function selectStock(item: StockInfo) {
    setStock(item)
    setQuery(item.stockName)
    setIsSearchOpen(false)
    clearResult()
  }

  /**
   * 전략마다 고를 수 있는 기간이 달라서, 전략을 바꾸면 못 쓰게 된 기간을 놓아 준다.
   * 안 놓아 주면 화면에는 3개월이 적혀 있는데 서버는 400을 주는 상태가 된다.
   * 서버 목록에 없는 기간도 놓아 준다. 로컬 표만 보면 선택지에서 사라진 기간이 고른 값으로 남는다.
   */
  function changeStrategy(next: number | null) {
    setInvestType(next)
    if (next !== null && period !== null) {
      if (!availablePeriods(next, serverPeriods).includes(period)) {
        setPeriod(null)
      }
    }
    clearResult()
  }

  /**
   * 고른 조합 하나와, 종목 성향을 가릴 다섯 성향(1년 기준)을 함께 받는다.
   * 전부 DB 조회라 동시에 보내도 된다. 이미 받은 조합은 다시 보내지 않는다(loadPreset).
   * 다섯 중 일부가 없어도(404) 나머지로 순위를 낸다.
   */
  async function handleSubmit() {
    if (stock === null || investType === null || period === null) return

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
      const [preset, settled] = await Promise.all([
        loadPreset(stock.stockCode, investType, period),
        rankingTask,
      ])
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
        allNotComputed: failures.every(
          (error) => error instanceof ApiError && error.code === 'BACKTEST404_5',
        ),
      }

      setResult({ kind: 'ready', preset, ranking, missed })
    } catch (error: unknown) {
      if (seq !== runSeqRef.current) return
      console.warn('백테스트 조회 실패', error)
      setResult({ kind: 'error', ...describeFailure(error) })
    }
  }

  /*
   * 결과는 폼 아래에 그려진다. 버튼을 눌러도 화면이 그대로면 무엇이 달라졌는지 알 수 없어
   * 결과가 생기는 순간 그쪽으로 내린다. 결과를 지울 때(다시하기)는 움직이지 않는다.
   */
  useEffect(() => {
    if (result.kind !== 'ready' || resultRef.current === null) return

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    resultRef.current.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [result.kind])

  return (
    <div className={styles.layout}>
      <div className={styles.content}>
        <h1 className={styles.title}>주식 백테스트 이용하기</h1>

        {/*
          성향은 고르는 칸이 아니라 '이미 정해진 나의 정보'다.
          입력 칸에서 빼고 맨 위에 사실로 적어 둔다.
        */}
        <div className={styles.myBanner}>
          {personality.kind === 'loading' ? (
            <p className={styles.myText}>내 투자성향을 불러오는 중이에요.</p>
          ) : personality.kind === 'error' ? (
            /* 못 불러왔으면 검사를 권하지 않는다 — 다시 검사하면 멀쩡한 성향을 덮어쓴다 */
            <>
              <p className={styles.myText}>성향을 불러오지 못했어요.</p>
              <button type="button" className={styles.myAction} onClick={retryPersonality}>
                다시 시도
              </button>
            </>
          ) : savedPersonality === null ? (
            <>
              <p className={styles.myText}>
                {loggedIn
                  ? '투자성향테스트를 아직 안 하셨어요. 먼저 하면 나에게 맞는 전략을 자동으로 골라드려요.'
                  : '로그인하고 투자성향테스트를 하면 나에게 맞는 전략을 자동으로 골라드려요.'}
              </p>
              <Link className={styles.myAction} to={PERSONALITY_TEST_URL}>
                테스트하러 가기
              </Link>
            </>
          ) : (
            <>
              <p className={styles.myText}>
                내 투자성향은 <b>{savedPersonality}</b>이에요.
                {recommended !== null && (
                  <>
                    {' '}
                    여기에 맞는 <b>{recommended.strategyName}</b>을 골라 뒀어요.
                  </>
                )}
              </p>
              <Link className={styles.myAction} to={PERSONALITY_TEST_URL}>
                다시 테스트
              </Link>
            </>
          )}
        </div>

        {usingFallback && (
          <p className={styles.fallbackNote} role="status">
            서버 목록을 받지 못해 기본 목록으로 보여드려요. 결과가 없는 조합이 있을 수 있어요.
          </p>
        )}

        <section className={styles.form}>
          {/* 종목 선택 --------------------------------------------------- */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="backtest-stock">
              <span className={styles.step}>1</span>
              종목 선택
            </label>

            <div className={styles.searchWrap}>
              <div className={styles.control}>
                <input
                  id="backtest-stock"
                  className={styles.input}
                  type="text"
                  value={query}
                  placeholder="종목을 검색해주세요. (예: 삼성전자)"
                  autoComplete="off"
                  onChange={(event) => handleQueryChange(event.target.value)}
                  onFocus={() => setIsSearchOpen(true)}
                  onBlur={() => setIsSearchOpen(false)}
                />
                {stock !== null && (
                  <span className={styles.code}>{stock.stockCode}</span>
                )}
              </div>

              {isSearchOpen && matches.length > 0 && (
                /*
                 * 목록을 누르면 입력칸이 먼저 focus를 잃어 목록이 닫히고 클릭이 사라진다.
                 * mousedown을 막아 focus를 붙잡아 둔다.
                 */
                <ul
                  className={styles.matches}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {matches.map((item) => (
                    <li key={item.stockCode}>
                      <button
                        type="button"
                        className={styles.match}
                        onClick={() => selectStock(item)}
                      >
                        <span>{item.stockName}</span>
                        <span className={styles.code}>{item.stockCode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 투자전략 선택 ------------------------------------------------ */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="backtest-strategy">
              <span className={styles.step}>2</span>
              투자전략 선택
            </label>

            <div className={styles.control}>
              <select
                id="backtest-strategy"
                className={styles.select}
                value={investType ?? ''}
                onChange={(event) =>
                  changeStrategy(
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                  )
                }
              >
                <option value="">투자전략을 선택해주세요.</option>
                {INVEST_TYPES.map((item) => (
                  <option key={item.investType} value={item.investType}>
                    {item.strategyName}
                  </option>
                ))}
              </select>

              {investType !== null &&
                recommended !== null &&
                recommended.investType !== investType && (
                  <button
                    type="button"
                    className={styles.reset}
                    onClick={() => changeStrategy(recommended.investType)}
                  >
                    재설정
                  </button>
                )}
            </div>

            {/*
              좁은 화면에서는 가이드가 오른쪽이 아니라 아래로 내려간다.
              방향을 말하면 절반은 틀린 말이 되므로 위치를 가리키지 않는다.
              고른 전략이 무엇인지도 여기서 한 줄로 되짚어 준다 —
              가이드까지 눈을 옮기지 않아도 무엇을 골랐는지 알 수 있어야 한다.
            */}
            <p className={styles.hint}>
              {selected === null
                ? '백테스트 가이드에서 전략을 눌러 골라도 돼요.'
                : selected.strategySummary}
            </p>
          </div>

          {/* 투자기간 선택 ------------------------------------------------ */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="backtest-period">
              <span className={styles.step}>3</span>
              투자기간 선택
            </label>

            <div className={styles.control}>
              <select
                id="backtest-period"
                className={styles.select}
                value={period ?? ''}
                disabled={investType === null}
                onChange={(event) => {
                  setPeriod(
                    event.target.value === ''
                      ? null
                      : (event.target.value as BacktestPeriod),
                  )
                  clearResult()
                }}
              >
                <option value="">
                  {investType === null
                    ? '투자전략을 먼저 선택해주세요.'
                    : '투자기간을 선택해주세요.'}
                </option>
                {PERIODS.filter((item) =>
                  periodChoices.includes(item.period),
                ).map((item) => (
                  <option key={item.period} value={item.period}>
                    {periodLabel(item.period)}
                  </option>
                ))}
              </select>
            </div>

            {selected !== null && periodChoices.length < PERIODS.length && (
              <p className={styles.hint}>
                {selected.strategyName}은 지표를 계산하는 데 봉이 많이 필요해서{' '}
                <b>{periodLabel(selected.minPeriod)}</b> 이상만 고를 수 있어요.
              </p>
            )}
          </div>

          <div className={styles.submitRow}>
            <button
              type="button"
              className={styles.submit}
              disabled={!canRun}
              onClick={() => void handleSubmit()}
            >
              {isRunning ? '불러오는 중…' : '백테스트 시작하기'}
            </button>

            {/* 버튼이 꺼져 있는 이유를 말해 준다. 안 그러면 왜 안 눌리는지 알 길이 없다 */}
            {!canRun && !isRunning && (
              <p className={styles.submitHint}>
                {stock === null
                  ? '종목을 먼저 골라주세요.'
                  : investType === null
                    ? '투자전략을 골라주세요.'
                    : '투자기간을 골라주세요.'}
              </p>
            )}
          </div>
        </section>

        <div ref={resultRef}>
          {result.kind === 'loading' && (
            <p className={styles.loadingBox}>백테스트 결과를 불러오는 중…</p>
          )}

          {result.kind === 'error' && (
            <div className={styles.errorBox}>
              <p className={styles.errorText}>{result.message}</p>
              {result.hint !== null && (
                <p className={styles.errorHint}>{result.hint}</p>
              )}
              <button
                type="button"
                className={styles.errorRetry}
                onClick={() => void handleSubmit()}
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 결과를 그리다 멈춰도 입력 폼은 남는다. 다시 시도하면 같은 조건으로 다시 받는다 */}
          {result.kind === 'ready' && stock !== null && (
            <SectionBoundary onRetry={() => void handleSubmit()}>
              <BacktestResult
                preset={result.preset}
                ranking={result.ranking}
                missed={result.missed}
                stockName={stock.stockName}
                savedPersonality={savedPersonality}
                onRetry={clearResult}
              />
            </SectionBoundary>
          )}
        </div>
      </div>

      <BacktestGuide
        investType={investType}
        savedPersonality={savedPersonality}
        onSelect={changeStrategy}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- *
 * 결과
 * -------------------------------------------------------------------- */

interface ResultProps {
  preset: BacktestPreset
  stockName: string
  /** 다섯 전략의 적합도를 높은 순으로. 첫 번째가 이 종목의 성향이다. 비어 있을 수 있다 */
  ranking: Ranked[]
  /** 다섯 중 못 받은 것 */
  missed: CompareMiss
  savedPersonality: string | null
  onRetry: () => void
}

function BacktestResult({
  preset,
  stockName,
  ranking,
  missed,
  savedPersonality,
  onRetry,
}: ResultProps) {
  const info = findInvestType(preset.investType)
  if (info === null) return null

  /*
   * 1등. 화면에 적는 점수(소수 첫째 자리)가 같으면 공동 1위다 — 예전엔 번호 작은 성향 하나를 "가장 잘 맞는"으로
   * 단정했다(사용자 결정 2026-09-27). 순서는 정렬 그대로(점수, 같으면 성향 번호)
   */
  const topScore = ranking[0]?.score.toFixed(1) ?? null
  const isTop = (item: Ranked) => item.score.toFixed(1) === topScore
  const best = ranking[0] ?? null
  const topInfos = ranking
    .filter(isTop)
    .flatMap((item) => findInvestType(item.investType) ?? [])
  const isJoint = topInfos.length > 1
  const topNames = topInfos.map((item) => item.personality).join('·')

  const { result } = preset
  const axisScores = calculateAxisScores(result)
  const verdict = scoreVerdict(result.finalScore)
  /** 종목이 나와 같은 성향으로 판정됐는가(공동 1위 중 하나여도 같다) */
  const isSame =
    savedPersonality !== null &&
    topInfos.some((item) => item.personality === savedPersonality)
  /** 내 성향에 딸린 전략을 그대로 돌렸는가 (다른 전략으로 바꿔 볼 수 있다) */
  const usedOwnStrategy = savedPersonality === info.personality

  /*
   * 지표를 표로 늘어놓으면 숫자는 보이는데 뜻이 안 보인다. JUBY는 초보자용이라
   * 용어 자체가 벽이다("샤프비율 1.69"를 읽고 좋은지 나쁜지 알 수 있는 사람은 적다).
   * 그래서 값마다 한 줄 해설을 붙이고, 어려운 말은 쉬운 이름을 앞세우고 원래 용어를 괄호에 둔다.
   */
  /*
   * 낱개 지표는 비어 올 수 있다(isUsablePreset이 막지 않는다). 값이 있을 때만 숫자·색을 쓰고 아니면 "-"다.
   * null >= 0은 참이라 그대로 두면 "-"가 빨간색으로 칠해지고, null.toFixed에서 결과 구역이 멈췄다
   */
  const toneOf = (value: unknown): 'up' | 'down' | undefined =>
    isFiniteNumber(value) ? (value >= 0 ? 'up' : 'down') : undefined
  const positionCount = result.growth.positionCount
  const hasPositionCount = Number.isInteger(positionCount)
  /*
   * 임시(백엔드가 끝에 청산하면 지운다): 사서 끝까지 들고 있으면 서버가 그 매수를 수익률·거래횟수에서 빼
   * "거래 0회·수익률 0%"로 준다. 그 세 값에 빠진 게 있다고 적고, 거래 0회 경고 대신 따로 알린다
   */
  const heldToEnd = isHeldToEnd(result)

  const metrics: {
    label: string
    value: string
    tone?: 'up' | 'down'
    desc: string
  }[] = [
    {
      label: '누적수익률',
      value: toPercent(result.profit.totalReturn),
      tone: toneOf(result.profit.totalReturn),
      desc: heldToEnd ? HELD_DESC : '이 기간에 전략을 그대로 따랐다면 이만큼 벌었어요',
    },
    {
      label: '연평균수익률',
      value: toPercent(result.profit.annualReturn),
      tone: toneOf(result.profit.annualReturn),
      desc: heldToEnd ? HELD_DESC : '1년치로 환산하면 이 정도 속도예요',
    },
    {
      label: '최대낙폭 (MDD)',
      value: toPercent(result.stable.mdd),
      desc: '가장 많이 물렸을 때 고점에서 이만큼 떨어졌어요',
    },
    {
      label: '위험 대비 수익 (샤프비율)',
      value: isFiniteNumber(result.effect.sharpeRatio)
        ? result.effect.sharpeRatio.toFixed(2)
        : '-',
      desc: '1을 넘으면 감수한 위험에 비해 잘 번 편이에요',
    },
    {
      label: '오르내림 (변동성)',
      value: toPercent(result.stable.volatility),
      desc: '클수록 가격이 심하게 출렁였어요',
    },
    {
      label: '거래횟수',
      value: hasPositionCount ? `${positionCount}회` : '-',
      desc: heldToEnd ? HELD_DESC : '이 기간에 전략이 사고판 횟수예요',
    },
  ]

  return (
    <section className={styles.result}>
      <div className={styles.resultHead}>
        <h2 className={styles.resultTitle}>백테스트 결과</h2>

        <button type="button" className={styles.retry} onClick={onRetry}>
          백테스트 다시하기
        </button>
      </div>

      {/*
        읽는 사람이 가장 먼저 알아야 할 한 줄.
        "나는 이런 사람 → 이 전략으로 봤더니 → 이 종목은 이런 사람에게 맞더라"
        세 마디를 순서대로 잇는다. 다섯 성향 비교가 없으면 앞 두 마디만 한다.
      */}
      <div className={styles.compare}>
        <p className={styles.story}>
          {savedPersonality === null ? (
            <>
              <b>{info.strategyName}</b>으로 분석했어요.
            </>
          ) : (
            <>
              나는 <b>{savedPersonality}</b>,{' '}
              {usedOwnStrategy ? (
                <>
                  여기에 맞는 <b>{info.strategyName}</b>으로 분석했어요.
                </>
              ) : (
                <>
                  하지만 <b>{info.personality}</b>용인{' '}
                  <b>{info.strategyName}</b>으로 분석했어요.
                </>
              )}
            </>
          )}
          {topInfos.length > 0 && (
            <>
              <br />그 결과 {withTopicParticle(stockName)}{' '}
              <b className={isSame ? styles.good : styles.bad}>{topNames}</b>
              {isJoint
                ? '에게 똑같이 가장 잘 맞는 종목이에요(공동 1위).'
                : '에게 가장 잘 맞는 종목이에요.'}
            </>
          )}
        </p>

        {topInfos.length > 0 && best !== null && (
          <div className={styles.matchRow}>
            <div className={styles.matchSide}>
              <span className={styles.matchLabel}>내 투자성향</span>
              <strong className={styles.matchValue}>
                {savedPersonality ?? '아직 없어요'}
              </strong>
              <span className={styles.matchFrom}>투자성향테스트 결과</span>
            </div>

            <span className={styles.matchSign} aria-hidden="true">
              {isSame ? '=' : '↔'}
            </span>

            <div className={styles.matchSide}>
              <span className={styles.matchLabel}>{stockName}의 투자성향</span>
              <strong className={styles.matchValue}>{topNames}</strong>
              <span className={styles.matchFrom}>
                적합도 {best.score.toFixed(1)}점으로 {isJoint ? '공동 1위' : '가장 높음'}
              </span>
            </div>
          </div>
        )}

        {savedPersonality !== null && topInfos.length > 0 && !isSame && (
          <p className={styles.matchText}>
            성향이 서로 달라요. 내 성향대로 간다면 {stockName}보다 더 맞는
            종목이 있을 수 있어요.
          </p>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          {info.strategyName}으로 본 {stockName}
          <span className={styles.cardNote}>{periodLabel(preset.period)}</span>
        </h3>

        <div className={styles.scoreRow}>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>적합도</span>
            <span className={styles.score}>
              {result.finalScore.toFixed(1)}
              <span className={styles.scoreMax}>/ 100</span>
            </span>
            <span
              className={`${styles.scoreVerdict} ${styles[verdict.tone]}`}
            >
              {verdict.short}
            </span>
          </div>

          {/*
            축 점수는 서버가 주지 않아 원시 지표로 되계산한 값이다.
            가중치를 함께 적어 두면 "왜 이 총점인지"가 표만 보고도 읽힌다.
          */}
          <ul className={styles.axes}>
            {AXES.map((axis) => (
              <li key={axis}>
                <div className={styles.axisHead}>
                  <span className={styles.axisName}>{AXIS_LABEL[axis]}</span>
                  <span className={styles.axisWeight}>
                    비중 {Math.round(info.weights[axis] * 100)}%
                  </span>
                  {/* 지표가 빠진 축은 점수를 모른다. 0이 아니라 "-"로 적고 막대는 비운다 */}
                  <span className={styles.axisScore}>
                    {axisScores[axis]?.toFixed(0) ?? '-'}
                  </span>
                </div>
                <div className={styles.bar} aria-hidden="true">
                  <div
                    className={styles.barFill}
                    style={{ width: `${axisScores[axis] ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 위 4축에 붙은 '비중 %'가 왜 그 값인지를 바로 아래에서 설명한다 */}
        <ul className={styles.notes}>
          <li>
            <b>{info.personality}</b>은 이런 스타일이에요.
            <span className={styles.noteBody}>
              {PERSONALITY_INFO[info.personality].description}
            </span>
          </li>
          <li>
            그래서 <b>{info.focusMetrics}</b>를 특히 눈여겨봐요.
            <span className={styles.noteBody}>
              적합도를 매길 때 {AXIS_LABEL.stable}에{' '}
              {Math.round(info.weights.stable * 100)}%, {AXIS_LABEL.profit}에{' '}
              {Math.round(info.weights.profit * 100)}% 비중을 둡니다.
            </span>
          </li>
        </ul>

        {/*
          표 대신 낱장 카드로 편다. 표는 가로로 길어 좁은 화면에서 밀어 봐야 하고,
          칸이 좁아 해설을 넣을 자리가 없다. 카드는 화면 폭에 따라 3·2·1열로 접힌다.
        */}
        <ul className={styles.metrics}>
          {metrics.map((metric) => (
            <li key={metric.label} className={styles.metric}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <strong
                className={
                  metric.tone === undefined
                    ? styles.metricValue
                    : `${styles.metricValue} ${styles[metric.tone]}`
                }
              >
                {metric.value}
              </strong>
              <span className={styles.metricDesc}>{metric.desc}</span>
            </li>
          ))}
        </ul>

        {/*
          거래가 한 번도 안 걸리면 손익이 0이라 낙폭도 변동성도 0이 되고,
          안정성 점수만 100점으로 치솟는다. 점수만 보면 '아주 안정적인 종목'처럼 읽히지만
          실제로는 이 전략이 이 종목에서 신호를 한 번도 못 잡은 것이다. 먼저 알린다.
        */}
        {hasPositionCount && positionCount === 0 && !heldToEnd && (
          <p className={styles.warn}>
            이 기간에는 매매 신호가 한 번도 나오지 않았어요. 손익이 없어 안정성
            점수가 높게 잡히니, 적합도보다 <b>거래횟수 0회</b>를 먼저 봐주세요.
          </p>
        )}
        {/*
          임시 안내. 산 뒤 기간이 끝날 때까지 파는 신호가 없으면 서버가 그 매수를 셈에서 빼
          "매매 신호가 없었다"와 같은 숫자를 준다. 그 경고를 띄우면 틀린 말이라 이 안내로 바꾼다
        */}
        {heldToEnd && (
          <p className={styles.warn}>
            이 기간에 산 주식을 끝까지 팔지 않고 들고 있었어요. 지금은 팔지 않은 매수가
            수익률·거래횟수에 들어가지 않아 <b>수익률 0%·거래 0회</b>로 보이고, 적합도도 그
            값으로 매겨졌어요. 낙폭·변동성은 들고 있던 동안의 값이에요.
          </p>
        )}
      </div>

      {/*
        카드마다 맡은 말이 하나씩이다.
        ① 결론(내 성향 ↔ 종목 성향) ② 고른 전략의 성적 ③ 왜 그 성향으로 판정됐는가.
        한 카드에 다 넣으면 스크롤만 길고 무엇을 먼저 봐야 할지 알 수 없다.
      */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          {withTopicParticle(stockName)} 어떤 성향에 맞나요?
          <span className={styles.cardNote}>1년 기준으로 다섯 전략을 비교</span>
        </h3>

        {ranking.length === 0 ? (
          <p className={styles.warn}>
            {missed.allNotComputed
              ? '1년치 결과가 아직 계산되지 않아 비교할 수 없어요.'
              : '비교 결과를 불러오지 못했어요.'}
          </p>
        ) : (
          <>
            <ul className={isJoint ? `${styles.rankList} ${styles.joint}` : styles.rankList}>
              {ranking.map((item) => {
                const rankInfo = findInvestType(item.investType)
                if (rankInfo === null) return null

                return (
                  <li key={item.investType} className={styles.rank}>
                    <span className={styles.rankName}>
                      {isTop(item) && (
                        <b className={styles.crown}>{isJoint ? '공동 1위' : '최고'}</b>
                      )}
                      {rankInfo.personality}
                    </span>
                    <div className={styles.bar}>
                      <div
                        className={isTop(item) ? styles.barFillTop : styles.barFill}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <span className={styles.rankScore}>{item.score.toFixed(1)}</span>
                  </li>
                )
              })}
            </ul>
            {/* 빠진 전략이 있으면 위 순위의 1등이 진짜 1등이 아닐 수 있다 */}
            {missed.count > 0 && (
              <p className={styles.warn}>{missed.count}개 전략은 불러오지 못했어요.</p>
            )}
          </>
        )}

        <p className={styles.meta}>
          {preset.startDate} ~ {preset.endDate} 일봉 기준 · 매일 새벽 4시에 다시
          계산돼요
        </p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- *
 * 오른쪽 가이드 — 읽는 글이 아니라 고르는 도구다
 * -------------------------------------------------------------------- */

interface GuideProps {
  investType: number | null
  savedPersonality: string | null
  onSelect: (investType: number) => void
}

/**
 * 전략 설명을 왼쪽 선택칸과 따로 두면 아무도 안 읽는다. 목록을 그대로 **버튼**으로 만들어,
 * 설명을 읽다가 마음에 들면 그 자리에서 고르게 한다.
 *
 * 다섯 개를 모두 펼치면 글이 너무 길어 훑기 어렵다. 고른 것만 펼쳐서 매수·매도 조건까지
 * 보이고 나머지는 한 줄 요약으로 접어 둔다.
 */
function BacktestGuide({ investType, savedPersonality, onSelect }: GuideProps) {
  return (
    <aside className={styles.guide}>
      <h2 className={styles.guideTitle}>
        JUBY의
        <br />
        백테스트 가이드
      </h2>

      <div className={styles.guideCard}>
        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>백테스트가 뭔가요?</h3>
          <p className={styles.guideBody}>
            투자 전략을 과거 주가에 그대로 적용해 <b>가상으로</b> 사고팔아 보는
            거예요. 실제 돈 없이 수익률과 최대 손실을 미리 확인할 수 있어요.
          </p>
        </section>

        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>
            전략 고르기
            <span className={styles.guideTip}>눌러서 선택</span>
          </h3>

          <ul className={styles.strategyList}>
            {INVEST_TYPES.map((item) => {
              const isActive = item.investType === investType
              const isRecommended =
                savedPersonality !== null &&
                item.personality === savedPersonality

              return (
                <li key={item.investType}>
                  <button
                    type="button"
                    className={
                      isActive ? styles.strategyOn : styles.strategyOff
                    }
                    aria-pressed={isActive}
                    onClick={() => onSelect(item.investType)}
                  >
                    <span className={styles.strategyTop}>
                      <RiskDots level={item.investType} />
                      {isRecommended && (
                        <span className={styles.badge}>나에게 맞음</span>
                      )}
                    </span>

                    <span className={styles.strategyName}>
                      {item.strategyName}
                    </span>
                    <span className={styles.strategyDesc}>
                      {item.strategySummary}
                    </span>

                    {/* 고른 전략만 자세히 편다 */}
                    {isActive && (
                      <span className={styles.detail}>
                        <span className={styles.detailRow}>
                          <b className={styles.buy}>매수</b>
                          {item.entryRule}
                        </span>
                        <span className={styles.detailRow}>
                          <b className={styles.sell}>매도</b>
                          {item.exitRule}
                        </span>
                        <span className={styles.detailRow}>
                          <b className={styles.term}>기간</b>
                          {periodLabel(item.minPeriod)} 이상
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>점수는 어떻게 나오나요?</h3>
          <p className={styles.guideBody}>
            네 가지를 각각 100점으로 매긴 뒤, 전략마다 다른 비중으로 합쳐
            <b> 적합도</b>를 냅니다.
          </p>
          <dl className={styles.axisGuide}>
            <dt>안정성</dt>
            <dd>얼마나 안 깨졌나 (최대낙폭·변동성)</dd>
            <dt>수익성</dt>
            <dd>얼마나 벌었나 (누적·연평균 수익률)</dd>
            <dt>효율성</dt>
            <dd>위험 대비 얼마나 벌었나 (샤프비율)</dd>
            <dt>성장성</dt>
            <dd>지금 뜨고 있나 (모멘텀·거래량)</dd>
          </dl>
        </section>
      </div>
    </aside>
  )
}

/** 위험도를 점 다섯 개로. 전략 번호가 곧 위험도 순서다(1 안정 → 5 공격) */
function RiskDots({ level }: { level: number }) {
  return (
    <span className={styles.dots} aria-label={`위험도 ${level}단계 (5단계 중)`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <i
          key={step}
          className={step <= level ? styles.dotOn : styles.dotOff}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}
