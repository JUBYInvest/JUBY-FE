import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CHAT_IS_MOCK, CHAT_LIMIT, connectChat, loadChatHistory, type ChatConnection, type ChatMessage } from '../api/chat'
import { getMemberInfo } from '../api/member'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { toKoreanClock } from '../utils/date'
import { loginPathFrom } from '../utils/navigation'
import styles from './HomeChat.module.css'

/** 대화창 바닥에서 이만큼 안이면 "맨 아래를 보는 중" — 새 말이 오면 따라 내린다. 위로 올려 읽는 중이면 그대로 둔다 */
const STICK_PX = 48
/** 같은 사람이 이 안에 이어 말하면 한 묶음이다 — 이름·시각을 묶음 첫 말에만 적는다 */
const GROUP_MS = 3 * 60_000

/**
 * 홈 맨 아래 전체 채팅 — 누구나 읽고, 로그인하면 말한다. 채팅 서버가 없어 지금은 예시다(src/api/chat.ts).
 * 대화창 안에서만 내리고(오래된 말이 위), 이어 말하면 이름·시각을 한 번만 적는다. 내 말은 오른쪽.
 * 시각은 말풍선 옆이 아니라 이름 줄에 둔다 — 홈 오른쪽 열은 320px 남짓이라 옆에 두면 말풍선이 그만큼 좁아져 두 줄로 꺾인다.
 * 보내는 이름은 커뮤니티 닉네임, 없으면 이름, 그것도 없으면 "나"다
 */
export default function HomeChat() {
  const loggedIn = useIsLoggedIn()
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory())
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const connectionRef = useRef<ChatConnection | null>(null)

  useEffect(() => {
    const connection = connectChat((message) => setMessages((list) => [...list, message]))
    connectionRef.current = connection
    return () => {
      connectionRef.current = null
      connection.close()
    }
  }, [])

  // 맨 아래를 보는 중이었으면 새 말을 따라 내린다(처음에도 맨 아래 — 최신 말이 보인다)
  useLayoutEffect(() => {
    const log = logRef.current
    if (log !== null && stickRef.current) log.scrollTop = log.scrollHeight
  }, [messages])

  const onScroll = () => {
    const log = logRef.current
    if (log !== null) stickRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < STICK_PX
  }

  // 보내는 이름은 보낼 때 묻는다(닉네임 → 이름 → "나", 회원 정보는 화면끼리 1분 같이 쓴다) — 홈을 열 때마다 회원 정보를 부르지 않게
  const send = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '' || !loggedIn) return
    stickRef.current = true
    setDraft('')
    getMemberInfo()
      .then((member) => member.nickname ?? (member.name || '나'))
      .catch(() => '나')
      .then((name) => connectionRef.current?.send(text, name))
  }

  return (
    <section className={styles.chat} aria-labelledby="home-chat-title">
      <div className={styles.head}>
        <h2 id="home-chat-title" className={styles.title}>
          채팅
        </h2>
        {CHAT_IS_MOCK && <span className={styles.sampleTag}>예시</span>}
        <span className={styles.note}>모두가 함께 쓰는 대화방</span>
      </div>

      {/* 스크롤되는 칸이라 키보드로도 들어와 위아래로 움직일 수 있게 tabIndex를 준다 */}
      <div ref={logRef} className={styles.log} role="log" aria-label="전체 채팅" tabIndex={0} onScroll={onScroll}>
        <ol className={styles.messages}>
          {messages.map((message, index) => {
            const previous = messages[index - 1]
            const continued =
              previous !== undefined && previous.author === message.author && previous.mine === message.mine && message.at - previous.at < GROUP_MS
            const who = message.mine ? '내 말' : message.author
            const time = (
              <time className={continued ? styles.srOnly : styles.time} dateTime={new Date(message.at).toISOString()}>
                {toKoreanClock(message.at)}
              </time>
            )
            return (
              <li key={message.id} className={`${message.mine ? styles.mine : styles.message} ${continued ? styles.continued : ''}`}>
                {!message.mine && (
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
                      {message.mine ? <span className={styles.srOnly}>{who}</span> : <strong>{who}</strong>}
                      {time}
                    </p>
                  )}
                  <p className={styles.bubble}>{message.text}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {loggedIn ? (
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
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className={styles.send} disabled={draft.trim() === ''}>
            보내기
          </button>
        </form>
      ) : (
        <p className={styles.login}>
          <Link to={loginPathFrom('/')} className={styles.loginLink}>
            로그인
          </Link>
          하면 채팅에 참여할 수 있어요.
        </p>
      )}
      {CHAT_IS_MOCK && <p className={styles.notice}>지금 대화는 예시예요. 보낸 말은 이 화면에만 보이고 저장되지 않아요.</p>}
    </section>
  )
}
