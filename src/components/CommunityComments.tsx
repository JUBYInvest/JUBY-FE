import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  COMMUNITY_LIMITS,
  createComment,
  deleteComment,
  getComments,
  needsNickname,
  toggleCommentLike,
  updateComment,
  type CommunityComment,
  type PageCursor,
} from '../api/community'
import { ApiError } from '../api/client'
import HeartIcon from './HeartIcon'
import { PostByline } from './CommunityPosts'
import Spinner from './Spinner'
import { loginPathFrom } from '../utils/navigation'
import styles from './CommunityComments.module.css'

interface Props {
  postId: number
  /** 화면 머리에 적는 댓글 수(글 응답 값) */
  count: number
  loggedIn: boolean
  /** 쓰기 전 로그인·닉네임 확인(useWriteGate) */
  ensure: (next: () => void) => void
  /** 서버가 닉네임 없음(403)을 줬을 때 닉네임 창을 열고, 저장하면 다시 해 볼 일 */
  nicknameNow: (next: () => void) => void
  requireLogin: (next: () => void) => void
  /** 댓글을 쓰거나 지웠다 — 글을 다시 받아 수를 맞춘다 */
  onChanged: () => void
}

type ListState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: CommunityComment[]; next: PageCursor | null; more: boolean }

/**
 * 댓글(한 단계, 오래된 순). 보기도 로그인이 필요해 비로그인은 부르지 않고 "로그인하고 댓글 보기"를 둔다(수는 글 응답에 있어 보인다).
 * 쓰기는 닉네임까지 있어야 한다. 내 댓글은 고치고 지울 수 있고, 좋아요는 누를 때마다 서버가 준 상태로 바꾼다
 */
