import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deletePost, getPost, togglePostLike, type PostDetail } from '../api/community'
import CommunityComments from '../components/CommunityComments'
import { PostByline } from '../components/CommunityPosts'
import CommunitySide from '../components/CommunitySide'
import layout from '../components/communityLayout.module.css'
import HeartIcon from '../components/HeartIcon'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useCommunityHandoff } from '../hooks/useStockHandoff'
import { useWriteGate } from '../hooks/useWriteGate'
import { formatChangeRate, rateTone } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import styles from './CommunityPostPage.module.css'

/** undefined: 받는 중, null: 없거나 지운 글, 'error': 못 받음 */
type Loaded = PostDetail | null | undefined | 'error'

/**
 * 커뮤니티 글 상세(`/community/{postId}`). 본문은 `GET /api/community/posts/{postId}`, 등락률은 상세 응답에 없어 목록에서 실어 온 값을 쓴다.
 * 먹 선 바로 아래 첫 줄이 글의 종목(줄 어디를 눌러도 그 종목 상세), 그 아래 쓴 사람 → 본문 → 좋아요(누르는 단추)·댓글 수 → 내 글이면 수정·삭제 → 댓글
 */
export default function CommunityPostPage() {
  const { postId: param = '' } = useParams()
  const postId = /^\d{1,9}$/.test(param) ? Number(param) : null
  const navigate = useNavigate()
  const carried = useCommunityHandoff()
  const gate = useWriteGate()
  const [post, setPost] = useState<Loaded>(postId === null ? null : undefined)
  const [turn, setTurn] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState('')
  const liking = useRef(false)
  const now = Date.now()

  const reload = useCallback(() => setTurn((value) => value + 1), [])

  useEffect(() => {
    if (postId === null) return
    let isStale = false
    getPost(postId)
      .then((found) => {
        if (!isStale) setPost(found)
      })
      .catch((error: unknown) => {
        console.warn('커뮤니티 글을 받지 못했습니다', error)
        if (!isStale) setPost((current) => (current === undefined ? 'error' : current))
      })
    return () => {
      isStale = true
    }
  }, [postId, turn])

  const shown = typeof post === 'object' ? post : null
  useDocumentTitle(shown?.title ?? '커뮤니티 글')
  // 등락률은 목록에서 실어 온 같은 글의 값(없으면 비운다)
  const changeRate = carried !== null && carried.postId === postId ? carried.changeRate : null

  const like = () =>
    gate.requireLogin(() => {
      if (shown === null || liking.current) return
      liking.current = true
      setNotice('')
      togglePostLike(shown.postId)
        .then((state) => setPost((current) => (typeof current === 'object' && current !== null ? { ...current, likedByMe: state.liked, likeCount: state.likeCount } : current)))
        .catch((error: unknown) => {
          console.warn('좋아요를 반영하지 못했습니다', error)
          setNotice('좋아요를 반영하지 못했어요. 잠시 후 다시 시도해 주세요.')
        })
        .finally(() => {
          liking.current = false
        })
    })

  const remove = () => {
    if (shown === null) return
    deletePost(shown.postId)
      .then(() => navigate('/community', { replace: true }))
      .catch((error: unknown) => {
        console.warn('글을 지우지 못했습니다', error)
        setConfirmDelete(false)
        setNotice('글을 지우지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
  }

  return (
    <>
      {/* 종목 상세 "‹ 홈으로 돌아가기"와 같은 모양 */}
      <Link to="/community" className={styles.back}>
        <span aria-hidden="true">‹</span> 커뮤니티로 돌아가기
      </Link>
      <h1 id="community-post-title" className={styles.title}>
        {shown !== null ? shown.title : post === null ? '삭제된 게시물이에요' : (carried?.title ?? '커뮤니티 글')}
      </h1>

      <div className={layout.layout}>
        <article className={layout.main} aria-labelledby="community-post-title">
          {post === undefined ? (
            <p className={styles.message}>
              <Spinner size={16} /> 글을 불러오는 중…
            </p>
          ) : post === 'error' ? (
            <div className={styles.missing}>
              <p>글을 불러오지 못했어요.</p>
              <button type="button" className={styles.retry} onClick={reload}>
                다시 시도
              </button>
            </div>
          ) : post === null ? (
            <div className={styles.missing}>
              <p>지워졌거나 주소가 틀린 글이에요.</p>
              <Link to="/community" className={styles.toList}>
                커뮤니티 글 목록으로
              </Link>
            </div>
          ) : (
            <>
              {post.stockCode !== null && post.stockName !== null && (
                // 링크 이름은 종목 이름만 — ::after가 줄을 덮는다
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
                    {changeRate !== null && (
                      <>
                        {' '}
                        <span className={styles[rateTone(changeRate)]}>{formatChangeRate(changeRate)}</span>
                      </>
                    )}
                  </p>
                  <ChevronIcon />
                </div>
              )}
              <p className={styles.author}>
                <span className={styles.avatar} aria-hidden="true">
                  {Array.from(post.author)[0] ?? ''}
                </span>
                <PostByline author={post.author} createdAt={post.createdAt} edited={post.isEdited} now={now} />
              </p>
              <p className={styles.content}>{post.content}</p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={post.likedByMe ? styles.likeOn : styles.like}
                  aria-pressed={post.likedByMe}
                  onClick={like}
                >
                  <HeartIcon filled={post.likedByMe} />
                  좋아요 {post.likeCount}
                </button>
                <span className={styles.commentCount}>댓글 {post.commentCount}</span>
                {post.isMine && (
                  <span className={styles.mine}>
                    <Link to={`/community/${post.postId}/edit`} className={styles.textAction}>
                      수정
                    </Link>
                    <button type="button" className={styles.textAction} onClick={() => setConfirmDelete(true)}>
                      삭제
                    </button>
                  </span>
                )}
              </div>
              <p className={styles.notice} role="status">
                {notice}
              </p>

              <CommunityComments
                postId={post.postId}
                count={post.commentCount}
                loggedIn={gate.loggedIn}
                ensure={gate.ensure}
                nicknameNow={gate.nicknameNow}
                requireLogin={gate.requireLogin}
                onChanged={reload}
              />
            </>
          )}
        </article>

        <CommunitySide className={layout.side} />
      </div>

      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} label="글 지우기">
        <p className={styles.modalTitle}>이 글을 지울까요?</p>
        <p className={styles.modalText}>지우면 댓글도 함께 사라지고 되돌릴 수 없어요.</p>
        <div className={styles.modalButtons}>
          <button type="button" className={styles.danger} onClick={remove}>
            지우기
          </button>
          <button type="button" className={styles.cancel} onClick={() => setConfirmDelete(false)}>
            취소
          </button>
        </div>
      </Modal>
      {gate.modals}
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
