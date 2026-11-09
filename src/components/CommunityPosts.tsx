import { Link } from 'react-router-dom'
import type { PostSummary } from '../api/community'
import { toCommunityHandoff } from '../hooks/useStockHandoff'
import { timeAgo } from '../utils/date'
import { formatChangeRate, rateTone } from '../utils/format'
import HeartIcon from './HeartIcon'
import styles from './CommunityPosts.module.css'

interface Props {
  posts: PostSummary[]
  now: number
}

/**
 * 커뮤니티 글 줄 — 종목 줄(종목·등락률) · 제목 · 미리보기 · 좋아요·댓글 수 · 쓴 사람·시각.
 * 줄 어디를 눌러도 글 상세로 간다(제목 링크의 ::after가 줄을 덮는다 — a11y rowLink). 그래서 줄 안에 따로 눌리는 것을 두지 않는다.
 * 글을 싣고 간다 — 상세 응답에는 등락률이 없다
 */
export default function CommunityPosts({ posts, now }: Props) {
  return (
    <ol className={styles.list}>
      {posts.map((post) => (
        <li key={post.postId} className={styles.post}>
          {post.stockCode !== null && post.stockName !== null && <PostStock name={post.stockName} changeRate={post.changeRate} />}
          <div className={styles.main}>
            <h3 className={styles.title}>
              <Link to={`/community/${post.postId}`} state={toCommunityHandoff(post)} className={styles.postLink}>
                {post.title}
              </Link>
            </h3>
            {post.preview !== '' && <p className={styles.text}>{post.preview}</p>}
          </div>
          <div className={styles.foot}>
            <PostCounts likeCount={post.likeCount} liked={post.likedByMe} commentCount={post.commentCount} />
            <p className={styles.metaRight}>
              <PostByline author={post.author} createdAt={post.createdAt} edited={post.isEdited} now={now} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** 쓴 사람 · "N분 전" · 수정됨 */
export function PostByline({ author, createdAt, edited, now }: { author: string; createdAt: string; edited: boolean; now: number }) {
  return (
    <>
      <strong>{author}</strong> {createdAt !== '' && <time dateTime={createdAt}>{timeAgo(Date.parse(createdAt), now)}</time>}
      {edited && <span className={styles.edited}> · 수정됨</span>}
    </>
  )
}

/** 글 머리 종목 줄 — 이름 · 등락률(모르면 이름만) */
function PostStock({ name, changeRate }: { name: string; changeRate: number | null }) {
  return (
    <p className={styles.stockRow}>
      <span className={styles.stockName}>{name}</span>
      {changeRate !== null && (
        <>
          {' '}
          <span className={styles[rateTone(changeRate)]}>{formatChangeRate(changeRate)}</span>
        </>
      )}
    </p>
  )
}

/** 좋아요·댓글 수. 목록에서는 누르는 단추가 아니다(좋아요는 글 상세에서) */
function PostCounts({ likeCount, liked, commentCount }: { likeCount: number; liked: boolean; commentCount: number }) {
  return (
    <p className={styles.counts}>
      <span className={liked ? styles.likedCount : undefined}>
        <HeartIcon filled={liked} />
        <span className={styles.srOnly}>{liked ? '내가 누른 좋아요 ' : '좋아요 '}</span>
        {likeCount}
      </span>{' '}
      <span>
        <CommentIcon />
        <span className={styles.srOnly}>댓글 </span>
        {commentCount}
      </span>
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
