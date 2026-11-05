import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Link } from 'react-router-dom'
import type { CommunityPost } from '../api/community'
import { STOCK_LIST } from '../api/stockList'
import CommunityPosts from '../components/CommunityPosts'
import CommunitySide from '../components/CommunitySide'
import layout from '../components/communityLayout.module.css'
import SearchBar from '../components/SearchBar'
import Spinner from '../components/Spinner'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { toStockHandoff } from '../hooks/useStockHandoff'
import { useStockQuotes, type StockQuote } from '../hooks/useStockQuotes'
import { formatChangeRate, rateTone } from '../utils/format'
import { prefersReducedMotion } from '../utils/motion'
import type { StockInfo } from '../types/stock'
import styles from './CommunityPage.module.css'

type Order = 'latest' | 'popular'

/** 정렬 알약. 무엇 순인지는 머리 오른쪽에 글로도 적는다 */
const ORDERS: { key: Order; label: string; note: string }[] = [
  { key: 'latest', label: '최신', note: '새로 올라온 순' },
  { key: 'popular', label: '인기', note: '공감 많은 순' },
]

interface StockChoice {
  code: string
  name: string
  count: number
}

/** 당겨서 새로고침 결과 — 화면에는 띄우지 않고 읽어 주는 쪽에만 알린다(새 글은 목록 맨 위에 선 것으로 보인다) */
function pullMessage(incoming: CommunityPost[]): string {
  return incoming.length === 0 ? '새 글이 없어요' : `새 글 ${incoming.length}개를 위에 올렸어요`
}

const byLatest = (a: CommunityPost, b: CommunityPost) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
const byPopular = (a: CommunityPost, b: CommunityPost) => b.likeCount - a.likeCount || byLatest(a, b)

