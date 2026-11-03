import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import HomeRail from '../components/HomeRail'
import SearchBar from '../components/SearchBar'
import TopStockCard from '../components/TopStockCard'
import StockTable from '../components/StockTable'
import VolumeRank from '../components/VolumeRank'
import SectionBoundary from '../components/SectionBoundary'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import { readCardSeries } from '../api/cardSeries'
import { FALLBACK_LEADING, loadCardSeries, loadLeading, readCachedLeading } from '../api/home'
import { likeStock, unlikeStock } from '../api/member'
import { byTradingValue } from '../api/search'
import { getStockList } from '../api/stock'
import { STOCK_LIST } from '../api/stockList'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { toKoreanDate } from '../utils/date'
import { isFiniteNumber } from '../utils/format'
import { loginPathFrom } from '../utils/navigation'
import { preloadStockChartPage } from '../utils/preload'
import { describeSort, nextSort, sortStocks } from '../utils/sort'
import type {
  CardQuote,
  CardSeries,
  LeadingStocks,
  SortKey,
  SortState,
  Stock,
} from '../types/stock'
import styles from './HomePage.module.css'

const PAGE_SIZE = 20

/**
 * 표의 처음 순서. 서버 목록은 가나다순이라 그대로 두면 사람들이 찾는 종목이 아래로 밀린다.
 * 정렬 상태로 두어 거래대금 머리에 화살표가 켜진다 — 무엇 순인지 화면에서 보인다
 */
const DEFAULT_SORT: SortState = { key: 'tradingValue', direction: 'desc' }

/** 목록이 아직 없을 때 쓰는 빈 배열. 렌더마다 새로 만들면 useMemo가 매번 다시 돈다 */
const EMPTY_STOCKS: Stock[] = []

/**
 * '현재 주가 보기'의 두 탭. all은 JUBY가 다루는 종목의 마감 시세표(DB), live는 증권사 실시간 거래대금 순위(누를 때만 묻는다)
 */
type ListTab = 'all' | 'live'

const LIST_TABS: { tab: ListTab; label: string }[] = [
  { tab: 'all', label: '전체 종목' },
  { tab: 'live', label: '실시간 거래대금 순위' },
]

/** 홈을 떠날 때의 시세표. 뒤로 가기로 돌아오면 이걸로 보던 자리를 되살린다 */
interface HomeView {
  tab: ListTab
  sort: SortState
  visibleCount: number
  scrollY: number
}

/**
 * 떠날 때의 시세표를 주소 기록 항목(location.key)마다 둔다. 같은 홈이라도 기록의 어느 칸이냐에
 * 따라 보던 자리가 다르다. 메모리에만 두므로 새로고침하면 비고, 그땐 처음부터 보여준다.
 */
const savedViews = new Map<string, HomeView>()

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; baseDate: string; stocks: Stock[] }
  | { kind: 'error' }

/**
 * 홈. 표는 `GET /api/stocks` 한 번으로 100종목이 다 온다(DB, 증권사 호출 없음).
 *
 * 예전에는 종목마다 현재가를 따로 불러 보이는 20개 먼저·나머지 나중·장 열림 탐지·
 * 지난 값 저장 같은 장치가 이 파일에 가득했다. 지금은 전부 없다.
 */

