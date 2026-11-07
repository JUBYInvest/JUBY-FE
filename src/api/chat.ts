import { API_ORIGIN, get, malformedResponse, renewAccessToken } from './client'
import { openStomp, type StompSession } from './stomp'
import { getAccessToken } from '../utils/auth'
import { fromKstDateTime } from '../utils/date'

/*
 * 홈 전체 채팅(백엔드 JUBY-BE domain/livechat). 지난 대화는 REST, 새 말 받기·보내기는 STOMP 웹소켓이다.
 * - 지난 대화 `GET /api/live-chat/messages?size&cursor` — 누구나. 오래된 말이 앞, 더 이전은 nextCursor로. 서버는 최근 300개만 남긴다.
 * - 연결 `/ws/live-chat` — 프록시(vercel.json rewrites)는 웹소켓을 넘기지 못해 백엔드 주소(API_ORIGIN)로 곧장 간다.
 *   CONNECT 머리에 토큰(없으면 읽기만). 무효 토큰이면 ERROR 프레임(message = AUTH401_1 만료·401_2 무효·401_5 로그아웃된 토큰).
 * - 받기 `/topic/live-chat`(내 말도 여기로 온다), 내 실패만 `/user/queue/errors`, 보내기 SEND `/app/live-chat/messages` {content}.
 * 연결은 끊기면 다시 붙는다(1·2·4·8·16초, 다섯 번 실패하면 멈추고 화면이 "다시 연결"을 보인다).
 */

export interface ChatMessage {
  id: number
  author: string
  text: string
  /** 보낸 때(ms) */
  at: number
}

/** 한 번에 보낼 수 있는 글자 수(백엔드 LiveChatService.MAX_CONTENT_LENGTH — String.length로 센다, 입력칸 maxLength와 같다) */
export const CHAT_LIMIT = 300
/** 같은 사람이 이 간격 안에 다시 보내면 서버가 거절한다(LIVECHAT429_1, LiveChatRateLimiter) — 보내는 쪽이 먼저 기다린다 */
export const CHAT_SEND_GAP_MS = 1_000

const PAGE_SIZE = 50
const SOCKET_URL = `${API_ORIGIN.replace(/^http/, 'ws')}/ws/live-chat`
const TOPIC = '/topic/live-chat'
const ERRORS = '/user/queue/errors'
const SEND = '/app/live-chat/messages'
const RETRY_MS = [1_000, 2_000, 4_000, 8_000, 16_000]
/** CONNECT를 거절당한 토큰 문제 — 재발급해 보고, 안 되면 읽기 전용으로 붙는다 */
const AUTH_CODES = new Set(['AUTH401_1', 'AUTH401_2', 'AUTH401_5'])

function toChatMessage(raw: unknown): ChatMessage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = raw as Record<string, unknown>
  const at = fromKstDateTime(typeof row.createdAt === 'string' ? row.createdAt : null)
  if (typeof row.messageId !== 'number' || !Number.isFinite(row.messageId) || typeof row.content !== 'string' || at === null) return null
  const author = typeof row.writerNickname === 'string' && row.writerNickname.trim() !== '' ? row.writerNickname : '알 수 없음'
  return { id: row.messageId, author, text: row.content, at }
}

interface ChatPage {
  /** 오래된 말이 앞 */
  messages: ChatMessage[]
  /** 더 이전 대화를 받을 때 보낼 값. 없으면 null */
  nextCursor: number | null
}

/** 지난 대화 한 쪽. cursor가 없으면 가장 최근 대화다. 로그인 없이 되고, 만료된 토큰이어도 로그인 화면으로 끌고 가지 않는다 */
export async function loadChatPage(cursor: number | null): Promise<ChatPage> {
  const query = new URLSearchParams({ size: String(PAGE_SIZE) })
  if (cursor !== null) query.set('cursor', String(cursor))
  const result = await get<unknown>(`/api/live-chat/messages?${query}`, { ignoreUnauthorized: true, timeoutMs: 8_000 })
  if (typeof result !== 'object' || result === null || !Array.isArray((result as { messages?: unknown }).messages)) throw malformedResponse()
  const { messages, nextCursor, hasNext } = result as { messages: unknown[]; nextCursor?: unknown; hasNext?: unknown }
  const cursorValue = hasNext === true && typeof nextCursor === 'number' && Number.isFinite(nextCursor) ? nextCursor : null
  return { messages: messages.flatMap((row) => toChatMessage(row) ?? []), nextCursor: cursorValue }
}

