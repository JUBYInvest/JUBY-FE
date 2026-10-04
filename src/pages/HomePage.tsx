import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import TopStockCard from '../components/TopStockCard'
import StockTable from '../components/StockTable'
import SectionBoundary from '../components/SectionBoundary'
import Modal from '../components/Modal'
import {
  FALLBACK_LEADING,
  hasFreshTopStocks,
  loadTopStocks,
  readCachedLeading,
  readCachedTopStocks,
} from '../api/home'
import { likeStock, unlikeStock } from '../api/member'
import { byTradingValue, getStockList } from '../api/stock'
import { STOCK_LIST } from '../api/stockList'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { isLoggedIn } from '../utils/auth'
import { toKoreanDate } from '../utils/date'
import { preloadStockChartPage } from '../utils/preload'
import { describeSort, nextSort, sortStocks } from '../utils/sort'
import type {
  CardFailure,
  LeadingBasis,
  LeadingStocks,
  SortKey,
  SortState,
  Stock,
  TopStock,
  TopTheme,
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

/** 홈을 떠날 때의 시세표. 뒤로 가기로 돌아오면 이걸로 보던 자리를 되살린다 */
interface HomeView {
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
/** 카드 자리의 종목이 그대로인가. 같으면 이미 그려 둔 그래프를 지우지 않는다 */
function sameCodes(stocks: (TopStock | null)[], themes: TopTheme[]): boolean {
  if (stocks.length !== themes.length) return false
  return stocks.every((stock, index) => stock === null || stock.stockCode === themes[index].stockCode)
}

/**
 * 머리말 윗줄. 서버가 어떤 전략·기간으로 대장주를 골랐는지 그대로 적는다.
 * 둘 중 하나라도 못 받으면 근거를 지어내지 않고 예전 문구로 둔다.
 */
function describeBasis(basis: LeadingBasis): string {
  const { strategyName, periodLabel } = basis
  if (strategyName === null || periodLabel === null) return '백테스트 기법으로 투자한'
  return `${strategyName} · ${periodLabel} 기준으로 뽑은`
}

export default function HomePage() {
  useDocumentTitle('초보자를 위한 주식 비서')
  const location = useLocation()
  const navigationType = useNavigationType()
  /*
   * 뒤로·앞으로 가기로 돌아왔으면 떠날 때의 정렬·보이던 행 수·스크롤을 되살린다.
   * 100행을 내려 보다 종목을 눌렀는데 돌아오면 맨 위 20행에 기본 정렬이라 보던 자리를 잃었다.
   * 링크(머리글 로고 등)로 새로 들어오면 처음부터 보여준다 — 브라우저가 스크롤을 다루는 방식과 같다.
   */
  const [restored] = useState(() =>
    navigationType === 'POP' ? (savedViews.get(location.key) ?? null) : null,
  )
  /*
   * 지난 방문에서 받아둔 카드가 있으면 그걸로 시작한다. 없으면 자리만 잡아 둔다.
   * 어느 쪽이든 아래 effect가 최신 값을 받아 같은 자리에 갈아끼운다.
   */
  /*
   * 어떤 종목이 대장인지는 서버가 정한다(GET /api/stocks/leading-stocks).
   * 첫 그림은 지난 방문에 받아 둔 값으로, 그것도 없으면 고정 목록으로 그린다.
   * loadCards()가 서버 값을 받아 같은 자리에 갈아끼운다.
   */
  const [leading, setLeading] = useState<LeadingStocks>(
    () => readCachedLeading() ?? FALLBACK_LEADING,
  )
  const themes = leading.themes

  const [topStocks, setTopStocks] = useState<(TopStock | null)[]>(
    () => readCachedTopStocks(leading.themes) ?? leading.themes.map(() => null),
  )
  const [hasTopError, setHasTopError] = useState(false)
  /** 카드마다 못 채운 이유. null이면 아직 오는 중이거나 채워졌다 */
  const [cardFailures, setCardFailures] = useState<(CardFailure | null)[]>(() =>
    leading.themes.map(() => null),
  )
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [visibleCount, setVisibleCount] = useState(
    restored?.visibleCount ?? PAGE_SIZE,
  )
  const [sort, setSort] = useState<SortState>(restored?.sort ?? DEFAULT_SORT)
  /** 관심종목. 처음엔 서버가 준 isLiked로 채우고, 하트를 누르면 서버에 반영한다 */
  const [favoriteCodes, setFavoriteCodes] = useState<Set<string>>(new Set())
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasStartedTop = useRef(false)
  /** 하트 요청이 진행 중인 종목. 연타로 등록·해제가 겹쳐 서버와 어긋나는 걸 막는다 */
  const pendingLikes = useRef(new Set<string>())
  /** 하트를 서버에 반영하지 못해 되돌렸을 때 알리는 말. 조용히 되돌리면 누른 게 무시된 것처럼 보인다 */
  const [likeNotice, setLikeNotice] = useState('')

  /**
   * 카드 세 장을 받는다. 증권사를 세 번 거치므로 들어올 때 한 번(10분 안에 받아 둔 게 있으면 그것도 안 한다)과
   * 사용자가 다시 시도를 누를 때만 부른다
   */
  const loadCards = useCallback((fresh = false) => {
    loadTopStocks(
      (next) => {
        setLeading(next)
        /*
         * 종목이 그대로면 이미 그려 둔 카드를 그대로 둔다. 매번 비우면 캐시로 띄워 둔
         * 그래프가 한 번 사라졌다가 다시 나타나 화면이 깜빡인다.
         */
        setTopStocks((previous) =>
          sameCodes(previous, next.themes) ? previous : next.themes.map(() => null),
        )
        setCardFailures((previous) =>
          previous.length === next.themes.length ? previous : next.themes.map(() => null),
        )
      },
      (index, stock) => {
        setTopStocks((previous) =>
          previous.map((item, i) => (i === index ? stock : item)),
        )
      },
      (index, reason) => {
        setCardFailures((previous) =>
          previous.map((item, i) => (i === index ? reason : item)),
        )
      },
      { fresh },
    ).catch((error: unknown) => {
      console.warn('테마별 대표 종목 조회 실패', error)
      setHasTopError(true)
    })
  }, [])

  useEffect(() => {
    // 개발 모드는 effect를 두 번 실행한다. 그대로 두면 카드 요청이 6건이 되어 제한에 걸린다
    if (hasStartedTop.current) return
    hasStartedTop.current = true
    // 첫 그림을 그린 캐시가 10분 안의 것이면 그대로 둔다(다시 시도는 이 검사 없이 새로 받는다)
    if (hasFreshTopStocks(themes)) return
    loadCards()
    // themes가 바뀌면 다시 돌지만 위 가드에서 곧장 빠져나온다
  }, [loadCards, themes])

  /** 카드 구역의 다시 시도. 그리다 멈춘 값을 버리고 자리표시부터 다시 받는다 */
  function retryCards() {
    setTopStocks(themes.map(() => null))
    setCardFailures(themes.map(() => null))
    setHasTopError(false)
    loadCards(true)
  }

  const load = useCallback(() => {
    setList({ kind: 'loading' })

    getStockList()
      .then(({ baseDate, stocks }) => {
        setList({ kind: 'ready', baseDate, stocks })
        setFavoriteCodes(
          new Set(
            stocks.filter((stock) => stock.isLiked).map((s) => s.stockCode),
          ),
        )
      })
      .catch((error: unknown) => {
        console.warn('종목 목록 조회 실패', error)
        setList({ kind: 'error' })
      })
  }, [])

  useEffect(load, [load])

  // 종목을 누르기 전에 상세 화면 묶음을 받아 둔다. 누른 뒤 받으면 그만큼 상세 요청이 늦게 나간다
  useEffect(() => preloadStockChartPage(), [])

  /** 지금 보고 있는 시세표. 떠날 때 savedViews에 옮겨 담는다 */
  const viewRef = useRef<HomeView>({
    sort,
    visibleCount,
    scrollY: restored?.scrollY ?? 0,
  })
  /** 되살릴 스크롤. 목록이 와서 행이 다 그려진 뒤에야 그 높이까지 내려갈 수 있다 */
  const pendingScrollRef = useRef(restored?.scrollY ?? null)

  useEffect(() => {
    viewRef.current.sort = sort
    viewRef.current.visibleCount = visibleCount
  }, [sort, visibleCount])

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
  }, [visibleCount, stocks.length])

  function handleSort(key: SortKey) {
    setSort((current) => nextSort(current, key))
    setVisibleCount(PAGE_SIZE)
  }

  /**
   * 하트는 먼저 바꾸고 서버에 알린다. 서버 응답을 기다렸다 바꾸면 눌린 느낌이 늦다.
   * 실패하면 되돌린다 — 화면만 켜진 채 서버엔 없는 상태로 두면 다음 방문에 사라져 보인다.
   */
  async function handleHeartClick(stockCode: string) {
    if (!isLoggedIn()) {
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

  const sortedStocks = sortStocks(stocks, sort)

  return (
    <>
      {/* 목록이 오기 전에는 로컬 사본으로 검색한다. 도착하면 서버 목록으로 바꾼다 */}
      <SearchBar stocks={searchable} />

      <section className={styles.section}>
        <p className={styles.eyebrow}>{describeBasis(leading.basis)}</p>
        {/* 홈의 대표 제목. 아래 '현재 주가 보기'가 h2로 이어진다 */}
        <h1 className={styles.heading}>테마별 대표 종목</h1>

        {/*
          카드를 그리다 멈춰도 검색·시세표는 남는다. 경계가 없을 땐 카드 한 장 때문에 홈 전체가 오류 화면이 됐다.
          한 장도 못 받았을 때만 에러로 대체한다. 일부라도 왔으면 그건 보여주는 편이 낫다
        */}
        <SectionBoundary onRetry={retryCards}>
          {hasTopError && topStocks.every((stock) => stock === null) ? (
            <p className={styles.loading}>차트를 불러오지 못했습니다.</p>
          ) : (
            <div className={styles.cards}>
              {themes.map((theme, index) => (
                <TopStockCard
                  key={theme.stockCode}
                  theme={theme}
                  stock={topStocks[index]}
                  failure={cardFailures[index]}
                />
              ))}
            </div>
          )}
        </SectionBoundary>
      </section>

      <section className={styles.section}>
        <div className={styles.headingRow}>
          <h2 className={styles.heading}>현재 주가 보기</h2>
          {/*
            16시 배치 전에는 전 거래일 종가가 뜬다. 언제 것인지 밝혀둔다.
            기준일이 비어 오면 줄째 숨긴다 — 시세표는 그대로 보여준다
          */}
          {list.kind === 'ready' && toKoreanDate(list.baseDate) !== '' && (
            <span className={styles.asOf}>
              {toKoreanDate(list.baseDate)} 종가 기준
            </span>
          )}
          {/*
            좁은 화면에서는 거래대금 열이 숨는데 기본 정렬이 거래대금이라 무엇 순인지 안 보인다.
            그 폭에서만 글로 적는다(CSS). 넓은 화면은 머리글 화살표가 알려 준다
          */}
          {list.kind === 'ready' && (
            <span className={styles.sortNote}>{describeSort(sort)}</span>
          )}
        </div>

        {likeNotice !== '' && (
          <p className={styles.likeNotice} role="status">
            {likeNotice}
          </p>
        )}

        {list.kind === 'loading' && (
          <p className={styles.loading}>시세를 불러오는 중…</p>
        )}

        {list.kind === 'error' && (
          <div className={styles.loading}>
            <p>시세를 불러오지 못했습니다.</p>
            <button type="button" className={styles.retry} onClick={load}>
              다시 시도
            </button>
          </div>
        )}

        {/* 표를 그리다 멈춰도 검색·테마 카드는 남는다. 다시 시도하면 목록을 새로 받는다 */}
        {list.kind === 'ready' && (
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
              {visibleCount < stocks.length && '불러오는 중…'}
            </div>
          </SectionBoundary>
        )}
      </section>

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
