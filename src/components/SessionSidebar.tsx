import { useEffect, useRef, useState } from 'react'
import { TITLE_MAX_LENGTH, normalizeTitle } from '../api/ai'
import { useMediaQuery } from '../hooks/useMediaQuery'
import Modal from './Modal'
import Spinner from './Spinner'
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
/** 날개 안에서 탭으로 닿을 수 있는 것들(Modal과 같은 규칙) */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** 날개를 이만큼 왼쪽으로 밀면 닫는다 */
const SWIPE_CLOSE = 60

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
   * 좁은 화면(900px 이하)은 목록이 왼쪽에서 밀려 나오는 날개다 — 대화창 위에 쌓으면 펼친 만큼 입력칸이 첫 화면 밖으로 밀린다.
   * 대화창 위에는 "이전 대화 N개 | + 새 대화" 한 줄만 두고, 누르면 날개가 열린다. 넓은 화면은 옆 열에 늘 서므로 이 값과 상관없다
   */
  const narrow = useMediaQuery('(max-width: 900px)')
  const [isOpen, setIsOpen] = useState(false)
  const drawerOpen = narrow && isOpen
  const openRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)

  /* 방마다 '⋯'을 누르면 그 줄 아래에 이름 바꾸기·지우기가 펼쳐진다 — 떠 있는 메뉴를 날개(떠 있는 층) 위에 또 띄우지 않는다 */
  const [menuId, setMenuId] = useState<number | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  // 날개의 Esc·탭 가두기는 지우기 확인 상자가 떠 있는 동안 비켜선다 — 상자가 따로 받는다
  const deletingRef = useRef(false)
  useEffect(() => {
    deletingRef.current = deleting !== null
  })
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

  /*
   * 날개가 열려 있는 동안: 뒤 화면이 스크롤되지 않게 잠그고, 날개로 포커스를 옮겨 탭을 안에 가두고, Esc로 닫는다.
   * 닫히면 연 단추로 포커스를 돌려준다. 이름칸의 Esc는 이름 고치기를 거두는 것이라(기본 동작을 막는다) 날개를 닫지 않는다
   */
  useEffect(() => {
    if (!drawerOpen) return
    const { body } = document
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    panelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (deletingRef.current || event.defaultPrevented) return
      if (event.key === 'Escape') {
        setIsOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (panel === null) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items.at(-1)
      if (first === undefined || last === undefined) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    const opener = openRef.current
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      body.style.overflow = prevOverflow
      opener?.focus({ preventScroll: true })
    }
  }, [drawerOpen])

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
     * 첫 질문으로 지은 제목은 30자 + '…'라, 손대지 않고 저장해도 자른 값과는 달라 '…'만 떨어진 채 보내진다
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

  function startNewChat() {
    setIsOpen(false)
    setMenuId(null)
    setListNotice('')
    onNewChat()
  }

  return (
    <>
      {/* 좁은 화면에서만 — 대화창 위 한 줄. 새 대화는 날개를 열지 않고도 시작한다 */}
      <div className={styles.bar}>
        <button
          ref={openRef}
          type="button"
          className={styles.open}
          aria-expanded={drawerOpen}
          aria-controls="session-list"
          onClick={() => setIsOpen(true)}
        >
          <ListIcon />
          {isLoggedIn && listState === 'ready' ? `이전 대화 ${sessions.length}개` : '이전 대화'}
        </button>
        <button type="button" className={styles.newChat} onClick={startNewChat}>
          + 새 대화
        </button>
      </div>

      <div className={styles.backdrop} data-open={drawerOpen || undefined} aria-hidden="true" onClick={() => setIsOpen(false)} />

      {/* 넓은 화면은 옆 열, 좁은 화면은 날개. 닫힌 날개는 포커스·읽어 주기에서 빠진다(inert) */}
      <aside
        id="session-list"
        ref={panelRef}
        className={styles.sidebar}
        data-open={drawerOpen || undefined}
        inert={narrow && !isOpen}
        aria-label={narrow ? '이전 대화' : undefined}
        tabIndex={narrow ? -1 : undefined}
        onTouchStart={(event) => {
          swipeRef.current = drawerOpen ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
        }}
        onTouchEnd={(event) => {
          const start = swipeRef.current
          swipeRef.current = null
          if (start === null) return
          const dx = event.changedTouches[0].clientX - start.x
          const dy = event.changedTouches[0].clientY - start.y
          if (dx < -SWIPE_CLOSE && Math.abs(dx) > Math.abs(dy) * 1.5) setIsOpen(false)
        }}
      >
        <div className={styles.head}>
          <h2 className={styles.headTitle}>이전 대화내용</h2>
          {/* 방을 한 번 고르고 나면 빈 화면으로 돌아갈 길이 이것뿐이다 */}
          <button ref={newChatRef} type="button" className={styles.newChat} onClick={startNewChat}>
            + 새 대화
          </button>
          <button type="button" className={styles.close} aria-label="목록 닫기" onClick={() => setIsOpen(false)}>
            <CloseIcon />
          </button>
        </div>

        <div>
          {isLoggedIn && listNotice !== '' && (
            <p className={styles.listNotice} role="status">
              {listNotice}
            </p>
          )}
          {!isLoggedIn ? (
            <p className={styles.empty}>로그인하면 이전 대화를 저장할 수 있어요.</p>
          ) : listState === 'loading' ? (
            <p className={styles.empty}>
              <Spinner size={16} /> 대화 목록을 불러오는 중이에요
            </p>
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
                              // 좁은 화면에서 방을 고르면 날개를 닫아 대화가 보이게 한다
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

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
