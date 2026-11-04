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
import { sharedYmd, toKoreanDate } from '../utils/date'
import { formatChangeRate, rateTone } from '../utils/format'
import { prefersReducedMotion } from '../utils/motion'
import type { StockInfo } from '../types/stock'
import styles from './CommunityPage.module.css'

type Order = 'latest' | 'popular'

/** 글 목록을 가르는 탭(2026-11-04 사용자 "인기 탭을 만들어서 인기있는 게시글을 정렬"). 무엇 순인지 탭 줄 오른쪽에 글로도 적는다 */
const ORDERS: { key: Order; label: string; note: string }[] = [
  { key: 'latest', label: '최신', note: '새로 올라온 순' },
  { key: 'popular', label: '인기', note: '공감 많은 순' },
]

interface StockChoice {
  code: string
  name: string
  count: number
}

/** 당겨서 새로고침이 받은 것 — 화면에는 띄우지 않고(새 글은 목록 맨 위에 선다) 읽어 주는 쪽에만 알린다 */
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
 * 커뮤니티(2026-11-03 사용자 "AI 주가분석과 사용설명서 사이에 커뮤니티… 홈 오른쪽 하단에 보이는 게 메인으로"). 토스증권 커뮤니티처럼
 * 글 줄이 이어지는 게시판이다. 2026-11-04 사용자 "왼쪽에 있는 전체/각 종목 선택창을 맨 위에 올려 주고, 좌우로 스크롤해서 종목을 선택하거나
 * 검색 버튼을 통해 종목을 선택… 인기 탭을 만들어서"(토스증권 앱 커뮤니티 캡처를 참고로) — 왼쪽 종목 목록을 글 위의 옆으로 미는 종목 카드 줄로 올리고,
 * 화면 제목 줄 오른쪽 "종목 검색"으로 글이 없는 종목도 찾아 고른다. 정렬은 글 위 큰 탭 최신 · 인기(공감 많은 순)다.
 * 같은 날 이어서(사용자가 토스증권 앱 인기 탭 캡처로 "커뮤니티 글쓰기 개념") 글이 제목 + 본문 + 사진이 되고, 글 줄은 글 상세(`/community/{postId}`)로,
 * 오른쪽 아래 떠 있는 "글쓰기"는 글쓰기 화면(`/community/write`)으로 간다. 글 머리 종목 옆에 그날 등락률(GET /api/stocks — DB, 홈 시세표와 같은 값).
 * 넓은 화면(901px~)은 두 열 — 글 | 오른쪽 연결·이용 안내(글 상세와 같은 틀).
 * 글은 웹소켓으로 받는다(src/api/community.ts). 서버가 없는 지금은 예시 글이고, 보고 있는 동안 예시 새 글이 띄엄띄엄 들어온다 —
 * 바로 끼우지 않고 "새 글 N개 보기"로 모았다가 누르면 위에 세운다(읽던 글이 밀리지 않게).
 * 손가락 화면은 맨 위에서 끌어내려도 새 글을 받는다(당겨서 새로고침, 같은 날 사용자 "글을 위쪽 방향으로 잡아당겼을 때 새로고침이 되어 새 글이 나오는 것" —
 * 쌓인 새 글 + 지금 받아 오는 새 글을 위에 세운다, 목업은 다음 예시 새 글을 바로 받는다. hooks/usePullToRefresh)
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
  /** 검색으로 고른 종목. 아직 글이 없으면 카드 줄 맨 앞(전체 다음)에 세운다 — 고른 것이 카드 줄에 보여야 다시 풀 수 있다 */
  const [searched, setSearched] = useState<{ code: string; name: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  /** 사람이 탭·카드·검색으로 목록을 바꾼 횟수. 바뀐 목록만 잠깐 떠오른다(처음 그릴 때는 걸지 않는다) */
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
  const quoted = shown.flatMap((post) => (post.stockCode === null ? [] : [quotes.get(post.stockCode)?.baseDate ?? '']))
  const quoteDate = quoted.length > 0 ? sharedYmd(quoted) : null

  /* 검색 후보: 글이 있는 종목을 먼저(같은 일치 순위 안에서 앞선다 — api/search rankStocks), 그 뒤 시총 상위 사본. 서버 검색이 그 밖을 더한다 */
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

  // 검색으로 고른 종목의 카드로 포커스를 옮긴다 — 카드 줄 밖(옆으로 밀린 자리)이면 줄을 밀어 보인다. 닫힌 검색 칸에 있던 포커스가 갈 곳이기도 하다
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
        {/* 당겨서 새로고침 표시 — 끌어내린 만큼 벌어진 자리 가운데. 화살표(다 당기면 위를 본다) → 도는 고리 → 곧바로 닫힌다 */}
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
              {/* 고른 종목은 아래 카드 줄이 보인다. 읽어 주는 쪽에는 구역 이름으로 알린다 */}
              <h2 id="community-feed-title" className={styles.srOnly}>
                {picked === null ? '전체 글' : `${picked.name} 이야기`}
              </h2>
              <div className={styles.head}>
                <div className={styles.tabs} role="group" aria-label="정렬">
                  {ORDERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={order === item.key ? styles.tabActive : styles.tab}
                      aria-pressed={order === item.key}
                      onClick={() => pickOrder(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className={styles.orderNote}>{orderNote}</span>
              </div>

              <StockStrip ref={stripRef} stocks={stocks} total={all.length} quotes={quotes} pickedCode={picked?.code ?? null} onPick={pickStock} />

              {quoteDate !== null && <p className={styles.asOf}>등락률은 {toKoreanDate(quoteDate)} 종가 기준이에요</p>}

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
                // 바뀐 목록은 새로 그려 잠깐 떠오르게 한다 — 카드를 누른 손가락 아래가 아니라 그 아래 글이 바뀌어, 바뀐 것을 눈이 따라가게(움직임 줄이기면 없다)
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

      {/* 고른 종목이 있으면 그 종목 이야기로 쓴다(글쓰기 화면이 종목을 채운다) */}
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
  /** 종목별 그날 등락률 — 카드 아래 줄 오른쪽(글 머리와 같은 값) */
  quotes: Map<string, StockQuote>
  pickedCode: string | null
  onPick: (code: string | null) => void
}

/**
 * 종목 카드 줄(토스증권 앱 커뮤니티의 종목 카드를 참고). 전체 + 글이 있는 종목(글 수 많은 순)을 옆으로 밀어 고른다.
 * 휴대폰은 손가락으로 민다. 마우스로는 옆으로 밀기 어려워(세로 휠은 줄을 밀지 않는다) 넘치는 쪽 끝에 앞·뒤 단추를 띄운다 —
 * 키보드는 Tab으로 카드를 따라가면 줄이 따라 밀리므로 단추를 Tab 차례에 넣지 않는다(마우스 전용, 손가락 화면에서는 CSS로 숨긴다)
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

  // 화면 끝에 걸쳐 반쯤 보이는 카드를 누르면 줄을 밀어 다 보인다(줄 안에서만 — 페이지는 움직이지 않는다)
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

/** 전체 카드의 표시 — 글 줄 셋 */
function AllIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/** 당겨서 새로고침 화살표 — 아래를 본다. 놓으면 받을 만큼 당기면 위로 뒤집힌다(CSS) */
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
