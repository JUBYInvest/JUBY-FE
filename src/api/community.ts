import { COMMUNITY_PREVIEW_LIVE, COMMUNITY_PREVIEW_POSTS, type CommunityPreviewPost } from '../content/communityPreview'
import { getAccessToken } from '../utils/auth'
import { toIsoTime } from '../utils/date'
import { numberFromText } from '../utils/format'

/*
 * 커뮤니티(2026-11-03 사용자 요청 "토스증권처럼 게시판으로… 웹소켓으로 받을 예정이므로 웹소켓을 받을 자리만 남기고 목업을").
 *
 * 처음 목록은 한 번 받고(지금은 예시 글 — REST 자리), 그 뒤 새 글·공감 수·지운 글은 웹소켓으로 받는다. 화면은 이 파일만 부른다.
 * 백엔드에는 아직 커뮤니티가 없다(JUBY-BE `feature/websocket/#73`은 증권사 실시간 시세용이고, spring-boot-starter-websocket·stomp를 들였다).
 * 그래서 연결은 스프링이 기본으로 주는 STOMP(웹소켓 위)로 짓는다 — 라이브러리를 들이지 않고 프레임 몇 개만 직접 쓴다.
 * 주고받는 모양은 docs/커뮤니티-웹소켓-제안.md에 적었다. 서버 주소를 VITE_COMMUNITY_WS_URL에 넣으면 목업 대신 실제로 붙는다.
 */

export interface CommunityPost {
  postId: number
  author: string
  stockCode: string | null
  stockName: string | null
  content: string
  /** ISO 시각 */
  createdAt: string
  likeCount: number
  commentCount: number
}

/** 웹소켓으로 오는 일. 모르는 type·모양이 틀린 값은 버린다(서버 글은 구역 경계 밖이라 던지지 않는다) */
export type CommunityEvent =
  | { type: 'POST_CREATED'; post: CommunityPost }
  | { type: 'POST_UPDATED'; postId: number; likeCount: number; commentCount: number }
  | { type: 'POST_DELETED'; postId: number }

/** mock: 서버 주소가 없어 예시 글을 흘려보내는 중. 나머지는 실제 연결의 상태 */
export type CommunityStatus = 'mock' | 'connecting' | 'open' | 'reconnecting'

export interface CommunityConnection {
  /** 서버에 글을 보낼 수 있는가(실제 연결이 열렸을 때만) */
  canSend: () => boolean
  /** 새 글을 보낸다. 서버가 POST_CREATED로 되돌려 줄 때 목록에 선다. 못 보내면 false */
  sendPost: (content: string, stockCode: string | null) => boolean
  close: () => void
}

interface Handlers {
  onEvent: (event: CommunityEvent) => void
  onStatus: (status: CommunityStatus) => void
}

const SOCKET_URL: string = import.meta.env.VITE_COMMUNITY_WS_URL ?? ''
/** 구독·보내기 주소(스프링 STOMP 관례 — 서버가 다르게 정하면 여기만 바꾼다) */
const TOPIC = '/topic/community'
const SEND_TO = '/app/community/posts'

function fromPreview(post: CommunityPreviewPost, createdAt: number): CommunityPost {
  return {
    postId: post.id,
    author: post.author,
    stockCode: post.stock?.code ?? null,
    stockName: post.stock?.name ?? null,
    content: post.text,
    createdAt: toIsoTime(createdAt),
    likeCount: post.likes,
    commentCount: post.comments,
  }
}

/**
 * 처음 목록. 서버가 생기면 `GET /api/community/posts`(제안) 자리다 — 지금은 예시 글을 지금 시각 기준으로 지어 준다.
 * 실제 연결 주소가 있어도 목록 API가 생기기 전까지는 예시 글을 쓰지 않는다(섞이면 어느 글이 진짜인지 모른다)
 */
export async function loadCommunityPosts(now: number = Date.now()): Promise<CommunityPost[]> {
  if (SOCKET_URL !== '') return []
  return COMMUNITY_PREVIEW_POSTS.map((post) => fromPreview(post, now - post.minutesAgo * 60_000))
}

/** 서버가 준 글 하나를 검사해 화면 모양으로. 틀리면 null */
export function toCommunityPost(raw: unknown): CommunityPost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const postId = numberFromText(value.postId)
  const createdAt = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : NaN
  if (postId === null || typeof value.author !== 'string' || typeof value.content !== 'string' || Number.isNaN(createdAt)) return null
  const text = (key: string) => (typeof value[key] === 'string' && value[key] !== '' ? (value[key] as string) : null)
  return {
    postId,
    author: value.author,
    stockCode: text('stockCode'),
    stockName: text('stockName'),
    content: value.content,
    createdAt: toIsoTime(createdAt),
    likeCount: Math.max(0, numberFromText(value.likeCount) ?? 0),
    commentCount: Math.max(0, numberFromText(value.commentCount) ?? 0),
  }
}

