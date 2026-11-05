import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { COMMUNITY_LIMITS, createPost, getPost, needsNickname, updatePost } from '../api/community'
import { getMemberInfo } from '../api/member'
import { STOCK_LIST } from '../api/stockList'
import NicknameModal from '../components/NicknameModal'
import SearchBar from '../components/SearchBar'
import Spinner from '../components/Spinner'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useCommunityWriteHandoff } from '../hooks/useStockHandoff'
import { loginPathFrom } from '../utils/navigation'
import type { StockInfo } from '../types/stock'
import styles from './CommunityWritePage.module.css'

/** 고칠 글을 받는 중 · 고칠 수 없음(남의 글·지운 글·못 받음) · 쓸 수 있음 */
type EditState = { kind: 'loading' } | { kind: 'blocked'; message: string } | { kind: 'ready' }

/**
 * 커뮤니티 글쓰기(`/community/write`)와 고치기(`/community/{postId}/edit`) — 종목(고르지 않아도 된다, 고칠 때는 바꿀 수 없다) · 제목 · 내용.
 * 로그인했고 닉네임이 있어야 쓴다. 닉네임이 없으면 들어오자마자 닉네임 창을 띄우고, 올릴 때 서버가 403(닉네임 없음)을 주면 다시 띄운다.
 * 올리면 그 글 상세로 간다(주소 기록을 바꿔 넣어 뒤로 가면 목록)
 */