export default function HomePage() {
  useDocumentTitle('초보자를 위한 주식 비서')
  const location = useLocation()
  const navigationType = useNavigationType()
  /*
   * 로그인 여부를 구독한다. 시세표의 하트(isLiked)는 토큰에 딸린 값이라 같은 탭·다른 탭에서 로그아웃하면 목록을 다시 받아
   * 꺼야 한다 — 한 번 받은 Set을 그대로 두던 때는 로그아웃해도 하트가 켜진 채였다(2026-10-31). 목록은 DB만 읽는다
   */
  const loggedIn = useIsLoggedIn()
  /*
   * 뒤로·앞으로 가기로 돌아왔으면 떠날 때의 정렬·보이던 행 수·스크롤을 되살린다.
   * 100행을 내려 보다 종목을 눌렀는데 돌아오면 맨 위 20행에 기본 정렬이라 보던 자리를 잃었다.
   * 링크(머리글 로고 등)로 새로 들어오면 처음부터 보여준다 — 브라우저가 스크롤을 다루는 방식과 같다.
   */
  const [restored] = useState(() =>
    navigationType === 'POP' ? (savedViews.get(location.key) ?? null) : null,
  )
  /*
   * 테마별 대표 종목 카드. 어떤 종목인지는 서버가 정한다(GET /api/stocks/leading-stocks).
   * 첫 그림은 지난 방문에 받아 둔 값으로, 그것도 없으면 고정 목록으로 그리고, 아래 effect가
   * 받은 값으로 갈아끼운다.
   */
  const [leading, setLeading] = useState<LeadingStocks>(
    () => readCachedLeading() ?? FALLBACK_LEADING,
  )
  /**
   * 대장주 응답이 왔는가(실패해도 지난 값·고정 목록으로 끝난다). 카드 그래프는 그 뒤의 목록으로만 묻는다 — 첫 그림의 고정 목록으로
   * 먼저 묻고 서버 목록이 다르면 또 물어, 첫 방문에 증권사를 거치는 상세 요청이 3건이 아니라 6건 나갔다(2026-10-31)
   */
  const [leadingSettled, setLeadingSettled] = useState(false)
  const themes = leading.themes
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [visibleCount, setVisibleCount] = useState(
    restored?.visibleCount ?? PAGE_SIZE,
  )
  const [sort, setSort] = useState<SortState>(restored?.sort ?? DEFAULT_SORT)
  /** 순위 탭에서 종목을 누르고 뒤로 오면 순위 탭으로 돌아온다 */
  const [listTab, setListTab] = useState<ListTab>(restored?.tab ?? 'all')
  /** 관심종목. 처음엔 서버가 준 isLiked로 채우고, 하트를 누르면 서버에 반영한다 */
  const [favoriteCodes, setFavoriteCodes] = useState<Set<string>>(new Set())
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  /** 하트 요청이 진행 중인 종목. 연타로 등록·해제가 겹쳐 서버와 어긋나는 걸 막는다 */
  const pendingLikes = useRef(new Set<string>())
  /** 하트를 서버에 반영하지 못해 되돌렸을 때 알리는 말. 조용히 되돌리면 누른 게 무시된 것처럼 보인다 */
  const [likeNotice, setLikeNotice] = useState('')

  /*
   * 대장주는 DB만 읽는 API라 몇 번을 불러도 부담이 없다. 들어올 때마다 새로 받는다.
   * 실패해도 loadLeading()이 지난 값이나 고정 목록을 돌려주므로 카드는 늘 그려진다.
   */
  const reloadLeading = useCallback(() => {
    let ignore = false
    void loadLeading().then((next) => {
      if (ignore) return
      setLeading(next)
      setLeadingSettled(true)
    })
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => reloadLeading(), [reloadLeading])

  const load = useCallback(() => {
    setList({ kind: 'loading' })

    getStockList()
      .then(({ baseDate, stocks }) => {
        setList({ kind: 'ready', baseDate, stocks })
        // 비로그인이면 서버가 isLiked를 비워 주지만, 기대지 않고 여기서도 비운다
        setFavoriteCodes(
          new Set(loggedIn ? stocks.filter((stock) => stock.isLiked).map((s) => s.stockCode) : []),
        )
      })
      .catch((error: unknown) => {
        console.warn('종목 목록 조회 실패', error)
        setList({ kind: 'error' })
      })
  }, [loggedIn])

  // 로그인·로그아웃하면 load가 새로 만들어져 다시 받는다 — 하트(isLiked)가 그 회원의 것이어야 한다
  useEffect(load, [load])

  // 종목을 누르기 전에 상세 화면 묶음을 받아 둔다. 누른 뒤 받으면 그만큼 상세 요청이 늦게 나간다
  useEffect(() => preloadStockChartPage(), [])

  /*
   * 카드 그래프. 받는 중이면 없음, 그릴 수 없으면 'unavailable'. 담아 둔 그래프는 받기 전 첫 그림부터 쓴다.
   * 받는 길과 막는 규칙은 api/home.ts loadCardSeries — 카드 그래프가 사용자가 누를 상세의 몫을 쓰지 않게 한다.
   */
  const [cardSeries, setCardSeries] = useState<Map<string, CardSeries | 'unavailable'>>(
    () => new Map(),
  )
  // 기준일이 비어 오면("") 모르는 것(null)이다 — ""를 그대로 넘기면 담아 둔 그래프가 어느 날짜든 "기준일 이후"로 읽혀 영영 묵지 않았다
  const baseDate = list.kind === 'ready' && list.baseDate !== '' ? list.baseDate : null
  /** 카드 종목이 바뀔 때만 다시 받는다. themes 배열은 받을 때마다 새로 만들어진다 */
  const themeCodes = themes.map((theme) => theme.stockCode).join(',')

  useEffect(() => {
    let ignore = false
    const codes = themeCodes === '' ? [] : themeCodes.split(',')
    // 기준일이 바뀌면 묵은 그래프는 내리고 다시 받는다. 못 그린다고 정한 것도 다시 판단한다
    setCardSeries(() => {
      const next = new Map<string, CardSeries | 'unavailable'>()
      for (const code of codes) {
        const cached = readCardSeries(code, baseDate)
        if (cached !== null) next.set(code, cached)
      }
      return next
    })
    // 대장주 응답 전의 목록(지난 값·고정 목록)으로는 묻지 않는다. 담아 둔 그래프만 먼저 그린다
    if (!leadingSettled) return
    void loadCardSeries(codes, baseDate, (code, series) => {
      if (ignore) return
      setCardSeries((prev) => new Map(prev).set(code, series ?? 'unavailable'))
    })
    return () => {
      ignore = true
    }
  }, [themeCodes, baseDate, leadingSettled])

  /** 지금 보고 있는 시세표. 떠날 때 savedViews에 옮겨 담는다 */
  const viewRef = useRef<HomeView>({
    tab: listTab,
    sort,
    visibleCount,
    scrollY: restored?.scrollY ?? 0,
  })
  /** 되살릴 스크롤. 목록이 와서 행이 다 그려진 뒤에야 그 높이까지 내려갈 수 있다 */
  const pendingScrollRef = useRef(restored?.scrollY ?? null)

  useEffect(() => {
    viewRef.current.tab = listTab
    viewRef.current.sort = sort
    viewRef.current.visibleCount = visibleCount
  }, [listTab, sort, visibleCount])

  /*
   * 스크롤은 움직일 때마다 적어 두고 떠날 때 담는다. 떠나는 순간에 재면 늦다 — 화면이 이미
   * 짧은 상세로 바뀌어 눌린 값이 나온다. 같은 이유로 주소가 홈이 아니게 된 뒤의 스크롤은 버린다.
   * 되살리기 전(목록을 받는 중)의 스크롤도 적지 않는다. 그 사이 떠나면 앞서 적은 자리를 지킨다.
   */
  useEffect(() => {
    const key = location.key
    // 객체는 갈아끼우지 않고 안의 값만 고친다. 정리 함수에서도 마지막 값을 읽는다
    const view = viewRef.current
    function record() {
      if (window.location.pathname !== '/' || pendingScrollRef.current !== null) {
        return
      }
      view.scrollY = window.scrollY
    }
    window.addEventListener('scroll', record, { passive: true })
    return () => {
      window.removeEventListener('scroll', record)
      savedViews.set(key, { ...view })
    }
  }, [location.key])

  // 행이 다 그려진 직후, 그리기 전에 내려 둔다. effect로 하면 맨 위가 한 번 보였다가 튄다
  useLayoutEffect(() => {
    if (list.kind !== 'ready' || pendingScrollRef.current === null) return
    window.scrollTo(0, pendingScrollRef.current)
    pendingScrollRef.current = null
  }, [list.kind])

  const stocks = list.kind === 'ready' ? list.stocks : EMPTY_STOCKS

  /*
   * 카드가 그래프를 못 받았을 때 대신 적을 종가. 시세표는 DB만 읽어 늘 받아지므로
   * 카드 그래프(증권사를 거치는 상세 API)가 막혀도 이 값은 있다.
   */
  const quotes = useMemo(() => {
    const byCode = new Map<string, CardQuote>()
    if (list.kind !== 'ready') return byCode
    for (const stock of list.stocks) {
      if (!isFiniteNumber(stock.closePrice)) continue
      byCode.set(stock.stockCode, {
        closePrice: stock.closePrice,
        fluctuate: isFiniteNumber(stock.fluctuate) ? stock.fluctuate : null,
        baseDate: list.baseDate,
      })
    }
    return byCode
  }, [list])

  /* 검색 후보는 거래대금 순. 서버 목록은 가나다순이라 그대로 주면 삼성전자가 삼성전기 뒤로 밀린다 */
  const searchable = useMemo(
    () => (stocks.length > 0 ? byTradingValue(stocks) : STOCK_LIST),
    [stocks],
  )

  // 목록 끝이 화면에 들어오면 20개 더 보여준다
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (sentinel === null) return
    if (visibleCount >= stocks.length) return

    const observer = new IntersectionObserver((entries) => {
      /*
       * 마지막 기록이 지금 상태다. 관찰을 걸자마자 끝이 보이면 한 콜백에 "안 보임 → 보임"이 같이 온다 — 첫 기록만 보면
       * 넘기고, 그 뒤로는 끝 표시가 계속 보인 채라 다시 불리지 않아 20행에서 멈췄다(2026-09-29 재현. 위로 올렸다 내려야 이어졌다)
       */
      if (entries.at(-1)?.isIntersecting === true) {
        setVisibleCount((count) => count + PAGE_SIZE)
      }
    })

    observer.observe(sentinel)
    return () => observer.disconnect()
    // 순위 탭에 다녀오면 끝 표시가 새로 붙는다. 다시 관찰해야 이어서 불러온다
  }, [visibleCount, stocks.length, listTab])

  function handleSort(key: SortKey) {
    setSort((current) => nextSort(current, key))
    setVisibleCount(PAGE_SIZE)
  }

  /**
   * 하트는 먼저 바꾸고 서버에 알린다. 서버 응답을 기다렸다 바꾸면 눌린 느낌이 늦다.
   * 실패하면 되돌린다 — 화면만 켜진 채 서버엔 없는 상태로 두면 다음 방문에 사라져 보인다.
   */
  async function handleHeartClick(stockCode: string) {
    if (!loggedIn) {
      setIsLoginModalOpen(true)
      return
    }
    if (pendingLikes.current.has(stockCode)) return

    const wasLiked = favoriteCodes.has(stockCode)
    const apply = (liked: boolean) =>
      setFavoriteCodes((previous) => {
        // Set을 직접 고치면 React가 같은 객체로 보고 다시 그리지 않는다. 복사본을 만든다
        const next = new Set(previous)
        if (liked) next.add(stockCode)
        else next.delete(stockCode)
        return next
      })

    pendingLikes.current.add(stockCode)
    setLikeNotice('')
    apply(!wasLiked)

    try {
      if (wasLiked) await unlikeStock(stockCode)
      else await likeStock(stockCode)
    } catch (error: unknown) {
      console.warn('관심종목 반영 실패', error)
      apply(wasLiked)
      setLikeNotice(
        wasLiked
          ? '관심종목을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.'
          : '관심종목에 추가하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      pendingLikes.current.delete(stockCode)
    }
  }

  // 하트·카드 그래프·무한 스크롤로 다시 그릴 때마다 100행을 다시 정렬하지 않는다
  const sortedStocks = useMemo(() => sortStocks(stocks, sort), [stocks, sort])

  return (
    <>
      {/*
        왼쪽 열: 검색 → 테마별 대표 종목 → 현재 주가 보기, 오른쪽 열: 사용설명서·커뮤니티(HomeRail).
        16:9에서 좌우가 비어 보인다는 말에 넓힌 본문을 두 열로 쓴다(2026-10-30 재정비)
      */}
      <div className={styles.home}>
        {/* 목록이 오기 전에는 로컬 사본으로 검색한다. 도착하면 서버 목록으로 바꾼다 */}
        <div className={styles.search}>
          <SearchBar stocks={searchable} />
        </div>

        <section className={styles.themes}>
          <div className={styles.sectionHead}>
            {/* 홈의 대표 제목. 아래 '현재 주가 보기'가 h2로 이어진다 */}
            <h1 className={styles.heading}>테마별 대표 종목</h1>
            {/*
              무엇을 보여 주는지 쉬운 말로. 예전 머리말("SMA 이동평균선 전략 · 1년 기준으로 뽑은")은 사실과 달랐다 —
              백엔드는 테마마다 정해 둔 종목을 주고(JUBY-BE LeadingStockTheme) 전략 결과로 고르지 않는다(dev 3dc3f3a 확인).
              "1년 전보다" 숫자는 그 종목의 1년 주가 변화다(CardChart)
            */}
            <p className={styles.lede}>테마마다 대표 종목을 하나씩 골라 1년 주가 흐름을 보여드려요</p>
          </div>

          {/*
            카드를 그리다 멈춰도 검색·시세표는 남는다. 경계가 없을 땐 카드 한 장 때문에 홈 전체가
            오류 화면이 됐다. 다시 시도는 대장주만 새로 받는다.
            카드는 종목·종가(DB)만으로 세 장이 늘 선다. 그래프를 못 받은 카드만 그래프 자리에 알린다 —
            예전처럼 그래프가 실패해 구역 전체를 안내 한 줄로 바꾸는 일이 없다.
          */}
          <SectionBoundary onRetry={reloadLeading}>
            <div className={styles.cards}>
              {themes.map((theme) => (
                <TopStockCard
                  key={theme.stockCode}
                  theme={theme}
                  series={cardSeries.get(theme.stockCode) ?? null}
                  quote={quotes.get(theme.stockCode) ?? null}
                />
              ))}
            </div>
          </SectionBoundary>
        </section>

        {/*
          오른쪽 열은 시세표보다 앞에 둔다 — 1100px 이하에서는 화면에도 시세표 위에 보이고, 키보드(Tab)·읽어 주는 순서가 보이는 순서와
          같아야 한다. 시세표 뒤에 두던 때는 그 순서로 가려면 시세표 행(링크·하트)을 다 지나야 했다. 넓은 화면의 자리는 격자 영역이 정한다
        */}
        <div className={styles.rail}>
          {/* 처음 시작하기 진행표가 관심종목을 담았는지 본다 — 시세표를 받기 전엔 모른다(null) */}
          <HomeRail likedCount={list.kind === 'loading' ? null : favoriteCodes.size} />
        </div>

        <section className={styles.list}>
          <div className={styles.sectionHead}>
            <h2 id="home-stocks-title" className={styles.heading} tabIndex={-1}>
              현재 주가 보기
            </h2>
            {/*
              16시 배치 전에는 전 거래일 종가가 뜬다. 언제 것인지 밝혀둔다.
              기준일이 비어 오면 줄째 숨긴다 — 시세표는 그대로 보여준다
            */}
            {listTab === 'all' && list.kind === 'ready' && toKoreanDate(list.baseDate) !== '' && (
              <span className={styles.asOf}>
                {toKoreanDate(list.baseDate)} 종가 기준
              </span>
            )}
            {/*
              무엇 순인지 글로도 적는다. 좁은 화면에서는 거래대금 열이 숨는데 기본 정렬이 거래대금이라 칸 머리로는 안 보인다
            */}
            {listTab === 'all' && list.kind === 'ready' && (
              <span className={styles.sortNote}>{describeSort(sort)}</span>
            )}
          </div>

          {/* 밑줄 탭. 시세표(마감 값)와 실시간 순위는 기준이 달라 한 표에 섞지 않는다 */}
          <div className={styles.listTabs} role="tablist" aria-label="시세 보기">
            {LIST_TABS.map(({ tab, label }) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`home-tab-${tab}`}
                aria-selected={listTab === tab}
                aria-controls="home-tab-panel"
                className={listTab === tab ? styles.listTabActive : styles.listTab}
                onClick={() => setListTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>

          <div id="home-tab-panel" role="tabpanel" aria-labelledby={`home-tab-${listTab}`}>
          {listTab === 'live' && <VolumeRank stocks={searchable} loginPath={loginPathFrom(location.pathname)} />}

          {likeNotice !== '' && (
            <p className={styles.likeNotice} role="status">
              {likeNotice}
            </p>
          )}

          {listTab === 'all' && list.kind === 'loading' && (
            <p className={styles.loading}>
              <Spinner size={18} /> 시세를 불러오는 중…
            </p>
          )}

          {listTab === 'all' && list.kind === 'error' && (
            <div className={styles.loading}>
              <p>시세를 불러오지 못했습니다.</p>
              <button type="button" className={styles.retry} onClick={load}>
                다시 시도
              </button>
            </div>
          )}

          {/* 표를 그리다 멈춰도 검색·테마 카드는 남는다. 다시 시도하면 목록을 새로 받는다 */}
          {listTab === 'all' && list.kind === 'ready' && (
            <SectionBoundary onRetry={load}>
              <StockTable
                stocks={sortedStocks.slice(0, visibleCount)}
                baseDate={list.baseDate}
                sort={sort}
                onSort={handleSort}
                favoriteCodes={favoriteCodes}
                onHeartClick={(code) => void handleHeartClick(code)}
              />

              <div ref={sentinelRef} className={styles.sentinel}>
                {visibleCount < stocks.length && (
                  <>
                    <Spinner size={16} /> 불러오는 중…
                  </>
                )}
              </div>
            </SectionBoundary>
          )}
          </div>
        </section>
      </div>

      <Modal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        label="로그인 안내"
      >
        <p className={styles.modalMessage}>로그인 후 이용 가능한 기능입니다</p>
        <div className={styles.modalButtons}>
          <Link to="/login" className={styles.modalPrimary}>
            로그인
          </Link>
          <button
            type="button"
            className={styles.modalSecondary}
            onClick={() => setIsLoginModalOpen(false)}
          >
            닫기
          </button>
        </div>
      </Modal>
    </>
  )
}
