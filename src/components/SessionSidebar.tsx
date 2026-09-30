import { useEffect, useRef, useState } from 'react'
import { TITLE_MAX_LENGTH, normalizeTitle } from '../api/ai'
import Modal from './Modal'
import type { ChatSession } from '../types/ai'
import styles from './SessionSidebar.module.css'

/** 대화방 목록을 받는 중인지, 받았는지, 못 받았는지 */
export type SessionListState = 'loading' | 'ready' | 'error'

interface Props {
  sessions: ChatSession[]
  /** 못 받았으면 "이전 대화가 없습니다" 대신 실패 안내와 다시 시도를 띄운다 */
  listState: SessionListState
  onRetryList: () => void
  /** 지금 보고 있는 세션. 새 대화 중이면 null */
  selectedId: number | null
  onSelect: (sessionId: number) => void
  onNewChat: () => void
  /** 제목 바꾸기. 실패하면 던진다. 다른 곳에서 이미 지운 방이면 'gone'이다(부르는 쪽이 목록에서 뺐다) */
  onRename: (sessionId: number, title: string) => Promise<'renamed' | 'gone'>
  /** 지우기. 실패하면 던진다 */
  onDelete: (sessionId: number) => Promise<void>
  /** 비로그인이면 목록 대신 안내를 띄운다. 대화 이력은 계정에 귀속되기 때문 */
  isLoggedIn: boolean
}

/** 이름을 고치는 중인 방. 실패하면 쓴 글을 그대로 두고 안내한다 */
interface Editing {
  sessionId: number
  value: string
  state: 'idle' | 'saving' | 'error'
}

/** 지울지 묻는 중인 방 */
interface Deleting {
  session: ChatSession
  state: 'idle' | 'deleting' | 'error'
}

const RENAME_FAILED = '이름을 바꾸지 못했어요. 다시 시도해 주세요.'
const DELETE_FAILED = '지우지 못했어요. 다시 시도해 주세요.'
const GONE_NOTICE = '이미 지워진 대화라 목록에서 뺐어요.'

