import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CHAT_LIMIT, type ChatMessage, type ChatStatus } from '../api/chat'
import { useLiveChat, type PendingMessage } from '../hooks/useLiveChat'
import { kstNow, toKoreanClock, toKoreanDateWithDay } from '../utils/date'
import { loginPathFrom } from '../utils/navigation'
import NicknameModal from './NicknameModal'
import Spinner from './Spinner'
import styles from './HomeChat.module.css'

/** 대화창 바닥에서 이만큼 안이면 "맨 아래를 보는 중" — 새 말이 오면 따라 내린다. 위로 올려 읽는 중이면 그대로 둔다 */
const STICK_PX = 48
/** 같은 사람이 이 안에 이어 말하면 한 묶음이다 — 이름·시각을 묶음 첫 말에만 적는다 */
const GROUP_MS = 3 * 60_000
/** 글자 수를 보이기 시작하는 때 — 늘 보이면 시끄럽다 */
const COUNT_FROM = CHAT_LIMIT - 50

const STATUS_TEXT: Record<ChatStatus, string> = {
  connecting: '연결하는 중',
  live: '실시간',
  retrying: '다시 연결하는 중',
  offline: '연결이 끊겼어요',
}

/**
 * 홈 맨 아래 전체 채팅 — 누구나 읽고, 로그인하고 닉네임을 정하면 말한다(백엔드 실시간 채팅, hooks/useLiveChat → api/chat.ts).
 * 대화창 안에서만 내리고(오래된 말이 위), 맨 위에서 이전 대화를 더 받는다. 날이 바뀌면 날짜 띠를 둔다.
 * 이어 말하면 이름·시각을 한 번만 적는다. 내 말은 오른쪽 — 보내는 중엔 옅게, 실패하면 까닭과 다시 보내기.
 * 위로 올려 읽는 중에 새 말이 오면 내리지 않고 "새 말 N개" 단추를 띄운다.
 * 시각은 말풍선 옆이 아니라 이름 줄에 둔다 — 홈 오른쪽 열은 320px 남짓이라 옆에 두면 말풍선이 그만큼 좁아져 두 줄로 꺾인다
 */
