import { useEffect, useMemo, useRef, useState, type FormEvent, type Ref } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { CommunityPost, CommunityStatus } from '../api/community'
import { STOCK_LIST } from '../api/stockList'
import CommunityPosts from '../components/CommunityPosts'
import SearchBar from '../components/SearchBar'
import Spinner from '../components/Spinner'
import { COMMUNITY_RULES } from '../content/communityRules'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useCommunityHandoff } from '../hooks/useStockHandoff'
import { prefersReducedMotion } from '../utils/motion'
import { loginPathFrom } from '../utils/navigation'
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
 * 넓은 화면(901px~)은 두 열 — 글 | 오른쪽 연결·이용 안내.
 * 글은 웹소켓으로 받는다(src/api/community.ts). 서버가 없는 지금은 예시 글이고, 보고 있는 동안 예시 새 글이 띄엄띄엄 들어온다 —
 * 바로 끼우지 않고 "새 글 N개 보기"로 모았다가 누르면 위에 세운다(읽던 글이 밀리지 않게). 글쓰기는 실제 연결이 열렸을 때만 열린다.
 * 홈 글 줄을 눌러 왔으면 그 글을 표시하고 그리로 옮겨 포커스를 준다(한 번만 — 새로고침·메뉴로 오면 표시가 없다)
 */
