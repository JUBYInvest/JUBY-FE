import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { getPresetOptions } from '../api/backtest'
import { ApiError } from '../api/client'
import { byTradingValue, searchStocks } from '../api/search'
import { getStockList } from '../api/stock'
import { STOCK_LIST } from '../api/stockList'
import BacktestHelp from '../components/backtest/BacktestHelp'
import BacktestResult from '../components/backtest/BacktestResult'
import StrategyPicker, { StrategyDetail } from '../components/backtest/StrategyPicker'
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
import { PERIODS, findByPersonality, findInvestType, periodLabel, supportedPeriods } from '../utils/backtest'
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
  /** 방향키로 고른 후보. -1이면 아직 안 골랐다 — Enter는 가장 잘 맞는 첫 후보로 간다 */
  const [activeMatch, setActiveMatch] = useState(-1)

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
  const titleRef = useRef<HTMLHeadingElement>(null)

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
         * 비로그인은 401이다(/api/backtest/** 는 로그인 전용). 그건 서버 장애가 아니라서 "서버 목록을
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
   * 로그아웃(다른 탭 포함)하면 성향 문구는 사라지므로, 성향에 맞춰 골라 둔 전략이 선택칸에 남으면 이유 없이 골라진 것처럼 보인다.
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
   * 서버 기간 목록이 늦게 와서 이미 고른 기간이 선택지에서 빠지면 비운다 — 안 비우면 셀렉트는 안내 문구를 보이는데
   * 실행 단추는 켜져 있다(전략을 바꿀 때의 정리는 changeStrategy가 한다)
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

  // 방향키로 고른 후보가 굴러가는 목록 밖으로 내려가면 보이는 자리로 끌어온다
  useEffect(() => {
    if (!isSearchOpen || activeMatch < 0) return
    document.getElementById(`backtest-stock-match-${activeMatch}`)?.scrollIntoView({ block: 'nearest' })
  }, [isSearchOpen, activeMatch])

  const isRunning = result.kind === 'loading'
  const canRun =
    stock !== null && investType !== null && period !== null && !isRunning

  /*
   * 칸이 비었거나 고른 종목 이름 그대로면 시가총액 순 전체를 보인다 — 치기 전에 눌러도 고를 종목이 보인다(2026-11-07 사용자).
   * 순서는 시총 순 사본(STOCK_LIST — 백엔드 적재 목록과 같다, 커뮤니티 글쓰기와 같은 목록). 서버 목록은 거래대금 순이라 이 순서로 쓰지 않는다
   */
  const browsing = query.trim() === '' || (stock !== null && query.trim() === stock.stockName)
  const matches = useMemo(() => (browsing ? STOCK_LIST : searchStocks(stockOptions, query.trim())), [browsing, query, stockOptions])

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
    setActiveMatch(-1)
    clearResult()
  }

  function selectStock(item: StockInfo) {
    setStock(item)
    setQuery(item.stockName)
    setIsSearchOpen(false)
    setActiveMatch(-1)
    clearResult()
  }

  /**
   * 종목 칸 키보드: ↑↓로 후보를 오가고 Enter로 고른다. 아무것도 안 골랐으면 Enter는 가장 잘 맞는 첫 후보다
   * ("삼성전자" + Enter = 삼성전자 — searchStocks가 이름이 똑같은 종목을 맨 앞에 세운다). Esc는 후보를 닫는다
   */
  function handleStockKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setIsSearchOpen(false)
      setActiveMatch(-1)
      return
    }
    if (matches.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setIsSearchOpen(true)
      setActiveMatch((index) => (index < 0 ? (step === 1 ? 0 : matches.length - 1) : (index + step + matches.length) % matches.length))
      return
    }
    // 한글 조합 중 Enter는 글자를 끝내는 것이다 — 그때 고르면 마지막 글자가 빠진 채 골라진다
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      // Esc로 닫은 목록의 후보는 고르지 않는다 — 보이지 않는 종목이 골라진다
      if (!isSearchOpen) return
      const picked = activeMatch >= 0 && activeMatch < matches.length ? matches[activeMatch] : browsing ? undefined : matches[0]
      // 시가총액 목록을 훑기만 하다 누른 Enter는 고르지 않는다 — 이미 고른 종목이 맨 앞 종목으로 바뀌면 안 된다
      if (picked === undefined) setIsSearchOpen(false)
      else selectStock(picked)
    }
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

  /** 결과 아래 "백테스트 다시하기" — 결과를 거두고 조건을 바꾸러 화면 위로 올라간다 */
  function retryFromTop() {
    clearResult()
    // 누른 단추가 결과와 함께 사라지므로 포커스를 화면 제목으로 옮긴다(아니면 body로 떨어져 키보드 사용자가 길을 잃는다)
    titleRef.current?.focus({ preventScroll: true })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
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

    // 결과로 포커스를 옮긴다 — 휴대폰은 결과가 시작 단추보다 DOM 앞이라(보이는 순서는 order로 바꿨다) Tab으로는 결과에 못 간다
    resultRef.current.focus({ preventScroll: true })
    resultRef.current.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [result.kind])

  /*
   * 성향은 고르는 칸이 아니라 '이미 정해진 나의 정보'다. 조건보다 앞, 왼쪽 맨 위에 옅은 면 한 줄로 적는다(화면에 한 번).
   * 비로그인 안내도 여기 — 결과 자리의 로그인 안내는 다 고른 뒤에야 보이므로 시작하기 전에 알리고 로그인으로 보낸다
   */
  const banner = (
    <div className={styles.myBanner}>
      {personality.kind === 'loading' ? (
        <p className={styles.myText}>
          <Spinner size={16} /> 내 투자성향을 불러오는 중이에요
        </p>
      ) : personality.kind === 'error' ? (
        /* 못 불러왔으면 검사를 권하지 않는다 — 다시 검사하면 멀쩡한 성향을 덮어쓴다 */
        <>
          <p className={styles.myText}>성향을 불러오지 못했어요</p>
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
            성향 다시 검사
          </Link>
        </>
      )}
    </div>
  )

  return (
    <>
      <h1 ref={titleRef} className={styles.title} tabIndex={-1}>
        주식 백테스트 이용하기
      </h1>

      {/*
        두 열: 왼쪽 성향 배너 → ①종목 ②전략 ③기간(그 아래 결과) | 오른쪽 '돌릴 조합' 판(고른 셋 + 시작 단추, 화면을 내려도 따라온다).
        굵은 먹 선은 화면 제목 아래 하나다. 좁은 화면은 한 열 — 배너 → 조건 → 시작 단추 → 결과 → 도움말 순으로 선다(CSS order)
      */}
      <div className={styles.layout}>
      <div className={styles.main}>
        {banner}

        <section className={styles.form} aria-labelledby="backtest-form-title">
          {/* 구역 이름은 보조기기에만 — 눈에는 배너와 ①②③ 번호가 흐름을 이끈다(먹 선 두 줄이 겹쳐 보이지 않게) */}
          <h2 id="backtest-form-title" className={styles.srOnly}>
            조건 고르기
          </h2>

          {usingFallback && (
            <p className={styles.fallbackNote} role="status">
              서버 목록을 받지 못해 기본 목록으로 보여드려요. 결과가 없는 조합이 있을 수 있어요.
            </p>
          )}

          {/* 종목 --------------------------------------------------------- */}
          <div className={styles.field}>
            <label className={styles.fieldName} htmlFor="backtest-stock">
              <span className={styles.stepNum} aria-hidden="true">1</span>
              종목
            </label>

            <div className={styles.searchWrap}>
              <div className={styles.control}>
                <input
                  id="backtest-stock"
                  className={styles.input}
                  type="text"
                  value={query}
                  placeholder="종목명으로 검색 (예: 삼성전자)"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={isSearchOpen && matches.length > 0}
                  aria-controls="backtest-stock-matches"
                  aria-autocomplete="list"
                  // 방향키로 고른 후보 — 포커스는 입력칸에 남으니 보조기기에 어느 후보인지 알린다
                  aria-activedescendant={isSearchOpen && activeMatch >= 0 && activeMatch < matches.length ? `backtest-stock-match-${activeMatch}` : undefined}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  onKeyDown={handleStockKeyDown}
                  onFocus={() => setIsSearchOpen(true)}
                  // 포커스가 남은 채 Esc로 닫았으면 onFocus가 다시 오지 않는다. 눌러서 다시 연다
                  onClick={() => setIsSearchOpen(true)}
                  onBlur={() => {
                    setIsSearchOpen(false)
                    setActiveMatch(-1)
                  }}
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
                  id="backtest-stock-matches"
                  role="listbox"
                  aria-label={browsing ? '시가총액 순 종목' : '종목 후보'}
                  className={browsing ? `${styles.matches} ${styles.matchesScroll}` : styles.matches}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {browsing && (
                    <li role="presentation" className={styles.matchesHead} aria-hidden="true">
                      시가총액 순
                    </li>
                  )}
                  {matches.map((item, index) => (
                    <li key={item.stockCode} id={`backtest-stock-match-${index}`} role="option" aria-selected={index === activeMatch}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={index === activeMatch ? `${styles.match} ${styles.matchActive}` : styles.match}
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

          {/* 전략 — 고르는 곳은 이 카드 하나다. 성향 안내는 이 줄 머리에 한 번 */}
          <div className={styles.field}>
            <p className={styles.fieldName} id="backtest-strategy-label">
              <span className={styles.stepNum} aria-hidden="true">2</span>
              전략
            </p>
            <div className={styles.fieldBody} role="group" aria-labelledby="backtest-strategy-label">
              <StrategyPicker investType={investType} savedPersonality={savedPersonality} onSelect={changeStrategy} />
              <StrategyDetail investType={investType} />
            </div>
          </div>

          {/* 기간 — 네 칸을 한 줄에 나눠 둔다. 이 전략이 못 쓰는 기간은 잠근다 */}
          <div className={styles.field}>
            <p className={styles.fieldName} id="backtest-period-label">
              <span className={styles.stepNum} aria-hidden="true">3</span>
              기간
            </p>
            <div className={styles.fieldBody}>
              <div className={styles.periods} role="group" aria-labelledby="backtest-period-label">
                {PERIODS.map((item) => {
                  const isActive = item.period === period
                  return (
                    <button
                      key={item.period}
                      type="button"
                      className={isActive ? styles.periodOn : styles.periodOff}
                      aria-pressed={isActive}
                      data-period={item.period}
                      disabled={investType === null || !periodChoices.includes(item.period)}
                      onClick={() => {
                        setPeriod(item.period)
                        clearResult()
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>

              {/* 잠긴 까닭을 가른다 — 로컬 최소 기간인지, 서버에 계산된 기간만 남긴 것인지. 하나도 없으면 막다른 길임을 알린다 */}
              {selected === null ? (
                <p className={styles.hint}>전략을 고르면 기간을 고를 수 있어요</p>
              ) : periodChoices.length === 0 ? (
                <p className={styles.hint}>지금은 이 전략으로 계산된 기간이 없어요. 다른 전략을 골라 주세요.</p>
              ) : serverNarrowed ? (
                <p className={styles.hint}>서버에 계산된 기간만 고를 수 있어요</p>
              ) : periodChoices.length < PERIODS.length ? (
                <p className={styles.hint}>
                  {selected.strategyName}은 지표를 계산할 봉이 많이 필요해 {periodLabel(selected.minPeriod)}부터 고를 수 있어요
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div ref={resultRef} id="backtest-result" className={styles.resultSlot} tabIndex={-1}>
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
                onRetry={retryFromTop}
              />
            </SectionBoundary>
          )}
        </div>
      </div>

      <aside className={styles.side} aria-label="돌릴 조합과 도움말">
        <section className={styles.summary} aria-labelledby="backtest-summary-title">
          <h2 id="backtest-summary-title" className={styles.summaryTitle}>
            돌릴 조합
          </h2>
          <dl className={styles.summaryList}>
            <div className={styles.summaryRow}>
              <dt>종목</dt>
              <dd>{stock === null ? <span className={styles.summaryEmpty}>아직 안 골랐어요</span> : stock.stockName}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>전략</dt>
              <dd>
                {selected === null ? (
                  <span className={styles.summaryEmpty}>아직 안 골랐어요</span>
                ) : (
                  selected.strategyName
                )}
              </dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>기간</dt>
              <dd>{period === null ? <span className={styles.summaryEmpty}>아직 안 골랐어요</span> : PERIODS.find((item) => item.period === period)?.label}</dd>
            </div>
          </dl>

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
                ? '종목을 먼저 골라주세요'
                : investType === null
                  ? '투자전략을 골라주세요'
                  : periodChoices.length === 0
                    ? '이 전략은 지금 고를 수 있는 기간이 없어요'
                    : '투자기간을 골라주세요'}
            </p>
          )}

        </section>

        <BacktestHelp showResult={result.kind === 'ready'} />
      </aside>
      </div>
    </>
  )
}
