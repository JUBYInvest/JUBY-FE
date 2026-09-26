import { useState } from 'react'
import type { ChatSession } from '../types/ai'
import styles from './SessionSidebar.module.css'

interface Props {
  sessions: ChatSession[]
  /** 지금 보고 있는 세션. 새 대화 중이면 null */
  selectedId: number | null
  onSelect: (sessionId: number) => void
  onNewChat: () => void
  /** 비로그인이면 목록 대신 안내를 띄운다. 대화 이력은 계정에 귀속되기 때문 */
  isLoggedIn: boolean
}

export default function SessionSidebar({
  sessions,
  selectedId,
  onSelect,
  onNewChat,
  isLoggedIn,
}: Props) {
  /*
   * 좁은 화면(900px 이하)에서 목록을 펼쳤는가. 거기서는 목록이 대화창 위에 쌓여, 펼쳐 두면
   * 입력칸이 첫 화면 밖으로 밀린다(아이폰 13에서 933px 지점, 화면 664px). 접어 두고 누르면 편다.
   * 넓은 화면은 옆에 서므로 CSS가 이 값과 상관없이 늘 보여준다.
   */
  const [isOpen, setIsOpen] = useState(false)

  return (
    <aside className={styles.sidebar}>
      <div className={styles.head}>
        <h2 className={styles.headTitle}>이전 대화내용</h2>
        {/* 좁은 화면에서만 보이는 접기 단추. 제목 자리를 대신한다 */}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={isOpen}
          aria-controls="session-list"
          onClick={() => setIsOpen((open) => !open)}
        >
          {isLoggedIn ? `이전 대화 ${sessions.length}개` : '이전 대화'}
          <span className={styles.chevron} aria-hidden="true">
            ▾
          </span>
        </button>
        {/*
          피그마에는 없지만 필요하다. 세션을 한 번 고르고 나면
          빈 화면으로 돌아갈 방법이 사라진다.
        */}
        <button
          type="button"
          className={styles.newChat}
          onClick={() => {
            setIsOpen(false)
            onNewChat()
          }}
        >
          + 새 대화
        </button>
      </div>

      <div id="session-list" className={isOpen ? undefined : styles.bodyClosed}>
        {!isLoggedIn ? (
          <p className={styles.empty}>로그인하면 이전 대화를 저장할 수 있어요.</p>
        ) : sessions.length === 0 ? (
          <p className={styles.empty}>이전 대화가 없습니다</p>
        ) : (
          <ul className={styles.list}>
            {sessions.map((session) => {
              const isSelected = session.sessionId === selectedId

              return (
                <li key={session.sessionId}>
                  <button
                    type="button"
                    className={
                      isSelected ? `${styles.item} ${styles.itemOn}` : styles.item
                    }
                    onClick={() => {
                      // 좁은 화면에서 방을 고르면 목록을 접어 대화가 보이게 한다
                      setIsOpen(false)
                      onSelect(session.sessionId)
                    }}
                    aria-current={isSelected}
                    /* 한 줄로 자르므로 전체 제목은 툴팁으로 남긴다 */
                    title={session.title}
                  >
                    {session.title}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
