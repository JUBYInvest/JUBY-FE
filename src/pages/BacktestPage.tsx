import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPresetOptions } from '../api/backtest'
import { ApiError } from '../api/client'
import { byTradingValue, searchStocks } from '../api/search'
import { getStockList } from '../api/stock'
import { STOCK_LIST } from '../api/stockList'
import BacktestGuide from '../components/backtest/BacktestGuide'
import BacktestResult from '../components/backtest/BacktestResult'
import SectionBoundary from '../components/SectionBoundary'
import Spinner from '../components/Spinner'
import { COMPARE_PERIOD, useBacktestRun } from '../hooks/useBacktestRun'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useMyPersonality } from '../hooks/useMyPersonality'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useBacktestHandoff } from '../hooks/useStockHandoff'
import type { StockInfo } from '../types/stock'
import type { BacktestPeriod } from '../types/backtest'
import { loginPathFrom } from '../utils/navigation'
import { isPersonalityType } from '../utils/personality'
import { INVEST_TYPES, PERIODS, findByPersonality, findInvestType, periodLabel, supportedPeriods } from '../utils/backtest'
import styles from './BacktestPage.module.css'

/**
 * 종목 상세의 '이 종목 백테스트'로 왔을 때 채우는 기간. 비교 기간과 같은 값이라 고른 조합이
 * 비교 다섯 건 중 하나와 겹친다(요청 6건이 5건)
 */
const QUICK_PERIOD: BacktestPeriod = COMPARE_PERIOD

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

/** 성향테스트를 하러 가는 곳. 끝나면 doneRoute가 홈으로 보낸다(from 없음) */
const PERSONALITY_TEST_URL = '/personality-test'