/**
 * 웹소켓 메시지 본문 하나를 일로. 틀리면 null.
 * @public 이 파일 밖에서는 판정(judge/unit.test.mjs)만 부른다 — 오는 값 거르기를 함수 단위로 잰다
 */
export function toCommunityEvent(raw: unknown): CommunityEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.type === 'POST_CREATED') {
    const post = toCommunityPost(value.post)
    return post === null ? null : { type: 'POST_CREATED', post }
  }
  const postId = numberFromText(value.postId)
  if (postId === null) return null
  if (value.type === 'POST_DELETED') return { type: 'POST_DELETED', postId }
  if (value.type === 'POST_UPDATED') {
    const likeCount = numberFromText(value.likeCount)
    const commentCount = numberFromText(value.commentCount)
    if (likeCount === null || commentCount === null) return null
    return { type: 'POST_UPDATED', postId, likeCount: Math.max(0, likeCount), commentCount: Math.max(0, commentCount) }
  }
  return null
}

/** 연결한다. 서버 주소가 없으면 목업(예시 글을 띄엄띄엄 흘려보낸다) */
export function connectCommunity(handlers: Handlers): CommunityConnection {
  return SOCKET_URL === '' ? connectMock(handlers) : connectStomp(SOCKET_URL, handlers)
}

/** 목업에서 첫 새 글까지·글 사이 간격(판정은 Playwright 시계로 앞당긴다 — judge/community.mjs) */
const MOCK_LIVE_DELAY_MS = { first: 40_000, between: 70_000 }

function connectMock({ onEvent, onStatus }: Handlers): CommunityConnection {
  onStatus('mock')
  let index = 0
  let timer = window.setTimeout(function next() {
    const post = COMMUNITY_PREVIEW_LIVE[index]
    if (post === undefined) return
    index += 1
    onEvent({ type: 'POST_CREATED', post: fromPreview(post, Date.now()) })
    timer = window.setTimeout(next, MOCK_LIVE_DELAY_MS.between)
  }, MOCK_LIVE_DELAY_MS.first)
  return { canSend: () => false, sendPost: () => false, close: () => window.clearTimeout(timer) }
}

/* ── STOMP 1.2(웹소켓 위). 쓰는 프레임은 CONNECT·SUBSCRIBE·SEND·DISCONNECT를 보내고 CONNECTED·MESSAGE·ERROR를 받는 것뿐이다 ── */

function frame(command: string, headers: Record<string, string>, body = ''): string {
  const lines = Object.entries(headers).map(([key, value]) => `${key}:${value.replace(/[\r\n:]/g, ' ')}`)
  return `${command}\n${lines.join('\n')}\n\n${body}\0`
}

function parseFrames(data: string): { command: string; body: string }[] {
  return data
    .split('\0')
    .map((chunk) => chunk.replace(/^\n+/, ''))
    .filter((chunk) => chunk !== '')
    .map((chunk) => {
      const split = chunk.indexOf('\n\n')
      const head = split === -1 ? chunk : chunk.slice(0, split)
      return { command: head.split('\n')[0], body: split === -1 ? '' : chunk.slice(split + 2) }
    })
}

function connectStomp(url: string, { onEvent, onStatus }: Handlers): CommunityConnection {
  let socket: WebSocket | null = null
  let ready = false
  let closed = false
  let retry = 0
  let retryTimer = 0

  const open = () => {
    onStatus(retry === 0 ? 'connecting' : 'reconnecting')
    socket = new WebSocket(url)
    socket.onopen = () => {
      const token = getAccessToken()
      socket?.send(frame('CONNECT', { 'accept-version': '1.2', 'heart-beat': '0,0', ...(token ? { Authorization: `Bearer ${token}` } : {}) }))
    }
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return
      for (const { command, body } of parseFrames(message.data)) {
        if (command === 'CONNECTED') {
          ready = true
          retry = 0
          socket?.send(frame('SUBSCRIBE', { id: 'community-0', destination: TOPIC }))
          onStatus('open')
        } else if (command === 'MESSAGE') {
          let parsed: unknown = null
          try {
            parsed = JSON.parse(body)
          } catch {
            continue
          }
          const event = toCommunityEvent(parsed)
          if (event !== null) onEvent(event)
        }
      }
    }
    // 끊기면 1·2·4…30초 뒤 다시 붙는다. ERROR 프레임 뒤에는 서버가 끊으므로 같은 길로 온다
    socket.onclose = () => {
      ready = false
      socket = null
      if (closed) return
      retry += 1
      onStatus('reconnecting')
      retryTimer = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** (retry - 1)))
    }
  }
  open()

  return {
    canSend: () => ready,
    sendPost: (content, stockCode) => {
      if (!ready || socket === null) return false
      socket.send(frame('SEND', { destination: SEND_TO, 'content-type': 'application/json' }, JSON.stringify({ content, stockCode })))
      return true
    },
    close: () => {
      closed = true
      window.clearTimeout(retryTimer)
      if (socket !== null && ready) socket.send(frame('DISCONNECT', {}))
      socket?.close()
    },
  }
}
