import { Link } from 'react-router-dom'
import type { CommunityPost } from '../api/community'
import type { StockQuote } from '../hooks/useStockQuotes'
import { toCommunityHandoff } from '../hooks/useStockHandoff'
import { timeAgo } from '../utils/date'
import { formatChangeRate, rateTone } from '../utils/format'
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
 * 커뮤니티 글 줄. 줄 어디를 눌러도 글 상세로 간다 — 제목 링크의 ::after가 줄을 덮는다(줄을 통째로 <a>로 싸면 별명·공감 수까지 링크 이름이 된다).
 * 그래서 줄 안에 따로 눌리는 것을 두지 않는다(휴대폰에서 작은 종목 링크가 조금만 빗나가도 다른 곳으로 갔다) — 종목 상세 링크는 글 상세에 있다.
 * 글을 싣고 간다 — 보고 있는 동안 들어온 새 글은 글 상세가 받는 처음 목록에 없다. 여백으로 띄운 자리에도 글자 빈칸을 둔다(읽어 주는 쪽·복사한 글이 붙지 않게)
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
              <PostStock name={post.stockName} quote={quotes?.get(post.stockCode)} />
            )}
            <div className={image === undefined ? styles.main : styles.mainWithImage}>
              <h3 className={styles.title}>{link}</h3>
              {post.title !== null && <p className={styles.text}>{post.content}</p>}
              {/* 미리보기라 이름을 읽히지 않는다 — 몇 장인지는 수 줄에, 이름은 글 상세에 */}
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
  name: string
  quote: StockQuote | undefined
}

/** 글 머리 종목 줄 — 첫 글자 동그라미 · 이름 · 그날 등락률(모르면 이름만) */
function PostStock({ name, quote }: PostStockProps) {
  return (
    <p className={styles.stockRow}>
      <span className={styles.stockBadge} aria-hidden="true">
        {Array.from(name)[0] ?? ''}
      </span>
      <span className={styles.stockName}>{name}</span>
      {quote !== undefined && quote.fluctuate !== null && (
        <>
          {' '}
          <span className={styles[rateTone(quote.fluctuate)]}>{formatChangeRate(quote.fluctuate)}</span>
        </>
      )}
    </p>
  )
}

/** 공감·댓글 수(사진 장수는 읽어 주는 쪽에만). 서버가 없어 누르는 단추가 아니다 */
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