export default function CommunityWritePage() {
  const { postId: param } = useParams()
  const editId = param !== undefined && /^\d{1,9}$/.test(param) ? Number(param) : null
  const editing = param !== undefined
  useDocumentTitle(editing ? '글 고치기' : '글쓰기')
  const carried = useCommunityWriteHandoff()
  const loggedIn = useIsLoggedIn()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [stock, setStock] = useState<StockInfo | null>(carried)
  const [picking, setPicking] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [nicknameOpen, setNicknameOpen] = useState(false)
  const [edit, setEdit] = useState<EditState>(editing ? { kind: 'loading' } : { kind: 'ready' })

  // 새 글: 닉네임이 없으면 먼저 정하게 한다(못 받으면 그냥 둔다 — 올릴 때 서버가 알려 준다)
  useEffect(() => {
    if (editing || !loggedIn) return
    let isStale = false
    getMemberInfo()
      .then((member) => {
        if (!isStale && member.nickname === null) setNicknameOpen(true)
      })
      .catch(() => {})
    return () => {
      isStale = true
    }
  }, [editing, loggedIn])

  // 고치기: 글을 받아 칸을 채운다. 내 글이 아니면 막는다
  useEffect(() => {
    if (!editing) return
    if (editId === null) {
      setEdit({ kind: 'blocked', message: '주소가 틀린 글이에요.' })
      return
    }
    if (!loggedIn) return
    let isStale = false
    getPost(editId)
      .then((post) => {
        if (isStale) return
        if (post === null) return setEdit({ kind: 'blocked', message: '삭제된 게시물이에요.' })
        if (!post.isMine) return setEdit({ kind: 'blocked', message: '내가 쓴 글만 고칠 수 있어요.' })
        setTitle(post.title)
        setContent(post.content)
        setStock(post.stockCode !== null && post.stockName !== null ? { stockCode: post.stockCode, stockName: post.stockName } : null)
        setEdit({ kind: 'ready' })
      })
      .catch((caught: unknown) => {
        console.warn('고칠 글을 받지 못했습니다', caught)
        if (!isStale) setEdit({ kind: 'blocked', message: '글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' })
      })
    return () => {
      isStale = true
    }
  }, [editing, editId, loggedIn])

  const editable = loggedIn && edit.kind === 'ready' && !sending
  const ready = editable && title.trim() !== '' && content.trim() !== ''

  const send = async () => {
    setSending(true)
    setError('')
    const draft = { title: title.trim(), content: content.trim() }
    try {
      const saved = editId !== null ? await updatePost(editId, draft) : await createPost({ ...draft, stockCode: stock?.stockCode ?? null })
      navigate(`/community/${saved.postId}`, { replace: true })
    } catch (caught: unknown) {
      console.warn('글을 올리지 못했습니다', caught)
      if (needsNickname(caught)) setNicknameOpen(true)
      else if (caught instanceof ApiError && caught.code === 'STOCK404_1') setError('없는 종목이에요. 종목을 다시 골라 주세요.')
      else if (caught instanceof ApiError && caught.code === 'COMMUNITY404_1') setError('삭제된 게시물이에요.')
      else if (caught instanceof ApiError && caught.status === 400) setError('제목은 1~40자, 내용은 1~1,000자로 적어 주세요.')
      else setError('올리지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (ready) void send()
  }

  const pickStock = (picked: StockInfo) => {
    setStock(picked)
    setPicking(false)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{editing ? '글 고치기' : '글쓰기'}</h1>

      {!loggedIn ? (
        <p className={styles.notice}>
          로그인하면 글을 쓸 수 있어요.{' '}
          <Link to={loginPathFrom(pathname)} className={styles.noticeLink}>
            로그인하기
          </Link>
        </p>
      ) : edit.kind === 'loading' ? (
        <p className={styles.notice}>
          <Spinner size={14} /> 고칠 글을 불러오는 중…
        </p>
      ) : edit.kind === 'blocked' ? (
        <p className={styles.notice}>
          {edit.message}{' '}
          <Link to="/community" className={styles.noticeLink}>
            커뮤니티로
          </Link>
        </p>
      ) : null}

      <form className={styles.form} onSubmit={submit}>
        {/* 잠기면 안의 칸·단추가 한꺼번에 잠긴다 */}
        <fieldset className={styles.fields} disabled={!editable}>
          <legend className={styles.srOnly}>쓸 글</legend>

          <div className={styles.field}>
            <span className={styles.label} id="community-write-stock">
              종목 {!editing && <span className={styles.optional}>(고르지 않아도 돼요)</span>}
            </span>
            {editing ? (
              <p className={styles.stockChosen}>{stock !== null ? <><strong>{stock.stockName}</strong> 이야기 · 종목은 바꿀 수 없어요</> : '종목 없이 쓴 글이에요'}</p>
            ) : stock !== null ? (
              <p className={styles.stockChosen}>
                <strong>{stock.stockName}</strong> 이야기
                <button type="button" className={styles.textAction} onClick={() => setStock(null)}>
                  빼기
                </button>
              </p>
            ) : picking ? (
              <SearchBar stocks={STOCK_LIST} onPick={pickStock} onDismiss={() => setPicking(false)} autoFocus placeholder="이야기할 종목 (예: 삼성전자)" />
            ) : (
              <button type="button" className={styles.pick} aria-describedby="community-write-stock" onClick={() => setPicking(true)}>
                종목 고르기
              </button>
            )}
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="community-write-title">
                제목
              </label>
              <span className={styles.counter} aria-hidden="true">
                {Array.from(title).length}/{COMMUNITY_LIMITS.title}
              </span>
            </div>
            <input
              id="community-write-title"
              className={styles.input}
              type="text"
              maxLength={COMMUNITY_LIMITS.title}
              value={title}
              placeholder="무엇에 대한 글인지 한 줄로"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.labelRow}>
              <label className={styles.label} htmlFor="community-write-content">
                내용
              </label>
              <span className={styles.counter} aria-hidden="true">
                {Array.from(content).length}/{COMMUNITY_LIMITS.content}
              </span>
            </div>
            <textarea
              id="community-write-content"
              className={styles.textarea}
              rows={10}
              maxLength={COMMUNITY_LIMITS.content}
              value={content}
              placeholder="배운 것, 궁금한 것을 나눠 보세요. 종목을 사라·팔라 권하는 글은 올리지 않아요."
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        </fieldset>

        {error !== '' && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Link to={editId !== null ? `/community/${editId}` : '/community'} className={styles.cancel}>
            취소
          </Link>
          <button type="submit" className={styles.submit} disabled={!ready}>
            {sending ? '올리는 중…' : editing ? '고치기' : '올리기'}
          </button>
        </div>
      </form>

      <NicknameModal
        isOpen={nicknameOpen}
        onClose={() => setNicknameOpen(false)}
        onSaved={() => setNicknameOpen(false)}
      />
    </div>
  )
}
