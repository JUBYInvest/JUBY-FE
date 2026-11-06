import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCommunityStocks, getPosts, isServerFault, type PageCursor, type PostOrder, type PostSummary, type StockCards } from '../api/community'
import { STOCK_LIST } from '../api/stockList'
import CommunityPosts from '../components/CommunityPosts'
import CommunitySide from '../components/CommunitySide'
import layout from '../components/communityLayout.module.css'
import SearchBar from '../components/SearchBar'
import Spinner from '../components/Spinner'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { toStockHandoff } from '../hooks/useStockHandoff'
import { useWriteGate } from '../hooks/useWriteGate'
import { toKoreanDateTime } from '../utils/date'
import { formatChangeRate, rateTone } from '../utils/format'
import { prefersReducedMotion } from '../utils/motion'
import type { StockInfo } from '../types/stock'
import styles from './CommunityPage.module.css'

/** 정렬 알약. 무엇 순인지는 머리 오른쪽에 글로도 적는다 */
const ORDERS: { key: PostOrder; label: string; note: string; empty: string }[] = [
  { key: 'latest', label: '최신', note: '새로 올라온 순', empty: '아직 올라온 글이 없어요.' },
  { key: 'popular', label: '인기', note: '이번 주 좋아요 순', empty: '이번 주에 올라온 글이 없어요.' },
]

interface StockChoice {
  code: string
  name: string
  count: number
  changeRate: number | null
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; server: boolean }
  | { kind: 'ready'; items: PostSummary[]; next: PageCursor | null; more: 'idle' | 'loading' | 'error' }

const withoutDuplicates = (list: PostSummary[]) => list.filter((post, index) => list.findIndex((other) => other.postId === post.postId) === index)

/**
 * 커뮤니티 목록. 머리(제목 · 종목 검색 → 최신 · 인기 알약) → 종목 카드 줄 → 글 줄, 넓은 화면은 오른쪽에 이용 안내(글 상세와 같은 두 열 틀).
 * 종목 카드는 `GET /api/community/stocks`, 글은 고른 탭·종목으로 한 쪽(20개)씩 받는다. 손가락 화면은 맨 위를 끌어내려 다시 받는다.
 * 글쓰기는 로그인·닉네임을 확인한 뒤 연다(useWriteGate)
 */
