import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { COMMUNITY_LIMITS, type CommunityDraft } from '../api/community'
import { STOCK_LIST } from '../api/stockList'
import SearchBar from '../components/SearchBar'
import Spinner from '../components/Spinner'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { toCommunityHandoff, useCommunityWriteHandoff } from '../hooks/useStockHandoff'
import { loginPathFrom } from '../utils/navigation'
import type { StockInfo } from '../types/stock'
import styles from './CommunityWritePage.module.css'

/** 보낸 뒤 서버가 내 글을 되돌려 주기(POST_CREATED)를 기다리는 시간. 넘으면 목록으로 간다 — 글은 서버에 있다 */
const ECHO_WAIT_MS = 8000

/**
 * 커뮤니티 글쓰기(`/community/write`) — 종목(고르지 않아도 된다) · 제목 · 내용 · 사진 자리.
 * 실제 연결이 열린 로그인 사용자만 쓴다 — 목업일 때 칸을 열어 두면 써도 갈 곳이 없다. 칸은 다 보이고 잠긴 채 까닭을 맨 위에 적는다.
 * 올리면 서버가 되돌려 주는 내 글(제목·내용이 같은 새 글)의 글 상세로 간다(주소 기록을 바꿔 넣어 뒤로 가면 목록)
 */
export default function CommunityWritePage() {
  useDocumentTitle('글쓰기')
  const carried = useCommunityWriteHandoff()
  const { pending, status, sendPost } = useCommunityFeed()
  const loggedIn = useIsLoggedIn()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [stock, setStock] = useState<StockInfo | null>(carried)
  const [picking, setPicking] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  /** 보낸 글. 서버가 되돌려 줄 때까지 칸을 잠근다 */
  const [sent, setSent] = useState<CommunityDraft | null>(null)
  const [error, setError] = useState('')

  const open = status === 'open' && loggedIn
  const editable = open && sent === null
  const ready = editable && title.trim() !== '' && content.trim() !== ''

  useEffect(() => {
    if (sent === null) return
    const mine = pending.find((post) => post.title === sent.title && post.content === sent.content)
    if (mine !== undefined) {
      navigate(`/community/${mine.postId}`, { replace: true, state: toCommunityHandoff(mine) })
      return
    }
    const timer = window.setTimeout(() => navigate('/community', { replace: true }), ECHO_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [sent, pending, navigate])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    const draft: CommunityDraft = { title: title.trim(), content: content.trim(), stockCode: stock?.stockCode ?? null }
    // 못 보냈으면(그새 끊김) 쓴 글을 그대로 둔다
    if (!sendPost(draft)) {
      setError('연결이 끊겨 올리지 못했어요. 다시 이어지면 한 번 더 올려 주세요.')
      return
    }
    setError('')
    setSent(draft)
  }

  const pickStock = (picked: StockInfo) => {
    setStock(picked)
    setPicking(false)
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>글쓰기</h1>

      {status === 'mock' ? (
        <p className={styles.notice}>지금 커뮤니티는 예시 화면이에요. 커뮤니티 서버가 열리면 여기서 글을 올릴 수 있어요.</p>
      ) : !loggedIn ? (
        <p className={styles.notice}>
          로그인하면 글을 쓸 수 있어요.{' '}
          <Link to={loginPathFrom(pathname)} className={styles.noticeLink}>
            로그인하기
          </Link>
        </p>
      ) : status !== 'open' ? (
        <p className={styles.notice}>
          <Spinner size={14} /> {status === 'connecting' ? '커뮤니티 서버에 연결하는 중…' : '연결이 끊겨 다시 잇는 중…'}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={submit}>
        {/* 잠기면 안의 칸·단추가 한꺼번에 잠긴다 */}
        <fieldset className={styles.fields} disabled={!editable}>
          <legend className={styles.srOnly}>쓸 글</legend>

          <div className={styles.field}>
            <span className={styles.label} id="community-write-stock">
              종목 <span className={styles.optional}>(고르지 않아도 돼요)</span>
            </span>
            {stock !== null ? (
              <p className={styles.stockChosen}>
                <strong>{stock.stockName}</strong> 이야기
                <button type="button" className={styles.textAction} onClick={() => setStock(null)}>
                  빼기
                </button>
              </p>
            ) : picking ? (
              <SearchBar
                stocks={STOCK_LIST}
                onPick={pickStock}
                onDismiss={() => setPicking(false)}
                autoFocus
                placeholder="이야기할 종목 (예: 삼성전자)"
              />
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

          <div className={styles.field}>
            <span className={styles.label} id="community-write-photo">
              사진
            </span>
            {/* 서버에 사진을 받는 곳이 생기면 연다(docs/커뮤니티-웹소켓-제안.md) */}
            <button type="button" className={styles.photo} disabled aria-describedby="community-write-photo-note">
              <PhotoIcon />
              사진 더하기
            </button>
            <p id="community-write-photo-note" className={styles.hint}>
              사진 올리기는 준비 중이에요. 서버에 사진을 받는 곳이 생기면 붙여요.
            </p>
          </div>
        </fieldset>

        {error !== '' && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {sent !== null && (
          <p className={styles.sending} role="status">
            <Spinner size={14} /> 올리는 중…
          </p>
        )}

        <div className={styles.actions}>
          <Link to="/community" className={styles.cancel}>
            취소
          </Link>
          <button type="submit" className={styles.submit} disabled={!ready}>
            올리기
          </button>
        </div>
      </form>
    </div>
  )
}

function PhotoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m5 17 4.5-4.5 3 3 2.5-2.5L19 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}