/** 연결 상태: 처음 붙는 중 · 붙음 · 끊겨서 다시 붙는 중 · 멈춤(다시 연결을 눌러야 한다) */
export type ChatStatus = 'connecting' | 'live' | 'retrying' | 'offline'

interface LiveChatHandlers {
  onStatus: (status: ChatStatus) => void
  onMessage: (message: ChatMessage) => void
  /** 내가 보낸 말이 실패했다(서버 code, 예: LIVECHAT403_1 닉네임 없음, LIVECHAT429_1 너무 빠름, AUTH401_1 토큰 만료) */
  onSendError: (code: string) => void
  /** 토큰을 살리지 못해 읽기 전용으로 붙었다 — 다시 로그인해야 말할 수 있다 */
  onSignedOut: () => void
}

export interface LiveChat {
  /** 붙어 있을 때만 보낸다. 보냈으면 true */
  send: (text: string) => boolean
  /** 멈췄거나 다시 붙기를 기다리는 중이면 곧바로 붙는다 */
  reconnect: () => void
  close: () => void
}

export function openLiveChat(handlers: LiveChatHandlers): LiveChat {
  let session: StompSession | null = null
  let live = false
  let closed = false
  let failures = 0
  let timer: number | undefined
  /** 토큰을 살리지 못했다 — 이 연결은 끝날 때까지 토큰 없이 붙는다 */
  let readOnly = false

  const connect = () => {
    window.clearTimeout(timer)
    timer = undefined
    if (closed) return
    const token = readOnly ? null : getAccessToken()
    let rejected = false
    const current = openStomp(SOCKET_URL, token === null ? {} : { Authorization: `Bearer ${token}` }, {
      onConnect: () => {
        if (closed || session !== current) return
        live = true
        failures = 0
        current.subscribe(TOPIC, (body) => {
          const message = parse(body, toChatMessage)
          if (message !== null) handlers.onMessage(message)
        })
        current.subscribe(ERRORS, (body) => {
          const code = parse(body, (raw) => (typeof raw === 'object' && raw !== null && typeof (raw as { code?: unknown }).code === 'string' ? (raw as { code: string }).code : null))
          handlers.onSendError(code ?? '')
          // 붙은 뒤 토큰이 만료됐다(연결은 처음 한 번만 인증한다) — 새 토큰으로 다시 붙는다. 실패한 말은 화면이 다시 보낸다
          if (code !== null && AUTH_CODES.has(code) && token !== null) void renewAndReconnect(token)
        })
        handlers.onStatus('live')
      },
      onError: (code) => {
        if (closed || session !== current) return
        rejected = true
        console.warn('채팅 연결을 거절당했습니다', code)
        if (AUTH_CODES.has(code) && token !== null) void renewAndReconnect(token)
        else scheduleRetry()
      },
      onClose: () => {
        if (closed || session !== current) return
        live = false
        session = null
        // 거절(ERROR)은 위에서 다음 길을 정했다
        if (!rejected) scheduleRetry()
      },
    })
    session = current
  }

  const renewAndReconnect = async (sentToken: string) => {
    live = false
    const old = session
    session = null
    old?.close()
    handlers.onStatus('retrying')
    const renewed = await renewAccessToken(sentToken)
    if (closed) return
    if (renewed === null) {
      readOnly = true
      handlers.onSignedOut()
    }
    connect()
  }

  const scheduleRetry = () => {
    if (closed) return
    const wait = RETRY_MS[failures]
    failures += 1
    if (wait === undefined) {
      handlers.onStatus('offline')
      return
    }
    handlers.onStatus('retrying')
    timer = window.setTimeout(connect, wait)
  }

  handlers.onStatus('connecting')
  connect()

  return {
    send: (text) => live && session !== null && session.send(SEND, JSON.stringify({ content: text })),
    reconnect: () => {
      if (closed || live || session !== null) return
      failures = 0
      handlers.onStatus('retrying')
      connect()
    },
    close: () => {
      closed = true
      window.clearTimeout(timer)
      session?.close()
      session = null
    },
  }
}

function parse<T>(body: string, pick: (raw: unknown) => T | null): T | null {
  try {
    return pick(JSON.parse(body))
  } catch {
    return null
  }
}