export default function CommunityPage() {
  useDocumentTitle('커뮤니티')
  const navigate = useNavigate()
  const gate = useWriteGate()
  const stripRef = useRef<HTMLElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  /** 검색으로 고른 종목 — 그려진 뒤 그 카드로 포커스를 옮긴다 */
  const focusCodeRef = useRef<string | null>(null)
  const [order, setOrder] = useState<PostOrder>('latest')
  const [stockCode, setStockCode] = useState<string | null>(null)
  /** 검색으로 고른 종목. 카드 줄에 없어도(글이 적어 열 개 안에 못 든 종목) 전체 다음에 세운다 — 카드가 보여야 다시 풀 수 있다 */
  const [searched, setSearched] = useState<{ code: string; name: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [cards, setCards] = useState<StockCards | null>(null)
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [turn, setTurn] = useState(0)
  /** 사람이 목록을 바꾼 횟수 — 바뀐 목록만 떠오른다(처음 그릴 때는 걸지 않는다) */
  const [feedTurn, setFeedTurn] = useState(0)
  /** 늦게 온 앞 요청(탭·종목을 바꾼 뒤)을 버리는 번호 */
  const requestRef = useRef(0)

  const loadCards = useCallback(() => {
    getCommunityStocks()
      .then(setCards)
      .catch((error: unknown) => console.warn('커뮤니티 종목 카드를 받지 못했습니다', error))
  }, [])

  useEffect(loadCards, [loadCards])

  useEffect(() => {
    const id = ++requestRef.current
    setList({ kind: 'loading' })
    getPosts(order, stockCode)
      .then((page) => {
        if (id === requestRef.current) setList({ kind: 'ready', items: page.items, next: page.next, more: 'idle' })
      })
      .catch((error: unknown) => {
        console.warn('커뮤니티 글을 받지 못했습니다', error)
        if (id === requestRef.current) setList({ kind: 'error', server: isServerFault(error) })
      })
  }, [order, stockCode, turn])

  const loadMore = () => {
    if (list.kind !== 'ready' || list.next === null || list.more === 'loading') return
    const id = requestRef.current
    setList({ ...list, more: 'loading' })
    getPosts(order, stockCode, list.next)
      .then((page) => {
        if (id !== requestRef.current) return
        setList((current) => (current.kind === 'ready' ? { kind: 'ready', items: withoutDuplicates([...current.items, ...page.items]), next: page.next, more: 'idle' } : current))
      })
      .catch((error: unknown) => {
        console.warn('커뮤니티 글을 더 받지 못했습니다', error)
        if (id === requestRef.current) setList((current) => (current.kind === 'ready' ? { ...current, more: 'error' } : current))
      })
  }

  const pullRef = useRef<HTMLDivElement>(null)
  /** 당겨서 새로고침 — 위에 올린 새 글, 실패면 'error', 받는 사이 정렬·종목을 바꿨으면 null(알릴 것 없음) */
  const pull = usePullToRefresh(pullRef, async (): Promise<PostSummary[] | 'error' | null> => {
    const before = new Set(list.kind === 'ready' ? list.items.map((post) => post.postId) : [])
    loadCards()
    // 받는 사이 탭·종목을 바꾸면 그쪽 목록이 이긴다 — 늦게 온 이 쪽이 덮지 않게 번호를 먼저 잡는다
    const id = ++requestRef.current
    try {
      const page = await getPosts(order, stockCode)
      if (id !== requestRef.current) return null
      setList({ kind: 'ready', items: page.items, next: page.next, more: 'idle' })
      const incoming = page.items.filter((post) => !before.has(post.postId))
      if (incoming.length > 0) setFeedTurn((value) => value + 1)
      return incoming
    } catch (error: unknown) {
      console.warn('커뮤니티 글을 새로 받지 못했습니다', error)
      // 받아 둔 목록은 그대로 둔다. 이 번호로 끊긴 첫 목록·더 보기는 다시 할 수 있게 푼다
      if (id === requestRef.current) {
        setList((current) =>
          current.kind === 'loading' ? { kind: 'error', server: isServerFault(error) } : current.kind === 'ready' && current.more === 'loading' ? { ...current, more: 'idle' } : current,
        )
      }
      return 'error'
    }
  })
  // "N분 전"은 다시 그릴 때마다 지금 시각으로 센다
  const now = Date.now()

  const fromCards: StockChoice[] = (cards?.stocks ?? []).map((card) => ({ code: card.stockCode, name: card.stockName, count: card.postCount, changeRate: card.changeRate }))
  const stocks: StockChoice[] =
    searched !== null && !fromCards.some((stock) => stock.code === searched.code) ? [{ ...searched, count: 0, changeRate: null }, ...fromCards] : fromCards
  const picked = stocks.find((stock) => stock.code === stockCode) ?? null
  const orderInfo = ORDERS.find((item) => item.key === order) ?? ORDERS[0]
  const asOf = cards?.priceAsOf != null ? toKoreanDateTime(cards.priceAsOf) : ''

  // 검색 후보: 카드 줄 종목이 같은 일치 순위 안에서 앞선다(rankStocks), 그 뒤 시총 상위 사본
  const searchable = useMemo(() => {
    const seen = new Set<string>()
    const own: StockInfo[] = (cards?.stocks ?? []).map((card) => ({ stockCode: card.stockCode, stockName: card.stockName }))
    return [...own, ...STOCK_LIST].filter((stock) => !seen.has(stock.stockCode) && seen.add(stock.stockCode))
  }, [cards])

  const closeSearch = () => {
    setSearchOpen(false)
    searchToggleRef.current?.focus()
  }

  const pickOrder = (next: PostOrder) => {
    if (next === order) return
    setOrder(next)
    setFeedTurn((value) => value + 1)
  }

  const pickStock = (code: string | null) => {
    if (code === stockCode) return
    setStockCode(code)
    setFeedTurn((value) => value + 1)
  }

  const pickSearched = (stock: StockInfo) => {
    setSearched({ code: stock.stockCode, name: stock.stockName })
    pickStock(stock.stockCode)
    setSearchOpen(false)
    focusCodeRef.current = stock.stockCode
  }

  // 검색으로 고른 종목의 카드로 포커스를 옮긴다 — 닫힌 검색 칸에 있던 포커스가 갈 곳이다
  useEffect(() => {
    const code = focusCodeRef.current
    if (code === null) return
    focusCodeRef.current = null
    const card = stripRef.current?.querySelector<HTMLButtonElement>(`button[data-code="${code}"]`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [stockCode, searchOpen])

  // 고른 종목이 있으면 그 종목 이야기로 쓴다
  const write = () => gate.ensure(() => navigate('/community/write', { state: picked === null ? undefined : toStockHandoff({ stockCode: picked.code, stockName: picked.name }) }))

  const pulled =
    pull.result === null
      ? ''
      : pull.result === 'error'
        ? '새 글을 불러오지 못했어요. 다시 당겨 주세요'
        : pull.result.length === 0
          ? '새 글이 없어요'
          : `새 글 ${pull.result.length}개를 위에 올렸어요`

  return (
    <>
      <div ref={pullRef} className={styles.pull}>
        {/* 당겨서 새로고침 — 끌어내린 만큼 벌어진 자리 가운데에 화살표, 놓으면 도는 고리 */}
        <div className={styles.pullMark} aria-hidden="true">
          {pull.phase === 'refreshing' || pull.phase === 'closing' ? <Spinner size={20} /> : <PullIcon />}
        </div>
        <div className={styles.pullBody}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>커뮤니티</h1>
            <button
              ref={searchToggleRef}
              type="button"
              className={styles.searchToggle}
              aria-expanded={searchOpen}
              aria-controls={searchOpen ? 'community-search' : undefined}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <SearchIcon />
              종목 검색
            </button>
          </div>

          {searchOpen && (
            <div id="community-search" className={styles.search}>
              <SearchBar
                stocks={searchable}
                onPick={pickSearched}
                onDismiss={closeSearch}
                autoFocus
                placeholder="종목명이나 종목코드로 찾기 (예: 삼성전자)"
              />
            </div>
          )}

          <div className={layout.layout}>
            <section className={layout.main} aria-labelledby="community-feed-title">
              {/* 고른 종목은 카드 줄이 보여 준다. 읽어 주는 쪽에는 구역 이름으로 */}
              <h2 id="community-feed-title" className={styles.srOnly}>
                {picked === null ? '전체 글' : `${picked.name} 이야기`}
              </h2>
              <div className={styles.head}>
                <div className={styles.orders} role="group" aria-label="정렬">
                  {ORDERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={order === item.key ? styles.orderOn : styles.order}
                      aria-pressed={order === item.key}
                      onClick={() => pickOrder(item.key)}
                    >
                      {item.key === 'latest' ? <ClockIcon /> : <FlameIcon />}
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className={styles.orderNote}>{orderInfo.note}</span>
              </div>

              <StockStrip ref={stripRef} stocks={stocks} total={cards?.totalPostCount ?? null} pickedCode={picked?.code ?? null} onPick={pickStock} />

              {asOf !== '' && <p className={styles.asOf}>{asOf} 기준 등락률이에요</p>}

              {list.kind === 'loading' ? (
                <p className={styles.message}>
                  <Spinner size={16} /> 글을 불러오는 중…
                </p>
              ) : list.kind === 'error' ? (
                <div className={styles.message}>
                  <p>{list.server ? '커뮤니티 서버에 문제가 생겨 글을 불러오지 못했어요.' : '글을 불러오지 못했어요.'}</p>
                  <button type="button" className={styles.retry} onClick={() => setTurn((value) => value + 1)}>
                    다시 시도
                  </button>
                </div>
              ) : list.items.length === 0 ? (
                <p className={styles.message}>{picked === null ? orderInfo.empty : `${picked.name} 이야기는 아직 없어요.`}</p>
              ) : (
                // 바뀐 목록은 새로 그려 잠깐 떠오른다 — 누른 곳 아래에서 바뀌어 눈이 따라가게
                <div key={feedTurn} className={feedTurn > 0 ? styles.feedTurn : undefined}>
                  <CommunityPosts posts={list.items} now={now} />
                  {list.next !== null && (
                    <button type="button" className={styles.more} onClick={loadMore} disabled={list.more === 'loading'}>
                      {list.more === 'loading' ? '불러오는 중…' : list.more === 'error' ? '못 불러왔어요 — 다시 시도' : '글 더 보기'}
                    </button>
                  )}
                </div>
              )}
              <div className={styles.feedEnd} />
            </section>

            <CommunitySide className={layout.side} />
          </div>
        </div>
      </div>
      <p className={styles.srOnly} role="status">
        {pulled}
      </p>

      <button type="button" onClick={write} className={styles.write}>
        <PencilIcon />
        글쓰기
      </button>
      {gate.modals}
    </>
  )
}

interface StockStripProps {
  ref: Ref<HTMLElement>
  stocks: StockChoice[]
  /** 전체 글 수(종목 없는 글 포함). 못 받았으면 null */
  total: number | null
  pickedCode: string | null
  onPick: (code: string | null) => void
}

/**
 * 종목 카드 줄 — 전체 + 글이 많은 종목(서버가 열 개까지)을 옆으로 밀어 고른다. 마우스는 세로 휠로 줄을 밀 수 없어 넘치는 쪽 끝에 앞·뒤 단추를 띄운다.
 * 키보드는 Tab으로 카드를 따라가면 줄이 밀리므로 단추를 Tab 차례에 넣지 않는다(손가락 화면에서는 CSS로 숨긴다)
 */
function StockStrip({ ref, stocks, total, pickedCode, onPick }: StockStripProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const list = listRef.current
    if (list === null) return
    const measure = () => {
      const start = list.scrollLeft > 1
      const end = list.scrollLeft < list.scrollWidth - list.clientWidth - 1
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', measure)
    }
  }, [stocks.length])

  const slide = (direction: 1 | -1) => {
    const list = listRef.current
    if (list === null) return
    list.scrollBy({ left: direction * list.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  // 끝에 반쯤 걸친 카드를 누르면 줄을 밀어 다 보인다(scrollIntoView는 페이지까지 움직인다)
  const reveal = (button: HTMLElement) => {
    const list = listRef.current
    if (list === null) return
    const box = button.getBoundingClientRect()
    const view = list.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(list).scrollPaddingInlineStart) || 0
    const shift = box.left < view.left + pad ? box.left - view.left - pad : box.right > view.right - pad ? box.right - view.right + pad : 0
    if (shift !== 0) list.scrollBy({ left: shift, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const card = (code: string | null, name: string, count: number | null, fluctuate: number | null) => {
    const on = pickedCode === code
    return (
      <li key={code ?? 'all'}>
        <button
          type="button"
          data-code={code ?? 'all'}
          className={on ? styles.cardOn : styles.card}
          aria-pressed={on}
          onClick={(event) => {
            reveal(event.currentTarget)
            onPick(code)
          }}
        >
          <span className={styles.badge} aria-hidden="true">
            {code === null ? <AllIcon /> : Array.from(name)[0]}
          </span>
          <span className={styles.cardName}>{name}</span>{' '}
          <span className={styles.cardFoot}>
            {count !== null && <span className={styles.count}>글 {count}</span>}
            {fluctuate !== null && (
              <>
                {' '}
                <span className={styles[rateTone(fluctuate)]}>{formatChangeRate(fluctuate)}</span>
              </>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <nav ref={ref} className={styles.strip} aria-label="종목으로 보기">
      <ul ref={listRef} className={styles.stockList}>
        {card(null, '전체', total, null)}
        {stocks.map((stock) => card(stock.code, stock.name, stock.count, stock.changeRate))}
      </ul>
      {edges.start && (
        <button type="button" className={styles.slidePrev} tabIndex={-1} aria-hidden="true" onClick={() => slide(-1)}>
          <ChevronIcon />
        </button>
      )}
      {edges.end && (
        <button type="button" className={styles.slideNext} tabIndex={-1} aria-hidden="true" onClick={() => slide(1)}>
          <ChevronIcon />
        </button>
      )}
    </nav>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.5 2.2 2.5-.6-3 .3-5.6.8-8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 전체 카드의 표시 — 글 줄 셋 */
function AllIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** 당겨서 새로고침 화살표 — 문턱을 넘으면 CSS가 위로 뒤집는다 */
function PullIcon() {
  return (
    <svg className={styles.pullArrow} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v15m-6-6 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

/** 뒤(오른쪽)를 가리킨다. 앞 단추는 CSS로 뒤집는다 */
function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
