import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { askStockNews } from '../api/news'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { loginPathFrom } from '../utils/navigation'
import type { NewsItem } from '../types/news'
import NewsCard from './NewsCard'
import newsStyles from './NewsList.module.css'
import styles from './NewsAsk.module.css'

/** 서버가 받는 질문 길이에 정해진 한도는 없지만, 주소에 실려 가므로 짧게 둔다 */
const MAX_LENGTH = 100

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; question: string }
  | { kind: 'ready'; question: string; items: NewsItem[] }
  | { kind: 'error'; question: string }

/**
 * 종목 상세 뉴스의 '기사 검색하기'. 궁금한 점을 적으면 그 종목 뉴스 가운데 가장 가까운 기사 3건을 보여 준다
 * (`GET /api/vectordb/search`, 로그인 필요, 증권사 무관). 누를 때만 보낸다 — 상세를 열 때의 요청 수는 그대로다.
 * 종목이 바뀌면 부르는 쪽이 key로 새로 그린다.
 */
export default function NewsAsk({ stockName }: { stockName: string }) {
  const loggedIn = useIsLoggedIn()
  const { pathname } = useLocation()
  const inputId = useId()
  const [question, setQuestion] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const seqRef = useRef(0)

  if (!loggedIn) {
    return (
      <div className={styles.login}>
        <p className={styles.loginText}>로그인하면 궁금한 점을 적어 이 종목 뉴스에서 찾을 수 있어요</p>
        <Link to={loginPathFrom(pathname)} className={styles.loginLink}>
          로그인
        </Link>
      </div>
    )
  }

  function ask(text: string) {
    seqRef.current += 1
    const seq = seqRef.current
    setState({ kind: 'loading', question: text })
    askStockNews(stockName, text)
      .then((items) => {
        if (seq === seqRef.current) setState({ kind: 'ready', question: text, items })
      })
      .catch((error: unknown) => {
        if (seq !== seqRef.current) return
        console.warn('뉴스 질문 검색 실패', error)
        setState({ kind: 'error', question: text })
      })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = question.trim()
    if (text === '' || state.kind === 'loading') return
    ask(text)
  }

  return (
    <div className={styles.ask}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label htmlFor={inputId} className={styles.label}>
          {stockName} 뉴스에서 무엇이 궁금하세요?
        </label>
        <div className={styles.row}>
          <input
            id={inputId}
            className={styles.input}
            type="search"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="예: 실적 전망, 신제품 소식"
            maxLength={MAX_LENGTH}
            enterKeyHint="search"
          />
          <button
            type="submit"
            className={styles.submit}
            disabled={question.trim() === '' || state.kind === 'loading'}
          >
            {state.kind === 'loading' ? '찾는 중…' : '찾기'}
          </button>
        </div>
      </form>

      {state.kind === 'loading' && (
        <p className={styles.status} role="status">
          적은 질문과 가까운 기사를 찾는 중이에요
        </p>
      )}

      {state.kind === 'error' && (
        <div className={newsStyles.errorBox}>
          <p className={newsStyles.errorText}>기사를 찾지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <button type="button" className={newsStyles.errorRetry} onClick={() => ask(state.question)}>
            다시 시도
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.items.length === 0 && (
        <p className={newsStyles.empty}>가까운 기사를 찾지 못했어요. 다른 말로 물어보세요.</p>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <>
          <p className={styles.status} role="status">
            적은 질문과 가장 가까운 기사 {state.items.length}건이에요.
          </p>
          <ul className={styles.list}>
            {state.items.map((item) => (
              <li key={item.link}>
                <NewsCard item={item} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
