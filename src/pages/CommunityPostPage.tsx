import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadCommunityPost, type CommunityPost } from '../api/community'
import { PostCounts } from '../components/CommunityPosts'
import CommunitySide from '../components/CommunitySide'
import layout from '../components/communityLayout.module.css'
import Spinner from '../components/Spinner'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useCommunityHandoff } from '../hooks/useStockHandoff'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { timeAgo, toKoreanDate } from '../utils/date'
import { formatChangeRate, rateTone } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import styles from './CommunityPostPage.module.css'

/** 주소 기록에서 따로 받아 온 글(목록에 없을 때). 그 사이 다른 글로 옮겼으면 버린다 */
interface Loaded {
  postId: number
  post: CommunityPost | null
}

/**
 * 커뮤니티 글 상세(`/community/{postId}`, 2026-11-04 사용자가 고른 것 — 토스증권 앱처럼 글을 누르면 글 하나를 본다).
 * 목록과 같은 두 열 틀(글 | 이용 안내) 위에 글 제목이 화면 제목으로 선다. 글은 ① 눌러 온 글(목록·홈·글쓰기가 싣는다 — 보고 있는 동안 들어온 새 글은
 * 처음 목록에 없다) ② 처음 목록 ③ 주소로 바로 열었고 목록에 없으면 글 하나 받기(`loadCommunityPost` — 지금은 예시 글에서 찾는다) 순으로 찾는다.
 * 같은 웹소켓을 들어 공감·댓글 수가 바뀌면 따라가고, 보는 사이 지워지면 "지워진 글"로 바꾼다.
 * 댓글은 서버에 경로가 없어 수와 자리만 있다(공감도 누르는 단추를 두지 않는다).
 * 글의 종목은 먹 선 바로 아래 첫 줄이다 — 이름 · 그날 등락률 / 기준일 | ›, 줄 어디를 눌러도 그 종목 상세(2026-11-04 다듬기: 쓴 사람 줄과 같은 꼴로
 * 겹쳐 서 있던 것을 가는 선으로 가른 이동 줄로). 그 아래 쓴 사람 → 본문
 */