/** 글이 있는 종목을 글 수 많은 순으로(같으면 이름순) */
function stocksOf(posts: CommunityPost[]): StockChoice[] {
  const counts = new Map<string, StockChoice>()
  for (const post of posts) {
    if (post.stockCode === null || post.stockName === null) continue
    const item = counts.get(post.stockCode) ?? { code: post.stockCode, name: post.stockName, count: 0 }
    item.count += 1
    counts.set(post.stockCode, item)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
}

/**
 * 커뮤니티 목록. 머리(제목 · 종목 검색 → 최신 · 인기 알약) → 종목 카드 줄 → 글 줄, 넓은 화면은 오른쪽에 이용 안내(글 상세와 같은 두 열 틀).
 * 글은 웹소켓으로 받는다(src/api/community.ts). 보고 있는 동안 온 새 글은 바로 끼우지 않고(읽던 글이 밀린다) "새 글 N개 보기"로 모았다가 세운다 —
 * 손가락 화면은 맨 위를 끌어내려도 받는다(hooks/usePullToRefresh)
 */
export default function CommunityPage() {
  useDocumentTitle('커뮤니티')
  const { posts, pending, status, revealPending, refresh } = useCommunityFeed()
  const quotes = useStockQuotes()
  const stripRef = useRef<HTMLElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  /** 검색으로 고른 종목 — 그려진 뒤 그 카드로 포커스를 옮긴다 */
  const focusCodeRef = useRef<string | null>(null)
  const [order, setOrder] = useState<Order>('latest')
  const [stockCode, setStockCode] = useState<string | null>(null)
  /** 검색으로 고른 종목. 글이 없어도 카드 줄(전체 다음)에 세운다 — 카드가 보여야 다시 풀 수 있다 */
  const [searched, setSearched] = useState<{ code: string; name: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  /** 사람이 목록을 바꾼 횟수 — 바뀐 목록만 떠오른다(처음 그릴 때는 걸지 않는다) */
  const [feedTurn, setFeedTurn] = useState(0)
  const pullRef = useRef<HTMLDivElement>(null)
  const pull = usePullToRefresh(pullRef, async () => {
    const incoming = await refresh()
    if (incoming.length > 0) setFeedTurn((turn) => turn + 1)
    return incoming
  })
  // "N분 전"은 목록이 바뀔 때마다 새로 센다 — 새 글을 세웠는데 앞 글이 "방금"에 멈춰 있지 않게
  const now = Date.now()

  const all = posts ?? []
  const withPosts = stocksOf(all)
  const stocks: StockChoice[] =
    searched !== null && !withPosts.some((stock) => stock.code === searched.code) ? [{ ...searched, count: 0 }, ...withPosts] : withPosts
  const picked = stocks.find((stock) => stock.code === stockCode) ?? null
  const shown = all.filter((post) => picked === null || post.stockCode === picked.code).sort(order === 'latest' ? byLatest : byPopular)
  const orderNote = ORDERS.find((item) => item.key === order)?.note ?? ''
  // 등락률이 언제 값인지 — 보이는 글의 종목이 모두 같은 날 종가면 목록 위에 한 번 적는다
  const quoted = new Set(shown.flatMap((post) => (post.stockCode === null ? [] : [quotes.get(post.stockCode)?.basis ?? ''])))
  const quoteBasis = quoted.size === 1 ? [...quoted][0] : ''

  // 검색 후보: 글이 있는 종목이 같은 일치 순위 안에서 앞선다(rankStocks), 그 뒤 시총 상위 사본
  const searchable = useMemo(() => {
    const seen = new Set<string>()
    const own: StockInfo[] = stocksOf(posts ?? []).map((stock) => ({ stockCode: stock.code, stockName: stock.name }))
    return [...own, ...STOCK_LIST].filter((stock) => !seen.has(stock.stockCode) && seen.add(stock.stockCode))
  }, [posts])

  const closeSearch = () => {
    setSearchOpen(false)
    searchToggleRef.current?.focus()
  }

  const pickOrder = (next: Order) => {
    if (next === order) return
    setOrder(next)
    setFeedTurn((turn) => turn + 1)
  }

  const pickStock = (code: string | null) => {
    if (code === stockCode) return
    setStockCode(code)
    setFeedTurn((turn) => turn + 1)
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

  const pulled = pull.result === null ? '' : pullMessage(pull.result)

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
                <span className={styles.orderNote}>{orderNote}</span>
              </div>

              <StockStrip ref={stripRef} stocks={stocks} total={all.length} quotes={quotes} pickedCode={picked?.code ?? null} onPick={pickStock} />

              {quoteBasis !== '' && <p className={styles.asOf}>{quoteBasis} 등락률이에요</p>}

              {pending.length > 0 && (
                <button type="button" className={styles.fresh} onClick={revealPending}>
                  새 글 {pending.length}개 보기
                </button>
              )}

              {posts === null ? (
                <p className={styles.message}>
                  <Spinner size={16} /> 글을 불러오는 중…
                </p>
              ) : shown.length === 0 ? (
                <p className={styles.message}>{picked === null ? '아직 올라온 글이 없어요.' : `${picked.name} 이야기는 아직 없어요.`}</p>
              ) : (
                // 바뀐 목록은 새로 그려 잠깐 떠오른다 — 누른 곳 아래에서 바뀌어 눈이 따라가게
                <div key={feedTurn} className={feedTurn > 0 ? styles.feedTurn : undefined}>
                  <CommunityPosts posts={shown} now={now} quotes={quotes} />
                </div>
              )}
              <div className={styles.feedEnd} />
            </section>

            <CommunitySide status={status} className={layout.side} />
          </div>
        </div>
      </div>
      <p className={styles.srOnly} role="status">
        {pulled}
      </p>

      {/* 고른 종목이 있으면 그 종목 이야기로 쓴다 */}
      <Link to="/community/write" state={picked === null ? undefined : toStockHandoff({ stockCode: picked.code, stockName: picked.name })} className={styles.write}>
        <PencilIcon />
        글쓰기
      </Link>
    </>
  )
}

interface StockStripProps {
  ref: Ref<HTMLElement>
  stocks: StockChoice[]
  /** 전체 글 수 */
  total: number
  /** 종목별 그날 등락률 */
  quotes: Map<string, StockQuote>
  pickedCode: string | null
  onPick: (code: string | null) => void
}

/**
 * 종목 카드 줄 — 전체 + 글이 있는 종목을 옆으로 밀어 고른다. 마우스는 세로 휠로 줄을 밀 수 없어 넘치는 쪽 끝에 앞·뒤 단추를 띄운다.
 * 키보드는 Tab으로 카드를 따라가면 줄이 밀리므로 단추를 Tab 차례에 넣지 않는다(손가락 화면에서는 CSS로 숨긴다)
 */
function StockStrip({ ref, stocks, total, quotes, pickedCode, onPick }: StockStripProps) {
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

  const card = (code: string | null, name: string, count: number) => {
    const on = pickedCode === code
    const fluctuate = code === null ? null : (quotes.get(code)?.fluctuate ?? null)
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
            <span className={styles.count}>글 {count}</span>
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
        {card(null, '전체', total)}
        {stocks.map((stock) => card(stock.code, stock.name, stock.count))}
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