export default function HomeChat() {
  const chat = useLiveChat()
  const { messages, history, pending, status, loggedIn, nickname } = chat
  const [draft, setDraft] = useState('')
  const [nicknameOpen, setNicknameOpen] = useState(false)
  const [unseen, setUnseen] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  /**
   * 이전 대화를 위에 붙이기 직전의 높이와 맨 위 말 — 맨 위 말이 바뀐(위에 붙은) 때에만 그만큼 내려 보던 말이 제자리에 있게 한다.
   * 받는 사이 새 말이 와도 보정을 그 말에 써 버리지 않고, 받기가 실패하면 버린다
   */
  const prependRef = useRef<{ height: number; firstId: number | undefined } | null>(null)
  const lastIdRef = useRef<number | null>(null)

  // 서버가 닉네임이 없다고 거절하면 닉네임 창을 연다
  useEffect(() => {
    if (chat.nicknameAsked > 0) setNicknameOpen(true)
  }, [chat.nicknameAsked])

  // 맨 아래를 보는 중이었으면 새 말을 따라 내린다(처음에도 맨 아래 — 최신 말이 보인다). 위를 읽는 중이면 새 말 수를 센다
  useLayoutEffect(() => {
    const log = logRef.current
    if (log === null) return
    const prepend = prependRef.current
    if (prepend !== null && messages[0]?.id !== prepend.firstId) {
      log.scrollTop += log.scrollHeight - prepend.height
      prependRef.current = null
    } else if (stickRef.current) {
      log.scrollTop = log.scrollHeight
    }
    const lastId = messages.at(-1)?.id ?? null
    const seenUpTo = lastIdRef.current
    if (seenUpTo !== null && lastId !== null && lastId > seenUpTo && !stickRef.current) {
      const fresh = messages.filter((message) => message.id > seenUpTo).length
      setUnseen((count) => count + fresh)
    }
    lastIdRef.current = lastId
  }, [messages, pending])

  // 이전 대화 받기가 실패하면 기다리던 보정을 버린다 — 남아 있으면 다음 새 말에 화면이 끌려간다
  useEffect(() => {
    if (history.kind === 'ready' && !history.loadingMore && history.moreFailed) prependRef.current = null
  }, [history])

  const onScroll = () => {
    const log = logRef.current
    if (log === null) return
    stickRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < STICK_PX
    if (stickRef.current) setUnseen(0)
  }

  const toBottom = () => {
    const log = logRef.current
    if (log === null) return
    stickRef.current = true
    setUnseen(0)
    // 가까우면 부드럽게, 멀면 곧바로 — 수천 px를 부드럽게 내리면 한참 걸려 단추를 누른 답이 늦다
    const far = log.scrollHeight - log.clientHeight - log.scrollTop > log.clientHeight * 2
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    log.scrollTo({ top: log.scrollHeight, behavior: far || reduced ? 'auto' : 'smooth' })
  }

  const loadOlder = () => {
    const log = logRef.current
    if (log !== null) prependRef.current = { height: log.scrollHeight, firstId: messages[0]?.id }
    chat.loadOlder()
  }

  const send = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '' || !loggedIn) return
    stickRef.current = true
    setDraft('')
    chat.send(text)
  }

  const todayYmd = kstNow().ymd
  const canSpeak = loggedIn && !chat.signedOut && nickname !== null

  return (
    <section className={styles.chat} aria-labelledby="home-chat-title">
      <div className={styles.head}>
        <h2 id="home-chat-title" className={styles.title}>
          채팅
        </h2>
        <ConnectionState status={status} onReconnect={chat.reconnect} />
      </div>

      <div className={styles.logWrap}>
        {/* 스크롤되는 칸이라 키보드로도 들어와 위아래로 움직일 수 있게 tabIndex를 준다 */}
        <div ref={logRef} className={styles.log} role="log" aria-label="전체 채팅" aria-busy={history.kind === 'loading' || (history.kind === 'ready' && history.loadingMore)} tabIndex={0} onScroll={onScroll}>
          {/* 지난 대화를 못 받았는데 새 말이 먼저 와 있으면 맨 위에서 다시 받게 한다 */}
          {history.kind === 'error' && messages.length > 0 && (
            <div className={styles.older}>
              <button type="button" className={styles.olderButton} onClick={chat.retryHistory}>
                지난 대화를 불러오지 못했어요. 다시 받기
              </button>
            </div>
          )}
          {history.kind === 'ready' && history.nextCursor !== null && (
            <div className={styles.older}>
              <button type="button" className={styles.olderButton} onClick={loadOlder} disabled={history.loadingMore}>
                {history.loadingMore ? <Spinner size={14} label="이전 대화를 받는 중" /> : history.moreFailed ? '이전 대화를 받지 못했어요. 다시 받기' : '이전 대화 보기'}
              </button>
            </div>
          )}

          {history.kind === 'loading' && messages.length === 0 ? (
            <ChatSkeleton />
          ) : history.kind === 'error' && messages.length === 0 ? (
            <div className={styles.state}>
              <p className={styles.stateText}>지난 대화를 불러오지 못했어요.</p>
              <button type="button" className={styles.stateAction} onClick={chat.retryHistory}>
                다시 시도
              </button>
            </div>
          ) : messages.length === 0 && pending.length === 0 ? (
            <p className={styles.empty}>{canSpeak ? '아직 대화가 없어요. 먼저 인사를 건네 보세요.' : '아직 대화가 없어요.'}</p>
          ) : (
            <ol className={styles.messages}>
              {messages.map((message, index) => (
                <MessageRow key={message.id} message={message} previous={messages[index - 1]} mine={chat.isMine(message)} isMine={chat.isMine} todayYmd={todayYmd} />
              ))}
              {pending.map((item) => (
                <PendingRow key={`pending-${item.key}`} item={item} status={status} onResend={() => chat.resend(item.key)} onDiscard={() => chat.discard(item.key)} />
              ))}
            </ol>
          )}
        </div>

        {unseen > 0 && (
          <button type="button" className={styles.unseen} onClick={toBottom}>
            새 말 {unseen}개
          </button>
        )}
      </div>

      {!loggedIn ? (
        <p className={styles.login}>
          <Link to={loginPathFrom('/')} className={styles.loginLink}>
            로그인
          </Link>
          하면 채팅에 참여할 수 있어요.
        </p>
      ) : chat.signedOut ? (
        <p className={styles.login}>
          로그인이 끝났어요.{' '}
          <Link to={loginPathFrom('/')} className={styles.loginLink}>
            다시 로그인
          </Link>
          하면 말할 수 있어요.
        </p>
      ) : nickname === null ? (
        <div className={styles.nicknameRow}>
          <p className={styles.nicknameText}>닉네임을 정하면 채팅에 참여할 수 있어요.</p>
          <button type="button" className={styles.nicknameButton} onClick={() => setNicknameOpen(true)}>
            닉네임 정하기
          </button>
        </div>
      ) : (
        <form className={styles.composer} onSubmit={send}>
          <label className={styles.srOnly} htmlFor="home-chat-input">
            채팅에 보낼 말
          </label>
          <input
            id="home-chat-input"
            className={styles.input}
            type="text"
            maxLength={CHAT_LIMIT}
            autoComplete="off"
            value={draft}
            placeholder="모두에게 말하기"
            aria-describedby={draft.length >= COUNT_FROM ? 'home-chat-count' : undefined}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className={styles.send} disabled={draft.trim() === ''}>
            보내기
          </button>
          {draft.length >= COUNT_FROM && (
            <span id="home-chat-count" className={styles.count}>
              {draft.length}/{CHAT_LIMIT}
            </span>
          )}
        </form>
      )}

      <NicknameModal
        isOpen={nicknameOpen}
        onClose={() => setNicknameOpen(false)}
        onSaved={(saved) => {
          setNicknameOpen(false)
          chat.setNickname(saved)
        }}
      />
    </section>
  )
}