export default function CommunityComments({ postId, count, loggedIn, ensure, nicknameNow, requireLogin, onChanged }: Props) {
  const { pathname } = useLocation()
  const [list, setList] = useState<ListState>({ kind: 'loading' })
  const [turn, setTurn] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  /** 좋아요를 보내는 중인 댓글 — 연타를 막는다 */
  const liking = useRef(new Set<number>())
  /** 오는 중인 올리기('send')·고치기·지우기('edit:번호'·'remove:번호'). 상태는 다음 그림까지 안 바뀌어 연타가 두 번 보낸다 — ref로 막는다 */
  const working = useRef(new Set<string>())
  const now = Date.now()

  useEffect(() => {
    if (!loggedIn) return
    let isStale = false
    setList({ kind: 'loading' })
    getComments(postId)
      .then((page) => {
        if (!isStale) setList({ kind: 'ready', items: page.items, next: page.next, more: false })
      })
      .catch((error: unknown) => {
        console.warn('댓글을 받지 못했습니다', error)
        if (!isStale) setList({ kind: 'error' })
      })
    return () => {
      isStale = true
    }
  }, [postId, loggedIn, turn])

  const replace = (comment: CommunityComment) =>
    setList((current) => (current.kind === 'ready' ? { ...current, items: current.items.map((item) => (item.commentId === comment.commentId ? comment : item)) } : current))

  const loadMore = () => {
    if (list.kind !== 'ready' || list.next === null || list.more || !('cursor' in list.next)) return
    setList({ ...list, more: true })
    getComments(postId, list.next.cursor)
      .then((page) =>
        setList((current) =>
          current.kind === 'ready'
            ? { kind: 'ready', items: [...current.items, ...page.items.filter((item) => !current.items.some((shown) => shown.commentId === item.commentId))], next: page.next, more: false }
            : current,
        ),
      )
      .catch((error: unknown) => {
        console.warn('댓글을 더 받지 못했습니다', error)
        setList((current) => (current.kind === 'ready' ? { ...current, more: false } : current))
        setNotice('댓글을 더 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
  }

  const send = () => {
    const content = draft.trim()
    if (content === '' || working.current.has('send')) return
    working.current.add('send')
    setSending(true)
    setNotice('')
    createComment(postId, content)
      .then((created) => {
        setDraft('')
        setList((current) => (current.kind === 'ready' && current.next === null ? { ...current, items: [...current.items, created] } : current))
        onChanged()
      })
      .catch((error: unknown) => {
        console.warn('댓글을 올리지 못했습니다', error)
        if (needsNickname(error)) nicknameNow(send)
        else if (error instanceof ApiError && error.code === 'COMMUNITY404_1') setNotice('삭제된 게시물이에요.')
        else setNotice('댓글을 올리지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
      .finally(() => {
        working.current.delete('send')
        setSending(false)
      })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    ensure(send)
  }

  const saveEdit = () => {
    if (editing === null) return
    const content = editing.text.trim()
    const key = `edit:${editing.id}`
    if (content === '' || working.current.has(key)) return
    working.current.add(key)
    updateComment(editing.id, content)
      .then((updated) => {
        replace(updated)
        setEditing(null)
      })
      .catch((error: unknown) => {
        console.warn('댓글을 고치지 못했습니다', error)
        if (error instanceof ApiError && error.code === 'COMMUNITY404_2') setTurn((value) => value + 1)
        setNotice('댓글을 고치지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
      .finally(() => working.current.delete(key))
  }

  const remove = (commentId: number) => {
    const key = `remove:${commentId}`
    if (working.current.has(key) || !window.confirm('이 댓글을 지울까요?')) return
    working.current.add(key)
    deleteComment(commentId)
      .then(() => {
        setList((current) => (current.kind === 'ready' ? { ...current, items: current.items.filter((item) => item.commentId !== commentId) } : current))
        onChanged()
      })
      .catch((error: unknown) => {
        console.warn('댓글을 지우지 못했습니다', error)
        if (error instanceof ApiError && error.code === 'COMMUNITY404_2') setTurn((value) => value + 1)
        else setNotice('댓글을 지우지 못했어요. 잠시 후 다시 시도해 주세요.')
      })
      .finally(() => working.current.delete(key))
  }

  const like = (comment: CommunityComment) =>
    requireLogin(() => {
      if (liking.current.has(comment.commentId)) return
      liking.current.add(comment.commentId)
      toggleCommentLike(comment.commentId)
        // 누른 때의 댓글이 아니라 지금 댓글에 좋아요만 얹는다 — 그사이 고친 내용을 되돌리지 않게
        .then((state) =>
          setList((current) =>
            current.kind === 'ready'
              ? { ...current, items: current.items.map((item) => (item.commentId === comment.commentId ? { ...item, likedByMe: state.liked, likeCount: state.likeCount } : item)) }
              : current,
          ),
        )
        .catch((error: unknown) => {
          console.warn('댓글 좋아요를 반영하지 못했습니다', error)
          setNotice('좋아요를 반영하지 못했어요. 잠시 후 다시 시도해 주세요.')
        })
        .finally(() => liking.current.delete(comment.commentId))
    })

  return (
    <section className={styles.comments} aria-labelledby="community-comments-title">
      <div className={styles.head}>
        <h2 id="community-comments-title" className={styles.title}>
          댓글 {count}
        </h2>
      </div>

      {!loggedIn ? (
        <div className={styles.locked}>
          <p>댓글은 로그인하면 볼 수 있어요.</p>
          <Link to={loginPathFrom(pathname)} className={styles.loginLink}>
            로그인하고 댓글 보기
          </Link>
        </div>
      ) : (
        <>
          {list.kind === 'loading' ? (
            <p className={styles.message}>
              <Spinner size={16} /> 댓글을 불러오는 중…
            </p>
          ) : list.kind === 'error' ? (
            <div className={styles.message}>
              <p>댓글을 불러오지 못했어요.</p>
              <button type="button" className={styles.secondary} onClick={() => setTurn((value) => value + 1)}>
                다시 시도
              </button>
            </div>
          ) : list.items.length === 0 ? (
            <p className={styles.message}>아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
          ) : (
            <ol className={styles.list}>
              {list.items.map((comment) => (
                <li key={comment.commentId} className={styles.comment}>
                  <p className={styles.meta}>
                    <PostByline author={comment.author} createdAt={comment.createdAt} edited={comment.isEdited} now={now} />
                  </p>
                  {editing?.id === comment.commentId ? (
                    <div className={styles.editBox}>
                      <label className={styles.srOnly} htmlFor={`comment-edit-${comment.commentId}`}>
                        댓글 고치기
                      </label>
                      <textarea
                        id={`comment-edit-${comment.commentId}`}
                        className={styles.textarea}
                        rows={3}
                        maxLength={COMMUNITY_LIMITS.comment}
                        value={editing.text}
                        onChange={(event) => setEditing({ id: comment.commentId, text: event.target.value })}
                      />
                      <div className={styles.rowActions}>
                        <button type="button" className={styles.secondary} onClick={() => setEditing(null)}>
                          취소
                        </button>
                        <button type="button" className={styles.primary} onClick={saveEdit} disabled={editing.text.trim() === ''}>
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.content}>{comment.content}</p>
                  )}
                  <div className={styles.foot}>
                    <button
                      type="button"
                      className={comment.likedByMe ? styles.likeOn : styles.like}
                      aria-pressed={comment.likedByMe}
                      aria-label={`좋아요 ${comment.likeCount}`}
                      onClick={() => like(comment)}
                    >
                      <HeartIcon filled={comment.likedByMe} />
                      {comment.likeCount}
                    </button>
                    {comment.isMine && editing?.id !== comment.commentId && (
                      <span className={styles.mine}>
                        <button type="button" className={styles.textAction} onClick={() => setEditing({ id: comment.commentId, text: comment.content })}>
                          수정
                        </button>
                        <button type="button" className={styles.textAction} onClick={() => remove(comment.commentId)}>
                          삭제
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {list.kind === 'ready' && list.next !== null && (
            <button type="button" className={styles.more} onClick={loadMore} disabled={list.more}>
              {list.more ? '불러오는 중…' : '댓글 더 보기'}
            </button>
          )}

          <form className={styles.composer} onSubmit={submit}>
            <label className={styles.srOnly} htmlFor="community-comment-input">
              댓글
            </label>
            <textarea
              id="community-comment-input"
              className={styles.textarea}
              rows={2}
              maxLength={COMMUNITY_LIMITS.comment}
              value={draft}
              placeholder="댓글을 남겨 보세요"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className={styles.primary} disabled={sending || draft.trim() === ''}>
              {sending ? '올리는 중…' : '올리기'}
            </button>
          </form>
        </>
      )}

      <p className={styles.notice} role="status">
        {notice}
      </p>
    </section>
  )
}
