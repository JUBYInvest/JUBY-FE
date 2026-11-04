import { Link } from 'react-router-dom'
import type { CommunityPost } from '../api/community'
import type { StockQuote } from '../hooks/useStockQuotes'
import { toCommunityHandoff } from '../hooks/useStockHandoff'
import { timeAgo } from '../utils/date'
import { formatChangeRate, rateTone } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import HeartIcon from './HeartIcon'
import styles from './CommunityPosts.module.css'

interface Props {
  posts: CommunityPost[]
  /** 홈 오른쪽 칸: 첫 글자 동그라미 + 별명 줄, 제목·본문 한 줄씩. 커뮤니티 화면은 종목 줄·제목·본문 두 줄·사진 */
  compact?: boolean
  /** 종목별 그날 등락률(useStockQuotes). 커뮤니티 화면만 넘긴다 */
  quotes?: Map<string, StockQuote>
  now: number
}

/**
 * 커뮤니티 글 줄(2026-11-03 "토스증권처럼 게시판으로", 2026-11-04 사용자가 토스증권 앱 캡처로 "커뮤니티 글쓰기 개념"을 짚어 제목 + 본문 + 사진이 됐다).
 * 카드 없이 가는 선으로 나눈 글 줄이다 — 커뮤니티 화면은 종목 줄(첫 글자 동그라미 · 이름 · 그날 등락률) → 굵은 제목 → 본문 두 줄(+ 오른쪽 사진) →
 * 공감·댓글 수 | 별명 · 몇 분 전. 줄 어디를 눌러도 글 상세(`/community/{postId}`)로 간다 — 제목 링크의 ::after가 줄을 덮는다(홈 시세표와 같은 방식,
 * 줄을 통째로 <a>로 싸면 별명·공감 수까지 링크 이름이 된다). 그래서 줄 안에 따로 눌리는 것을 두지 않는다 — 종목 상세 링크는 글 상세에 있다
 * (11-03 홈에서 두 줄로 자른 글 안의 17px 종목 링크가 휴대폰에서 조금만 빗나가도 다른 곳으로 갔다, common 4·ui U2-3).
 * 글을 싣고 간다(toCommunityHandoff) — 보고 있는 동안 들어온 새 글은 글 상세가 따로 받는 처음 목록에 없다.
 * 공감·댓글은 아직 서버가 없어 수만 보인다(누르는 단추를 두지 않는다). 여백으로 띄운 자리에도 글자 빈칸을 둔다 — 없으면 읽어 주는 쪽·복사한 글이 붙는다.
 */
export default function CommunityPosts({ posts, compact = false, quotes, now }: Props) {
  return (
    <ol className={compact ? styles.listCompact : styles.list}>
      {posts.map((post) => {
        const image = post.imageUrls[0]
        const author = (
          <>
            <strong>{post.author}</strong> <time dateTime={post.createdAt}>{timeAgo(Date.parse(post.createdAt), now)}</time>
          </>
        )
        const link = (
          <Link to={`/community/${post.postId}`} state={toCommunityHandoff(post)} className={styles.postLink}>
            {post.title ?? post.content}
          </Link>
        )

        if (compact) {
          return (
            <li key={post.postId} className={styles.post}>
              <span className={styles.avatar} aria-hidden="true">
                {Array.from(post.author)[0] ?? ''}
              </span>
              <div className={styles.body}>
                <p className={styles.meta}>{author}</p>
                <h3 className={styles.titleCompact}>{link}</h3>
                {/* 홈에서 종목 이름은 링크가 아니라 글자다(위 주석) */}
                <p className={styles.textCompact}>
                  {post.stockName !== null && (
                    <>
                      <strong className={styles.stockText}>{post.stockName}</strong>{' '}
                    </>
                  )}
                  {post.title !== null && post.content}
                </p>
              </div>
            </li>
          )
        }

        return (
          <li key={post.postId} className={styles.post}>
            {post.stockCode !== null && post.stockName !== null && (
              <PostStock code={post.stockCode} name={post.stockName} quote={quotes?.get(post.stockCode)} />
            )}
            <div className={image === undefined ? styles.main : styles.mainWithImage}>
              <h3 className={styles.title}>{link}</h3>
              {post.title !== null && <p className={styles.text}>{post.content}</p>}
              {/* 목록의 사진은 미리보기라 이름을 따로 읽히지 않는다 — 글 상세가 사진마다 이름을 단다. 몇 장인지는 아래 수 줄에 적는다 */}
              {image !== undefined && <img className={styles.thumb} src={image} alt="" loading="lazy" />}
            </div>
            <div className={styles.foot}>
              <PostCounts post={post} />
              <p className={styles.metaRight}>{author}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

interface PostStockProps {
  code: string
  name: string
  quote: StockQuote | undefined
  /** 글 상세: 종목 이름이 그 종목 상세로 가는 링크(이름을 싣고 간다). 글 줄은 줄 전체가 글 링크라 글자 */
  linked?: boolean
}

/** 글 머리 종목 줄 — 첫 글자 동그라미 · 이름 · 그날 등락률(등락색 글자, 홈 시세표와 같은 값). 등락률을 모르면 이름만 */
export function PostStock({ code, name, quote, linked = false }: PostStockProps) {
  return (
    <p className={styles.stockRow}>
      <span className={styles.stockBadge} aria-hidden="true">
        {Array.from(name)[0] ?? ''}
      </span>
      {linked ? (
        <Link to={`/stocks/${code}`} state={toPreviewState({ stockCode: code, stockName: name })} className={styles.stockLink}>
          {name}
        </Link>
      ) : (
        <span className={styles.stockName}>{name}</span>
      )}
      {quote !== undefined && quote.fluctuate !== null && (
        <>
          {' '}
          <span className={styles[rateTone(quote.fluctuate)]}>{formatChangeRate(quote.fluctuate)}</span>
        </>
      )}
    </p>
  )
}

/** 공감·댓글 수(+ 사진 장수는 읽어 주는 쪽에만). 서버가 없어 누르는 단추가 아니다 */
export function PostCounts({ post }: { post: CommunityPost }) {
  return (
    <p className={styles.counts}>
      <span>
        <HeartIcon filled={false} />
        <span className={styles.srOnly}>공감 </span>
        {post.likeCount}
      </span>{' '}
      <span>
        <CommentIcon />
        <span className={styles.srOnly}>댓글 </span>
        {post.commentCount}
      </span>
      {post.imageUrls.length > 0 && <span className={styles.srOnly}> 사진 {post.imageUrls.length}장</span>}
    </p>
  )
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 18.5V6.8A2.3 2.3 0 0 1 6.8 4.5h10.4a2.3 2.3 0 0 1 2.3 2.3v7.4a2.3 2.3 0 0 1-2.3 2.3H8.6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