/** 제목 줄 오른쪽 — 연결 상태. 멈췄으면 다시 연결 단추 */
function ConnectionState({ status, onReconnect }: { status: ChatStatus; onReconnect: () => void }) {
  return (
    <p className={styles.status} role="status">
      {status === 'live' ? (
        <span className={styles.liveDot} aria-hidden="true" />
      ) : status === 'offline' ? null : (
        <Spinner size={12} />
      )}
      <span>{STATUS_TEXT[status]}</span>
      {status === 'offline' && (
        <button type="button" className={styles.reconnect} onClick={onReconnect}>
          다시 연결
        </button>
      )}
    </p>
  )
}

/** 한국 시각의 날(YYYYMMDD) */
function dayOf(ms: number): string {
  return kstNow(ms).ymd
}

function MessageRow({
  message,
  previous,
  mine,
  isMine,
  todayYmd,
}: {
  message: ChatMessage
  previous: ChatMessage | undefined
  mine: boolean
  isMine: (message: ChatMessage) => boolean
  todayYmd: string
}) {
  const day = dayOf(message.at)
  // 날이 바뀌는 자리, 그리고 맨 위 말이 오늘이 아니면 날짜 띠를 둔다
  const newDay = previous === undefined ? day !== todayYmd : dayOf(previous.at) !== day
  const continued =
    !newDay && previous !== undefined && previous.author === message.author && isMine(previous) === mine && message.at - previous.at < GROUP_MS
  const who = mine ? '내 말' : message.author
  const time = (
    <time className={continued ? styles.srOnly : styles.time} dateTime={new Date(message.at).toISOString()}>
      {toKoreanClock(message.at)}
    </time>
  )
  return (
    <>
      {newDay && (
        <li className={styles.day}>
          <span>{toKoreanDateWithDay(day)}</span>
        </li>
      )}
      <li className={`${mine ? styles.mine : styles.message} ${continued ? styles.continued : ''}`}>
        {!mine && (
          <span className={styles.avatar} aria-hidden="true">
            {continued ? '' : Array.from(message.author)[0]}
          </span>
        )}
        <div className={styles.body}>
          {continued ? (
            <span className={styles.srOnly}>
              {who} {time}
            </span>
          ) : (
            <p className={styles.meta}>
              {mine ? <span className={styles.srOnly}>{who}</span> : <strong>{who}</strong>}
              {time}
            </p>
          )}
          <p className={styles.bubble}>{message.text}</p>
        </div>
      </li>
    </>
  )
}

/** 아직 대화에 오르지 않은 내 말 — 보내는 중(옅게) · 연결을 기다림 · 실패(까닭 + 다시 보내기·지우기) */
function PendingRow({ item, status, onResend, onDiscard }: { item: PendingMessage; status: ChatStatus; onResend: () => void; onDiscard: () => void }) {
  const failed = item.state === 'failed'
  return (
    <li className={`${styles.mine} ${failed ? styles.failed : styles.sending}`}>
      <div className={styles.body}>
        <p className={styles.bubble}>{item.text}</p>
        {failed ? (
          <p className={styles.pendingNote} role="alert">
            {item.reason}
            <span className={styles.pendingActions}>
              <button type="button" className={styles.pendingAction} onClick={onResend}>
                다시 보내기
              </button>
              <button type="button" className={styles.pendingAction} onClick={onDiscard}>
                지우기
              </button>
            </span>
          </p>
        ) : (
          <p className={styles.pendingNote}>{status === 'live' ? '보내는 중' : '연결되면 보내요'}</p>
        )}
      </div>
    </li>
  )
}

/** 지난 대화를 받는 동안 — 말 줄 네 개 크기의 뼈대 */
function ChatSkeleton() {
  return (
    <ol className={styles.messages} aria-hidden="true">
      {[68, 44, 80, 56].map((width, index) => (
        <li key={index} className={styles.message}>
          <span className={styles.skeletonAvatar} />
          <div className={styles.body}>
            <span className={styles.skeletonName} />
            <span className={styles.skeletonBubble} style={{ width: `${width}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}