export default function SessionSidebar({
  sessions,
  listState,
  onRetryList,
  selectedId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  isLoggedIn,
}: Props) {
  /*
   * 좁은 화면(900px 이하)에서 목록을 펼쳤는가. 거기서는 목록이 대화창 위에 쌓여, 펼쳐 두면
   * 입력칸이 첫 화면 밖으로 밀린다(아이폰 13에서 933px 지점, 화면 664px). 접어 두고 누르면 편다.
   * 넓은 화면은 옆에 서므로 CSS가 이 값과 상관없이 늘 보여준다.
   */
  const [isOpen, setIsOpen] = useState(false)

  /*
   * 방마다 '⋯'을 누르면 그 줄 아래에 이름 바꾸기·지우기가 펼쳐진다. 떠 있는 메뉴로 띄우지 않은 건 사이드바가
   * 모서리 밖을 잘라서(overflow: hidden) 넘치는 메뉴가 잘리고, 휴대폰에서는 목록이 접히기 때문이다.
   */
  const [menuId, setMenuId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  /** 목록 위에 띄우는 한 줄 알림(다른 곳에서 지운 방을 뺐다) */
  const [listNotice, setListNotice] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const newChatRef = useRef<HTMLButtonElement>(null)
  const moreRefs = useRef(new Map<number, HTMLButtonElement>())
  /*
   * 다음 렌더 뒤에 포커스를 줄 곳. 이름을 다 고치면 그 방의 '⋯'으로, 방이 사라지면 '새 대화'로 돌려놓는다 —
   * 누르던 단추가 사라지면 포커스가 문서 맨 앞으로 떨어져 키보드로 쓰던 자리를 잃는다.
   */
  const focusNextRef = useRef<number | 'newChat' | null>(null)
  useEffect(() => {
    const target = focusNextRef.current
    if (target === null) return
    focusNextRef.current = null
    if (target === 'newChat') newChatRef.current?.focus()
    else moreRefs.current.get(target)?.focus()
  })

  // 이름칸이 열리면 곧바로 칠 수 있게 포커스를 주고 원래 제목을 골라 둔다
  const editingId = editing?.sessionId ?? null
  useEffect(() => {
    if (editingId === null) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingId])

  const isSaving = editing?.state === 'saving'

  function toggleMenu(sessionId: number) {
    if (isSaving) return
    setEditing(null)
    setListNotice('')
    setMenuId((open) => (open === sessionId ? null : sessionId))
  }

  function startRename(session: ChatSession) {
    setMenuId(null)
    setEditing({ sessionId: session.sessionId, value: session.title, state: 'idle' })
  }

  function cancelRename() {
    if (editing === null || isSaving) return
    focusNextRef.current = editing.sessionId
    setEditing(null)
  }

  async function saveRename() {
    if (editing === null || isSaving) return
    const { sessionId, value } = editing
    const title = normalizeTitle(value)
    // 빈 제목은 서버가 400으로 막는다. 저장 단추도 잠겨 있다
    if (title === '') return
    /*
     * 바뀐 게 없으면 보내지 않는다(보내면 제목은 그대로인데 그 방이 목록 맨 위로 간다). 30자로 자르기 전의 글로도 견준다 —
     * 첫 질문으로 지은 제목은 30자 + '…'라, 손대지 않고 저장해도 자른 값과는 달라 '…'만 떨어진 채 보내졌다
     */
    const current = sessions.find((session) => session.sessionId === sessionId)?.title
    if (current === title || current === value.trim().replace(/\s+/g, ' ')) {
      cancelRename()
      return
    }

    setEditing({ sessionId, value, state: 'saving' })
    try {
      const result = await onRename(sessionId, title)
      if (result === 'gone') {
        setListNotice(GONE_NOTICE)
        focusNextRef.current = 'newChat'
      } else {
        focusNextRef.current = sessionId
      }
      setEditing(null)
    } catch (error: unknown) {
      console.warn('대화방 이름 바꾸기 실패', error)
      setEditing({ sessionId, value, state: 'error' })
      // 저장 단추를 눌렀다면 잠기는 순간 포커스를 잃었다. 고쳐 쓸 수 있게 이름칸으로 돌린다
      inputRef.current?.focus()
    }
  }

  function closeDelete() {
    if (deleting?.state === 'deleting') return
    setDeleting(null)
  }

  async function confirmDelete() {
    if (deleting === null || deleting.state === 'deleting') return
    const { session } = deleting
    setDeleting({ session, state: 'deleting' })
    try {
      await onDelete(session.sessionId)
      focusNextRef.current = 'newChat'
      setDeleting(null)
      setMenuId(null)
    } catch (error: unknown) {
      console.warn('대화방 지우기 실패', error)
      setDeleting({ session, state: 'error' })
    }
  }

  return (
    <>
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
            {isLoggedIn && listState === 'ready' ? `이전 대화 ${sessions.length}개` : '이전 대화'}
            <span className={styles.chevron} aria-hidden="true">
              ▾
            </span>
          </button>
          {/*
            피그마에는 없지만 필요하다. 세션을 한 번 고르고 나면
            빈 화면으로 돌아갈 방법이 사라진다.
          */}
          <button
            ref={newChatRef}
            type="button"
            className={styles.newChat}
            onClick={() => {
              setIsOpen(false)
              setMenuId(null)
              setListNotice('')
              onNewChat()
            }}
          >
            + 새 대화
          </button>
        </div>

        <div id="session-list" className={isOpen ? undefined : styles.bodyClosed}>
          {isLoggedIn && listNotice !== '' && (
            <p className={styles.listNotice} role="status">
              {listNotice}
            </p>
          )}
          {!isLoggedIn ? (
            <p className={styles.empty}>로그인하면 이전 대화를 저장할 수 있어요.</p>
          ) : listState === 'loading' ? (
            <p className={styles.empty}>대화 목록을 불러오는 중이에요</p>
          ) : listState === 'error' ? (
            <p className={styles.empty}>
              목록을 불러오지 못했어요.
              <button type="button" className={styles.retry} onClick={onRetryList}>
                다시 시도
              </button>
            </p>
          ) : sessions.length === 0 ? (
            <p className={styles.empty}>이전 대화가 없습니다</p>
          ) : (
            <ul className={styles.list}>
              {sessions.map((session) => {
                const { sessionId } = session
                const isSelected = sessionId === selectedId
                const isMenuOpen = sessionId === menuId
                const actionsId = `session-actions-${sessionId}`

                return (
                  <li
                    key={sessionId}
                    className={isSelected ? `${styles.row} ${styles.rowOn}` : styles.row}
                  >
                    {editing?.sessionId === sessionId ? (
                      <div className={styles.rename}>
                        <input
                          ref={inputRef}
                          className={styles.renameInput}
                          value={editing.value}
                          // 고쳐 쓰기 시작하면 앞 실패 안내는 거둔다(저장하는 동안은 읽기 전용이라 여기 안 온다)
                          onChange={(event) =>
                            setEditing({ ...editing, value: event.target.value, state: 'idle' })
                          }
                          onKeyDown={(event) => {
                            // 조합 중인 한글이 확정되는 엔터는 저장이 아니다
                            if (event.nativeEvent.isComposing) return
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void saveRename()
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              cancelRename()
                            }
                          }}
                          // 서버가 사람이 붙인 제목을 30자에서 자른다. 잠그지 않고 읽기 전용으로 둬 저장하는 동안 포커스를 지킨다
                          maxLength={TITLE_MAX_LENGTH}
                          readOnly={isSaving}
                          aria-label="대화 이름"
                        />
                        {editing.state === 'error' && (
                          <p className={styles.rowError} role="alert">
                            {RENAME_FAILED}
                          </p>
                        )}
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.action}
                            onClick={() => void saveRename()}
                            disabled={isSaving || normalizeTitle(editing.value) === ''}
                          >
                            {isSaving ? '저장 중…' : '저장'}
                          </button>
                          <button
                            type="button"
                            className={styles.action}
                            onClick={cancelRename}
                            disabled={isSaving}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={styles.rowHead}>
                          <button
                            type="button"
                            className={styles.item}
                            onClick={() => {
                              // 좁은 화면에서 방을 고르면 목록을 접어 대화가 보이게 한다
                              setIsOpen(false)
                              setMenuId(null)
                              setListNotice('')
                              onSelect(sessionId)
                            }}
                            aria-current={isSelected}
                            /* 한 줄로 자르므로 전체 제목은 툴팁으로 남긴다 */
                            title={session.title}
                          >
                            {session.title}
                          </button>
                          <button
                            ref={(element) => {
                              if (element === null) moreRefs.current.delete(sessionId)
                              else moreRefs.current.set(sessionId, element)
                            }}
                            type="button"
                            className={styles.more}
                            onClick={() => toggleMenu(sessionId)}
                            aria-label={`‘${session.title}’ 대화 관리`}
                            aria-expanded={isMenuOpen}
                            aria-controls={isMenuOpen ? actionsId : undefined}
                          >
                            <span aria-hidden="true">⋯</span>
                          </button>
                        </div>
                        {isMenuOpen && (
                          <div id={actionsId} className={styles.actions}>
                            <button
                              type="button"
                              className={styles.action}
                              onClick={() => startRename(session)}
                            >
                              이름 바꾸기
                            </button>
                            <button
                              type="button"
                              className={`${styles.action} ${styles.actionDanger}`}
                              onClick={() => setDeleting({ session, state: 'idle' })}
                            >
                              지우기
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* 지우면 되돌릴 수 없다(서버가 방과 메시지를 모두 지운다). 버튼 하나로 바로 지우지 않는다 */}
      <Modal isOpen={deleting !== null} onClose={closeDelete} label="대화 지우기 확인">
        <p className={styles.modalTitle}>이 대화를 지울까요?</p>
        <p className={styles.modalText}>
          ‘{deleting?.session.title}’ 대화와 주고받은 내용이 모두 지워지며 되돌릴 수 없어요.
        </p>

        {deleting?.state === 'error' && (
          <p className={styles.modalError} role="alert">
            {DELETE_FAILED}
          </p>
        )}

        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.danger}
            onClick={() => void confirmDelete()}
            disabled={deleting?.state === 'deleting'}
          >
            {deleting?.state === 'deleting' ? '지우는 중…' : '지우기'}
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={closeDelete}
            disabled={deleting?.state === 'deleting'}
          >
            취소
          </button>
        </div>
      </Modal>
    </>
  )
}