export default function CommunityPage() {
  useDocumentTitle('커뮤니티')
  const opened = useCommunityHandoff()
  const { posts, pending, status, revealPending, sendPost } = useCommunityFeed(opened)
  const feedRef = useRef<HTMLElement>(null)
  const stripRef = useRef<HTMLElement>(null)
  const searchToggleRef = useRef<HTMLButtonElement>(null)
  const jumpedRef = useRef(false)
  /** 검색으로 고른 종목 — 그려진 뒤 그 카드로 포커스를 옮긴다 */
  const focusCodeRef = useRef<string | null>(null)
  const [order, setOrder] = useState<Order>('latest')
  const [stockCode, setStockCode] = useState<string | null>(null)
  /** 검색으로 고른 종목. 아직 글이 없으면 카드 줄 맨 앞(전체 다음)에 세운다 — 고른 것이 카드 줄에 보여야 다시 풀 수 있다 */
  const [searched, setSearched] = useState<{ code: string; name: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  // "N분 전"은 목록이 바뀔 때마다 새로 센다 — 새 글을 세웠는데 앞 글이 "방금"에 멈춰 있지 않게
  const now = Date.now()

  const all = posts ?? []
  const withPosts = stocksOf(all)
  const stocks: StockChoice[] =
    searched !== null && !withPosts.some((stock) => stock.code === searched.code) ? [{ ...searched, count: 0 }, ...withPosts] : withPosts
  const picked = stocks.find((stock) => stock.code === stockCode) ?? null
  const shown = all.filter((post) => picked === null || post.stockCode === picked.code).sort(order === 'latest' ? byLatest : byPopular)
  const orderNote = ORDERS.find((item) => item.key === order)?.note ?? ''

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

  const pickSearched = (stock: StockInfo) => {
    setSearched({ code: stock.stockCode, name: stock.stockName })
    setStockCode(stock.stockCode)
    setSearchOpen(false)
    focusCodeRef.current = stock.stockCode
  }

  // 눌러 온 글이 그려지면 화면 가운데로 옮기고 포커스를 준다(읽어 주는 쪽도 그 글부터). 목록이 오기 전에는 그 줄이 없다
  useEffect(() => {
    if (opened === null || posts === null || jumpedRef.current) return
    const row = feedRef.current?.querySelector<HTMLElement>('li[aria-current="true"]')
    if (row == null) return
    jumpedRef.current = true
    row.scrollIntoView({ block: 'center' })
    row.focus({ preventScroll: true })
  }, [opened, posts])

  // 검색으로 고른 종목의 카드로 포커스를 옮긴다 — 카드 줄 밖(옆으로 밀린 자리)이면 줄을 밀어 보인다. 닫힌 검색 칸에 있던 포커스가 갈 곳이기도 하다
  useEffect(() => {
    const code = focusCodeRef.current
    if (code === null) return
    focusCodeRef.current = null
    const card = stripRef.current?.querySelector<HTMLButtonElement>(`button[data-code="${code}"]`)
    card?.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [stockCode, searchOpen])

  return (
    <>
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

      <div className={styles.layout}>
        <section ref={feedRef} className={styles.feed} aria-labelledby="community-feed-title">
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
                  onClick={() => setOrder(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className={styles.orderNote}>{orderNote}</span>
          </div>

          <StockStrip ref={stripRef} stocks={stocks} total={all.length} pickedCode={picked?.code ?? null} onPick={setStockCode} />

          <Composer status={status} stock={picked} onSend={sendPost} />

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
            <CommunityPosts posts={shown} now={now} currentId={opened?.postId ?? null} />
          )}
        </section>

        <aside className={styles.side} aria-label="커뮤니티 안내">
          <h2 id="community-side-title" className={styles.sideTitle}>
            이용 안내
          </h2>
          <section aria-labelledby="community-status-title" className={styles.sideSection}>
            <h3 id="community-status-title" className={styles.sideHeading}>
              실시간 연결
            </h3>
            <StatusLine status={status} />
          </section>
          <section aria-labelledby="community-rules-title" className={styles.sideSection}>
            <h3 id="community-rules-title" className={styles.sideHeading}>
              함께 지켜요
            </h3>
            <ul className={styles.rules}>
              {COMMUNITY_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}

interface StockStripProps {
  ref: Ref<HTMLElement>
  stocks: StockChoice[]
  /** 전체 글 수 */
  total: number
  pickedCode: string | null
  onPick: (code: string | null) => void
}

/**
 * 종목 카드 줄(토스증권 앱 커뮤니티의 종목 카드를 참고). 전체 + 글이 있는 종목(글 수 많은 순)을 옆으로 밀어 고른다.
 * 휴대폰은 손가락으로 민다. 마우스로는 옆으로 밀기 어려워(세로 휠은 줄을 밀지 않는다) 넘치는 쪽 끝에 앞·뒤 단추를 띄운다 —
 * 키보드는 Tab으로 카드를 따라가면 줄이 따라 밀리므로 단추를 Tab 차례에 넣지 않는다(마우스 전용, 손가락 화면에서는 CSS로 숨긴다)
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

  const card = (code: string | null, name: string, count: number) => {
    const on = pickedCode === code
    return (
      <li key={code ?? 'all'}>
        <button type="button" data-code={code ?? 'all'} className={on ? styles.cardOn : styles.card} aria-pressed={on} onClick={() => onPick(code)}>
          <span className={styles.badge} aria-hidden="true">
            {code === null ? <AllIcon /> : Array.from(name)[0]}
          </span>
          <span className={styles.cardName}>{name}</span> <span className={styles.count}>글 {count}</span>
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

/** 뒤(오른쪽)를 가리킨다. 앞 단추는 CSS로 뒤집는다 */
function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatusLine({ status }: { status: CommunityStatus }) {
  if (status === 'open') return <p className={styles.statusOn}>새 글을 실시간으로 받고 있어요.</p>
  if (status === 'mock') {
    return (
      <p className={styles.status}>
        지금 보이는 글은 예시예요. 커뮤니티 서버가 열리기 전까지, 새 글이 들어오는 모습을 보이려고 예시 글이 몇 분마다 들어와요.
      </p>
    )
  }
  return (
    <p className={styles.status}>
      <Spinner size={14} /> {status === 'connecting' ? '연결하는 중…' : '연결이 끊겨 다시 잇는 중…'}
    </p>
  )
}

/**
 * 글쓰기. 실제 연결이 열린 로그인 사용자만 쓴다 — 목업일 때 칸을 열어 두면 써도 아무 데도 가지 않는다(2026-10-30 결정과 같은 까닭).
 * 보낸 글은 서버가 POST_CREATED로 되돌려 줄 때 "새 글"로 들어온다
 */
interface ComposerProps {
  status: CommunityStatus
  /** 종목으로 보는 중이면 그 종목 이야기로 올린다 */
  stock: { code: string; name: string } | null
  onSend: (content: string, stockCode: string | null) => boolean
}

function Composer({ status, stock, onSend }: ComposerProps) {
  const loggedIn = useIsLoggedIn()
  const { pathname } = useLocation()
  const [text, setText] = useState('')
  const open = status === 'open' && loggedIn
  const placeholder =
    status === 'mock' ? '글쓰기는 커뮤니티 서버가 열리면 시작돼요' : stock === null ? '배운 것, 궁금한 것을 나눠 보세요' : `${stock.name} 이야기를 나눠 보세요`

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const content = text.trim()
    // 못 보냈으면(그새 끊김) 쓴 글을 지우지 않는다
    if (content !== '' && onSend(content, stock?.code ?? null)) setText('')
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label className={styles.srOnly} htmlFor="community-input">
        커뮤니티에 올릴 글
      </label>
      <input
        id="community-input"
        className={styles.input}
        type="text"
        maxLength={500}
        value={text}
        placeholder={placeholder}
        disabled={!open}
        onChange={(event) => setText(event.target.value)}
      />
      {status !== 'mock' && !loggedIn ? (
        <Link to={loginPathFrom(pathname)} className={styles.login}>
          로그인
        </Link>
      ) : (
        <button type="submit" className={styles.send} disabled={!open || text.trim() === ''}>
          올리기
        </button>
      )}
    </form>
  )
}
