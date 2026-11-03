import { Link } from 'react-router-dom'
import type { CommunityPost } from '../api/community'
import { timeAgo } from '../utils/date'
import { toPreviewState } from '../utils/stockPreview'
import HeartIcon from './HeartIcon'
import styles from './CommunityPosts.module.css'

interface Props {
  posts: CommunityPost[]
  /** 홈 오른쪽 칸: 글을 두 줄로 자르고 줄을 좁힌다. 커뮤니티 화면은 글 전체 */
  compact?: boolean
  now: number
}

/**
 * 커뮤니티 글 줄(2026-11-03 "토스증권처럼 게시판으로"). 카드 없이 가는 선으로 나눈 글 줄이다 — 별명 · 몇 분 전, 종목, 글, 공감·댓글 수.
 * 종목 이름은 그 종목 상세로 가는 링크(브랜드 초록 글자 — 등락색을 쓰지 않는다, 이름을 싣고 간다). 공감·댓글은 아직 서버가 없어 수만 보인다(누르는 단추를 두지 않는다).
 * 여백으로 띄운 자리(별명 | 시각, 종목 | 글)에도 글자 빈칸을 둔다 — 없으면 읽어 주는 쪽·복사한 글이 "SK하이닉스1년"처럼 붙는다
 */
export default function CommunityPosts({ posts, compact = false, now }: Props) {
  return (
    <ol className={compact ? styles.listCompact : styles.list}>
      {posts.map((post) => (
        <li key={post.postId} className={styles.post}>
          <span className={styles.avatar} aria-hidden="true">
            {Array.from(post.author)[0] ?? ''}
          </span>
          <div className={styles.body}>
            <p className={styles.meta}>
              <strong>{post.author}</strong>{' '}
              <time dateTime={post.createdAt}>{timeAgo(Date.parse(post.createdAt), now)}</time>
            </p>
            <p className={styles.text}>
              {post.stockCode !== null && post.stockName !== null && (
                <>
                  {/* 이름을 싣고 간다 — 상세가 응답을 기다리는 동안에도 탭 제목·머리에 종목 이름이 선다(홈 표·카드와 같다) */}
                  <Link
                    to={`/stocks/${post.stockCode}`}
                    state={toPreviewState({ stockCode: post.stockCode, stockName: post.stockName })}
                    className={styles.stock}
                  >
                    {post.stockName}
                  </Link>{' '}
                </>
              )}
              {post.content}
            </p>
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
            </p>
          </div>
        </li>
      ))}
    </ol>
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