export default function BacktestPage() {
  useDocumentTitle('주식 백테스트')
  const loggedIn = useIsLoggedIn()

  /*
   * 종목 상세의 '이 종목 백테스트'로 왔으면 그 종목을 고른 채로 시작한다(selectStock과 같은 상태).
   * 전략·기간까지 채워지면 아래 effect가 한 번 실행한다.
   * 마이페이지에서 왔으면 전략·기간(plan)도 실려 온다 — '최근 본 백테스트'는 셋 다, '이 전략으로 백테스트'는 전략만이다
   */
  const { stock: handoff, plan } = useBacktestHandoff()
  const [query, setQuery] = useState(handoff?.stockName ?? '')
  const [stock, setStock] = useState<StockInfo | null>(handoff)
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

  const [investType, setInvestType] = useState<number | null>(plan?.investType ?? null)
  const [period, setPeriod] = useState<BacktestPeriod | null>(plan?.period ?? null)

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
  /** 기간 목록을 받았거나 못 받기로 끝났는가. 자동 실행이 1년을 고를 수 있는지는 받은 목록까지 보고 가린다 */
  const [periodsSettled, setPeriodsSettled] = useState(false)

  /**
   * 종목 상세에서 와서 아직 자동 실행을 기다리는 중인가. 실행하거나, 성향으로 전략을 고를 수 없거나, 그 전에 사용자가
   * 조건을 건드리면(clearResult) 내린다. ref라서 개발 서버(StrictMode)가 effect를 두 번 돌려도 한 번만 실행한다
   */
  const autoRunRef = useRef(handoff !== null)

  /** 실행·결과·거두기(hooks/useBacktestRun). 같은 조합은 한 번만 받고, 늦게 온 결과는 버린다 */
  const { result, run, clear } = useBacktestRun()
  const resultRef = useRef<HTMLDivElement>(null)

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
        /*
         * 비로그인은 401이다(/api/backtest/** 는 로그인 전용, JUBY-BE d7edec4). 그건 서버 장애가 아니라서 "서버 목록을
         * 받지 못해"라고 알리면 틀린 말이 된다 — 실행하면 결과 자리가 로그인 안내를 하니 여기서는 기본 목록으로 조용히 간다.
         */
        if (error instanceof ApiError && error.status === 401) return
        setUsingFallback(true)
      })
      .finally(() => setPeriodsSettled(true))
  }, [])

  /** 내 성향에 맞는 전략(미리 골라 두거나 '추천 전략으로'로 되돌린 값). 로그아웃하면 이 전략이 그대로일 때만 거둔다 */
  const recommendedTypeRef = useRef<number | null>(null)

  // 내 성향이 도착했고 아직 전략을 안 골랐으면 맞는 전략을 미리 고른다
  useEffect(() => {
    if (recommended === null) return
    recommendedTypeRef.current = recommended.investType
    if (investType === null) {
      setInvestType(recommended.investType)
    }
    // investType은 일부러 뺀다. 사용자가 비운 뒤 다시 채워 넣으면 안 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended])

  /*
   * 로그아웃(다른 탭 포함)하면 성향 문구는 사라지는데 성향에 맞춰 골라 둔 전략은 선택칸에 남아, 이유 없이 골라진 것처럼 보였다.
   * 그 전략이 그대로면 거둔다. 사용자가 다른 전략을 골랐으면 둔다. 성향을 다시 받는 중(불러오는 중)에는 거두지 않게
   * 성향이 아니라 로그인 여부를 본다.
   */
  useEffect(() => {
    if (loggedIn) return
    const recommendedType = recommendedTypeRef.current
    recommendedTypeRef.current = null
    if (recommendedType !== null && investType === recommendedType) changeStrategy(null)
    // 로그인 여부가 바뀔 때만 본다. investType·changeStrategy는 그 순간의 값이면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  /*
   * 종목 상세의 '이 종목 백테스트'로 왔으면 종목·추천 전략·1년이 다 채워진 순간 한 번 실행한다(손으로 누르는 handleSubmit과
   * 같은 길). 전략은 위 effect가 성향이 오면 고른다. 성향으로 전략을 고를 수 없으면(비로그인·검사 안 함·못 불러옴) 종목만 채우고
   * 멈춘다 — 비로그인 안내는 배너 그대로다. 그 전략의 선택지에 1년이 없으면 기간을 비워 둔 채 실행하지 않는다.
   * 결과가 오면 결과로 내려가는 effect(아래)가 그대로 내린다.
   */
  useEffect(() => {
    if (!autoRunRef.current) return
    /*
     * 마이페이지 '최근 본 백테스트'에서 왔으면 전략·기간이 이미 골라져 있다. 성향과 상관없이 그 조건 그대로 보되,
     * 그 사이 서버 기간 목록에서 빠졌으면 기간을 비우고 멈춘다(changeStrategy와 같은 규칙)
     */
    if (plan !== null) {
      if (!periodsSettled) return
      autoRunRef.current = false
      if (plan.period === null || investType !== plan.investType || period !== plan.period) return
      if (availablePeriods(plan.investType, serverPeriods).includes(plan.period)) {
        handleSubmit()
      } else {
        setPeriod(null)
      }
      return
    }
    if (personality.kind === 'loading') return
    if (recommended === null) {
      autoRunRef.current = false
      return
    }
    // 추천 전략이 아직 안 골라졌거나(다음 렌더) 기간 목록을 받는 중이다
    if (investType !== recommended.investType || !periodsSettled) return
    if (period === null) {
      if (availablePeriods(investType, serverPeriods).includes(QUICK_PERIOD)) {
        setPeriod(QUICK_PERIOD)
      } else {
        autoRunRef.current = false
      }
      return
    }
    autoRunRef.current = false
    handleSubmit()
    // handleSubmit은 이 렌더의 종목·전략·기간으로 보낸다. 조건이 바뀔 때만 다시 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, personality.kind, recommended, investType, period, periodsSettled, serverPeriods])

  const selected = investType === null ? null : findInvestType(investType)

  const periodChoices = useMemo(
    () => (investType === null ? [] : availablePeriods(investType, serverPeriods)),
    [investType, serverPeriods],
  )

  /*
   * 서버 기간 목록이 늦게 와서 이미 고른 기간이 선택지에서 빠지면 비운다. 전략을 바꿀 때(changeStrategy)만 정리하던 때는
   * 목록 도착 전에 고른 기간이 선택지에 없는 채로 남아 셀렉트는 안내 문구를 보이는데 실행 단추는 켜져 있었다(2026-10-31)
   */
  useEffect(() => {
    if (period !== null && !periodChoices.includes(period)) {
      setPeriod(null)
      clearResult()
    }
    // 선택지가 바뀔 때만 본다. period·clearResult는 그 순간의 값이면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodChoices])

  /** 로컬 표로는 고를 수 있는데 서버 목록(계산된 적 있는 기간)에 없어 빠진 기간이 있는가 — 안내 문구를 가른다 */
  const serverNarrowed = investType !== null && periodChoices.length < supportedPeriods(investType).length

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
   * 종목 상세에서 와서 자동 실행을 기다리던 중이면 그것도 거둔다 — 사용자가 고른 조건으로 바꿔 놓은 걸 덮어 실행하지 않는다.
   */
  function clearResult() {
    autoRunRef.current = false
    clear()
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

  /** 지금 고른 종목·전략·기간으로 실행한다. 다 고르지 않았으면 아무것도 하지 않는다(단추는 canRun으로 잠긴다) */
  function handleSubmit() {
    if (stock === null || investType === null || period === null) return
    void run(stock, investType, period)
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
            <p className={styles.myText}>
              <Spinner size={16} /> 내 투자성향을 불러오는 중이에요.
            </p>
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
                  : '로그인하면 백테스트 결과를 볼 수 있어요. 투자성향테스트까지 하면 나에게 맞는 전략도 자동으로 골라드려요.'}
              </p>
              {/* 비로그인은 다 고른 뒤에야 "로그인하면 결과를 볼 수 있어요"가 떴다. 시작하기 전에 알리고 로그인으로 보낸다 */}
              {loggedIn ? (
                <Link className={styles.myAction} to={PERSONALITY_TEST_URL}>
                  테스트하러 가기
                </Link>
              ) : (
                <Link className={styles.myAction} to={loginPathFrom('/backtest')}>
                  로그인
                </Link>
              )}
            </>
          ) : (
            <>
              <p className={styles.myText}>
                내 투자성향은 <b>{savedPersonality}</b>이에요.
                {/* 다른 전략을 골랐거나 '이 전략으로 백테스트'로 다른 전략을 실어 왔으면 "골라 뒀어요"는 거짓이다 */}
                {recommended !== null && (
                  <>
                    {' '}
                    {investType === recommended.investType ? (
                      <>
                        여기에 맞는 <b>{recommended.strategyName}</b>을 골라 뒀어요.
                      </>
                    ) : (
                      <>
                        여기에 맞는 전략은 <b>{recommended.strategyName}</b>이에요.
                      </>
                    )}
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

            {/* 줄어든 까닭을 가른다 — 로컬 최소 기간인지, 서버에 계산된 기간만 남긴 것인지. 하나도 없으면 막다른 길임을 알린다 */}
            {selected !== null && periodChoices.length === 0 ? (
              <p className={styles.hint}>지금은 이 전략으로 계산된 기간이 없어요. 다른 전략을 골라 주세요.</p>
            ) : selected !== null && serverNarrowed ? (
              <p className={styles.hint}>서버에 계산된 기간만 보여드려요.</p>
            ) : selected !== null && periodChoices.length < PERIODS.length ? (
              <p className={styles.hint}>
                {selected.strategyName}은 지표를 계산하는 데 봉이 많이 필요해서{' '}
                <b>{periodLabel(selected.minPeriod)}</b> 이상만 고를 수 있어요.
              </p>
            ) : null}
          </div>

          <div className={styles.submitRow}>
            <button
              type="button"
              className={styles.submit}
              disabled={!canRun}
              onClick={() => handleSubmit()}
            >
              {isRunning ? (
                <>
                  <Spinner size={18} /> 불러오는 중…
                </>
              ) : (
                '백테스트 시작하기'
              )}
            </button>

            {/* 버튼이 꺼져 있는 이유를 말해 준다. 안 그러면 왜 안 눌리는지 알 길이 없다 */}
            {!canRun && !isRunning && (
              <p className={styles.submitHint}>
                {stock === null
                  ? '종목을 먼저 골라주세요.'
                  : investType === null
                    ? '투자전략을 골라주세요.'
                    : periodChoices.length === 0
                      ? '이 전략은 지금 고를 수 있는 기간이 없어요.'
                      : '투자기간을 골라주세요.'}
              </p>
            )}
          </div>
        </section>

        <div ref={resultRef}>
          {result.kind === 'loading' && (
            <p className={styles.loadingBox}>
              <Spinner size={20} /> 백테스트 결과를 불러오는 중…
            </p>
          )}

          {result.kind === 'error' && (
            <div className={styles.errorBox}>
              <p className={styles.errorText}>{result.message}</p>
              {result.hint !== null && (
                <p className={styles.errorHint}>{result.hint}</p>
              )}
              {result.needsLogin ? (
                <Link
                  className={styles.errorLogin}
                  to={loginPathFrom('/backtest')}
                >
                  로그인하기
                </Link>
              ) : (
                <button
                  type="button"
                  className={styles.errorRetry}
                  onClick={() => handleSubmit()}
                >
                  다시 시도
                </button>
              )}
            </div>
          )}

          {/* 결과를 그리다 멈춰도 입력 폼은 남는다. 다시 시도하면 같은 조건으로 다시 받는다 */}
          {result.kind === 'ready' && stock !== null && (
            <SectionBoundary onRetry={() => handleSubmit()}>
              <BacktestResult
                preset={result.preset}
                ranking={result.ranking}
                missed={result.missed}
                stock={stock}
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