export default function CommunityPostPage() {
  const { postId: param = '' } = useParams()
  const postId = /^\d{1,9}$/.test(param) ? Number(param) : null
  const carried = useCommunityHandoff()
  // 렌더마다 새 값을 넘기면 다시 연결한다 — 한 번 읽은 값(useCommunityHandoff)을 그대로 넘긴다
  const [seed] = useState(() => (carried !== null && carried.postId === postId ? carried : null))
  const { posts, status } = useCommunityFeed(seed)
  const quotes = useStockQuotes()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  /** 목록에서 한 번 본 글. 그 뒤 목록에서 빠지면 지워진 것이다(POST_DELETED) */
  const [seenId, setSeenId] = useState<number | null>(null)
  const now = Date.now()

  const inList = postId === null || posts === null ? null : (posts.find((post) => post.postId === postId) ?? null)
  const listReady = posts !== null
  // 주소가 글 번호가 아니면(postId null) 본 적도 없다 — seenId도 null이라 견주면 "지워진 글"이 됐다
  const deleted = postId !== null && listReady && inList === null && seenId === postId
  const fetched = loaded !== null && loaded.postId === postId ? loaded.post : undefined
  /** undefined: 아직 모름(불러오는 중), null: 없는 글 */
  const post = postId === null ? null : (inList ?? (deleted ? null : fetched))

  useEffect(() => {
    if (inList !== null) setSeenId(inList.postId)
  }, [inList])

  // 목록에 없으면 글 하나를 따로 받는다(주소로 바로 연 예시 새 글). 지워진 글은 다시 받지 않는다
  useEffect(() => {
    if (postId === null || !listReady || inList !== null || seenId === postId) return
    let isStale = false
    loadCommunityPost(postId).then((found) => {
      if (!isStale) setLoaded({ postId, post: found })
    })
    return () => {
      isStale = true
    }
  }, [postId, listReady, inList, seenId])

  useDocumentTitle(post?.title ?? '커뮤니티 글')

  const quote = post?.stockCode != null ? quotes.get(post.stockCode) : undefined
  const fluctuate = quote?.fluctuate ?? null
  const asOf = fluctuate !== null && quote !== undefined ? toKoreanDate(quote.baseDate) : ''

  return (
    <>
      {/* 종목 상세 "‹ 홈으로 돌아가기"와 같은 모양 */}
      <Link to="/community" className={styles.back}>
        <span aria-hidden="true">‹</span> 커뮤니티로 돌아가기
      </Link>
      <h1 id="community-post-title" className={styles.title}>
        {post === undefined ? '커뮤니티 글' : post === null ? (deleted ? '지워진 글' : '글을 찾을 수 없어요') : (post.title ?? '커뮤니티 글')}
      </h1>

      <div className={layout.layout}>
        <article className={layout.main} aria-labelledby="community-post-title">
          {post === undefined ? (
            <p className={styles.message}>
              <Spinner size={16} /> 글을 불러오는 중…
            </p>
          ) : post === null ? (
            <div className={styles.missing}>
              <p>{deleted ? '쓴 사람이 이 글을 지웠어요.' : '지워졌거나 주소가 틀린 글이에요.'}</p>
              <Link to="/community" className={styles.toList}>
                커뮤니티 글 목록으로
              </Link>
            </div>
          ) : (
            <>
              {post.stockCode !== null && post.stockName !== null && (
                // 링크 이름은 종목 이름만 — ::after가 줄을 덮어 줄 어디를 눌러도 간다(글 줄과 같은 방식). 이름을 싣고 간다
                <div className={styles.stock}>
                  <span className={styles.stockBadge} aria-hidden="true">
                    {Array.from(post.stockName)[0] ?? ''}
                  </span>
                  <p className={styles.stockMain}>
                    <Link
                      to={`/stocks/${post.stockCode}`}
                      state={toPreviewState({ stockCode: post.stockCode, stockName: post.stockName })}
                      className={styles.stockLink}
                    >
                      {post.stockName}
                    </Link>
                    {fluctuate !== null && (
                      <>
                        {' '}
                        <span className={styles[rateTone(fluctuate)]}>{formatChangeRate(fluctuate)}</span>
                      </>
                    )}
                  </p>
                  {asOf !== '' && <p className={styles.asOf}>{asOf} 종가 기준</p>}
                  <ChevronIcon />
                </div>
              )}
              <p className={styles.author}>
                <span className={styles.avatar} aria-hidden="true">
                  {Array.from(post.author)[0] ?? ''}
                </span>
                <strong>{post.author}</strong> <time dateTime={post.createdAt}>{timeAgo(Date.parse(post.createdAt), now)}</time>
              </p>
              <p className={styles.content}>{post.content}</p>
              {post.imageUrls.length > 0 && (
                <div className={styles.images}>
                  {post.imageUrls.map((url, index) => (
                    <img key={url} src={url} alt={`글에 붙은 사진 ${index + 1}`} loading="lazy" className={styles.image} />
                  ))}
                </div>
              )}
              <div className={styles.counts}>
                <PostCounts post={post} />
              </div>

              <section className={styles.comments} aria-labelledby="community-comments-title">
                <div className={styles.commentsHead}>
                  <h2 id="community-comments-title" className={styles.commentsTitle}>
                    댓글 {post.commentCount}
                  </h2>
                </div>
                <p className={styles.commentsNote}>
                  {status === 'mock'
                    ? '지금 보이는 글은 예시라 댓글이 없어요. 커뮤니티 서버가 열리면 댓글을 읽고 쓸 수 있어요.'
                    : '댓글 읽기·쓰기는 준비 중이에요.'}
                </p>
              </section>
            </>
          )}
        </article>

        <CommunitySide status={status} className={layout.side} />
      </div>
    </>
  )
}

function ChevronIcon() {
  return (
    <svg className={styles.chevron} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
