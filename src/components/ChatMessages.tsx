import { lazy, Suspense, useEffect, useRef } from 'react'
import type { ChatMessage } from '../types/ai'
import styles from './ChatMessages.module.css'
import { loadMarkdownAnswer } from './loadMarkdownAnswer'
import PlainAnswer from './PlainAnswer'

// 렌더러는 따로 받는다. 받는 동안·못 받았을 때는 글자 그대로 보인다(loadMarkdownAnswer)
const MarkdownAnswer = lazy(loadMarkdownAnswer)

/**
 * 답변을 기다리는 중인지, 실패해서 재시도를 기다리는지, 사용자가 기다리기를 멈췄는지. 끝났으면 null
 */
export type PendingState = 'loading' | 'error' | 'stopped' | null

interface Props {
  messages: ChatMessage[]
  pending: PendingState
  onRetry: () => void
  /** 그만 기다리기. 답은 제한 없이 기다리므로 사용자가 끊을 길을 둔다 */
  onStop: () => void
}

export default function ChatMessages({ messages, pending, onRetry, onStop }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  /*
   * 새 말풍선이 붙으면 맨 아래로 내린다.
   * pending도 의존성에 넣는 이유: 로딩 자리와 실제 답변은 높이가 달라서
   * 답변으로 바뀌는 순간에도 다시 내려줘야 끝이 가려지지 않는다.
   */
  useEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    element.scrollTop = element.scrollHeight
  }, [messages, pending])

  return (
    <div className={styles.scroll} ref={scrollRef}>
      {messages.map((message) => (
        <div
          key={message.messageId}
          className={
            message.role === 'user'
              ? `${styles.row} ${styles.rowUser}`
              : styles.row
          }
        >
          {/*
            질문은 쓴 글자 그대로 그린다(줄바꿈은 white-space: pre-wrap). AI 답변은 마크다운·수식으로 그린다 —
            모델 출력 속 HTML은 그리지 않는다(MarkdownAnswer). dangerouslySetInnerHTML은 쓰지 않는다.
          */}
          {message.role === 'user' ? (
            <p className={`${styles.bubble} ${styles.bubbleUser}`}>{message.content}</p>
          ) : (
            <div className={`${styles.bubble} ${styles.bubbleAnswer}`}>
              <Suspense fallback={<PlainAnswer text={message.content} />}>
                <MarkdownAnswer text={message.content} />
              </Suspense>
            </div>
          )}
        </div>
      ))}

      {pending === 'loading' && (
        <div className={`${styles.row} ${styles.waitRow}`}>
          <p className={`${styles.bubble} ${styles.loading}`} aria-live="polite">
            <span className={styles.srOnly}>답변을 생성하고 있어요</span>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.dot} aria-hidden="true" />
          </p>
          <button type="button" className={styles.retry} onClick={onStop}>
            그만 기다리기
          </button>
        </div>
      )}

      {pending === 'stopped' && (
        <div className={styles.row}>
          <p className={`${styles.bubble} ${styles.stopped}`}>
            답을 기다리지 않았어요.
            <button type="button" className={styles.retry} onClick={onRetry}>
              다시 시도
            </button>
          </p>
        </div>
      )}

      {pending === 'error' && (
        <div className={styles.row}>
          <p className={`${styles.bubble} ${styles.error}`}>
            답변을 가져오지 못했어요.
            <button type="button" className={styles.retry} onClick={onRetry}>
              다시 시도
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
