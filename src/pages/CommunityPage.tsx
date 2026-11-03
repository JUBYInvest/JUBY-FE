import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { CommunityPost, CommunityStatus } from '../api/community'
import CommunityPosts from '../components/CommunityPosts'
import Spinner from '../components/Spinner'
import { COMMUNITY_RULES } from '../content/communityRules'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { loginPathFrom } from '../utils/navigation'
import styles from './CommunityPage.module.css'

type Order = 'latest' | 'popular'

const ORDERS: { key: Order; label: string }[] = [
  { key: 'latest', label: '최신순' },
  { key: 'popular', label: '공감 많은 순' },
]

const byLatest = (a: CommunityPost, b: CommunityPost) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
const byPopular = (a: CommunityPost, b: CommunityPost) => b.likeCount - a.likeCount || byLatest(a, b)

/** 글이 있는 종목을 글 수 많은 순으로(같으면 이름순) */
function stocksOf(posts: CommunityPost[]): { code: string; name: string; count: number }[] {
  const counts = new Map<string, { code: string; name: string; count: number }>()
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
 * 글 줄이 이어지는 게시판이다. 넓은 화면(1200px~)은 사용설명서와 같은 세 열 — 왼쪽 종목으로 보기 | 가운데 글 | 오른쪽 연결·이용 안내.
 * 글은 웹소켓으로 받는다(src/api/community.ts). 서버가 없는 지금은 예시 글이고, 보고 있는 동안 예시 새 글이 띄엄띄엄 들어온다 —
 * 바로 끼우지 않고 "새 글 N개"로 모았다가 누르면 위에 세운다(읽던 글이 밀리지 않게). 글쓰기는 실제 연결이 열렸을 때만 열린다
 */
export default function CommunityPage() {
  useDocumentTitle('커뮤니티')
  const { posts, pending, status, revealPending, sendPost } = useCommunityFeed()
  const [order, setOrder] = useState<Order>('latest')
  const [stockCode, setStockCode] = useState<string | null>(null)
  // "N분 전"은 목록이 바뀔 때마다 새로 센다 — 새 글을 세웠는데 앞 글이 "방금"에 멈춰 있지 않게
  const now = Date.now()

  const all = posts ?? []
  const stocks = stocksOf(all)
  const picked = stocks.find((stock) => stock.code === stockCode) ?? null
  const shown = all.filter((post) => picked === null || post.stockCode === picked.code).sort(order === 'latest' ? byLatest : byPopular)

  return (
    <>
      <h1 className={styles.title}>커뮤니티</h1>

      <div className={styles.layout}>
        <nav className={styles.stocks} aria-label="종목으로 보기">
          <ul className={styles.stockList}>
            <li>
              <button
                type="button"
                className={picked === null ? styles.stockOn : styles.stock}
                aria-pressed={picked === null}
                onClick={() => setStockCode(null)}
              >
                <span>전체 글</span> <span className={styles.count}>{all.length}</span>
              </button>
            </li>
            {stocks.map((stock) => (
              <li key={stock.code}>
                <button
                  type="button"
                  className={picked?.code === stock.code ? styles.stockOn : styles.stock}
                  aria-pressed={picked?.code === stock.code}
                  onClick={() => setStockCode(stock.code)}
                >
                  <span className={styles.stockName}>{stock.name}</span> <span className={styles.count}>{stock.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className={styles.feed} aria-labelledby="community-feed-title">
          <div className={styles.head}>
            <h2 id="community-feed-title" className={styles.headTitle}>
              {picked === null ? '전체 글' : `${picked.name} 이야기`}
            </h2>
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
          </div>

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
            <CommunityPosts posts={shown} now={now} />
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
