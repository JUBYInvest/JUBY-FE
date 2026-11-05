import type { RefObject } from 'react'
import styles from '../../pages/AiPage.module.css'

/** 서버 AskRequest의 question 최대 길이 */
const QUESTION_MAX_LENGTH = 1000

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** 예시 질문을 누르면 화면이 여기로 포커스를 옮긴다 */
  inputRef: RefObject<HTMLTextAreaElement | null>
  /** 답을 기다리는 중 — 입력칸과 보내기를 잠근다 */
  waiting: boolean
  /** 대화방을 받는 중이거나 못 받았다 — 보내기만 잠근다(쓴 글은 둔다) */
  sendLocked: boolean
}

/** 질문 입력칸과 보내기. Enter는 보내기, Shift+Enter는 줄바꿈이다 */
export default function Composer({ value, onChange, onSubmit, inputRef, waiting, sendLocked }: Props) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter는 줄바꿈으로 둔다. 조합 중인 한글이 확정되는 엔터도 보내면 안 된다
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className={styles.composer}>
      <div className={styles.composerBox}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 삼성전자 주가 어때?"
          rows={1}
          maxLength={QUESTION_MAX_LENGTH}
          disabled={waiting}
          aria-label="질문 입력"
        />
        <button
          type="button"
          className={styles.send}
          onClick={onSubmit}
          disabled={waiting || sendLocked || value.trim() === ''}
        >
          보내기
        </button>
      </div>
    </div>
  )
}
