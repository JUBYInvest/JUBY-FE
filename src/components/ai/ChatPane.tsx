import type { ReactNode } from 'react'
import ChatMessages, { type PendingState } from '../ChatMessages'
import type { DetailState } from '../../hooks/useConversation'
import type { ChatMessage } from '../../types/ai'
import styles from '../../pages/AiPage.module.css'

interface Props {
  detailState: DetailState
  messages: ChatMessage[]
  pending: PendingState
  /** 대화방을 못 불러왔을 때의 다시 시도 */
  onRetryDetail: () => void
  /** 답을 못 받았거나 그만 기다린 뒤의 다시 시도 */
  onRetry: () => void
  onStop: () => void
  /** 말풍선이 하나도 없을 때 보여 줄 것(ChatEmptyState) */
  emptyState: ReactNode
}

/** 대화창 본체: 받는 중 뼈대 → 못 받음 → 비어 있음 → 말풍선 */
export default function ChatPane({ detailState, messages, pending, onRetryDetail, onRetry, onStop, emptyState }: Props) {
  if (detailState === 'loading') {
    return (
      <div className={styles.skeletonArea} aria-label="대화를 불러오는 중">
        <span className={`${styles.skeleton} ${styles.skeletonUser}`} />
        <span className={styles.skeleton} />
        <span className={`${styles.skeleton} ${styles.skeletonUser}`} />
        <span className={styles.skeleton} />
      </div>
    )
  }
  if (detailState === 'error') {
    return (
      <div className={styles.centerArea}>
        <p className={styles.errorText}>대화를 불러오지 못했습니다</p>
        <button type="button" className={styles.darkButton} onClick={onRetryDetail}>
          다시 시도
        </button>
      </div>
    )
  }
  if (messages.length === 0 && pending === null) return <>{emptyState}</>
  return <ChatMessages messages={messages} pending={pending} onRetry={onRetry} onStop={onStop} />
}
