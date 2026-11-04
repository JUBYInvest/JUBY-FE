import { COMMUNITY_PREVIEW_LIVE, COMMUNITY_PREVIEW_POSTS, type CommunityPreviewPost } from '../content/communityPreview'
import { getAccessToken } from '../utils/auth'
import { toIsoTime } from '../utils/date'
import { numberFromText } from '../utils/format'
import { safeLink } from '../utils/link'

/*
 * 커뮤니티(2026-11-03 사용자 요청 "토스증권처럼 게시판으로… 웹소켓으로 받을 예정이므로 웹소켓을 받을 자리만 남기고 목업을").
 *
 * 처음 목록은 한 번 받고(지금은 예시 글 — REST 자리), 그 뒤 새 글·공감 수·지운 글은 웹소켓으로 받는다. 화면은 이 파일만 부른다.
 * 백엔드에는 아직 커뮤니티가 없다(JUBY-BE `feature/websocket/#73`은 증권사 실시간 시세용이고, spring-boot-starter-websocket·stomp를 들였다).
 * 그래서 연결은 스프링이 기본으로 주는 STOMP(웹소켓 위)로 짓는다 — 라이브러리를 들이지 않고 프레임 몇 개만 직접 쓴다.
 * 주고받는 모양은 docs/커뮤니티-웹소켓-제안.md에 적었다. 서버 주소를 VITE_COMMUNITY_WS_URL에 넣으면 목업 대신 실제로 붙는다.
 * 2026-11-04 사용자가 토스증권 앱 캡처로 "커뮤니티 글쓰기 개념"을 짚어 글이 제목 + 본문(+ 사진)이 됐다 — 예전엔 본문 한 칸이었다.
 */

export interface CommunityPost {
  postId: number
  author: string
  stockCode: string | null
  stockName: string | null
  /** 글 제목. 제목 없이 오는 글(11-03 모양)은 null — 화면은 본문을 제목 자리에 둔다 */
  title: string | null
  content: string
  /** 붙인 사진 주소(http·https만, 서버 글은 safeLink로 거른다). 없으면 빈 배열 */
  imageUrls: string[]
  /** ISO 시각 */
  createdAt: string
  likeCount: number
  commentCount: number
}

/** 쓴 글. 서버로 보내는 모양(SEND /app/community/posts) */
export interface CommunityDraft {
  title: string
  content: string
  stockCode: string | null
}

/** 제목·본문 길이 한도. 글쓰기 칸의 maxLength이고 서버에 건넨 제안과 같다 */
export const COMMUNITY_LIMITS = { title: 40, content: 1000 } as const

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
  sendPost: (draft: CommunityDraft) => boolean
  /**
   * 당겨서 새로고침(useCommunityFeed refresh)이 지금 받아 가는 새 글. 목업은 다음 예시 새 글을 바로 내준다(그다음 글까지의 간격은 다시 센다).
   * 실제 연결은 서버가 밀어 주므로 빈 목록이다 — 처음 목록은 useCommunityFeed가 다시 받는다
   */
  pullNow: () => CommunityPost[]
  close: () => void
}

interface Handlers {
  onEvent: (event: CommunityEvent) => void
  onStatus: (status: CommunityStatus) => void
}

const SOCKET_URL: string = import.meta.env.VITE_COMMUNITY_WS_URL ?? ''

/** 처음 그릴 때의 연결 상태. 서버 주소가 없으면 목업이다 — "연결하는 중"으로 시작하면 목업인데도 첫 그림에 그 글과 로그인 단추가 섰다(코드 점검 D8) */
export const initialCommunityStatus = (): CommunityStatus => (SOCKET_URL === '' ? 'mock' : 'connecting')
/** 구독·보내기 주소(스프링 STOMP 관례 — 서버가 다르게 정하면 여기만 바꾼다) */
const TOPIC = '/topic/community'
const SEND_TO = '/app/community/posts'

function fromPreview(post: CommunityPreviewPost, createdAt: number): CommunityPost {
  return {
    postId: post.id,
    author: post.author,
    stockCode: post.stock?.code ?? null,
    stockName: post.stock?.name ?? null,
    title: post.title,
    content: post.text,
    imageUrls: post.images ?? [],
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

/**
 * 글 하나(글 상세 화면이 주소로 열렸을 때). 서버가 생기면 `GET /api/community/posts/{postId}`(제안) 자리다 —
 * 지금은 예시 글에서 찾는다. 보고 있는 동안 들어온 예시 새 글은 지금 시각에 들어온 것으로 짓는다. 실제 연결 주소가 있으면 아직 받을 길이 없어 null
 */
export async function loadCommunityPost(postId: number, now: number = Date.now()): Promise<CommunityPost | null> {
  if (SOCKET_URL !== '') return null
  const post = [...COMMUNITY_PREVIEW_POSTS, ...COMMUNITY_PREVIEW_LIVE].find((item) => item.id === postId)
  return post === undefined ? null : fromPreview(post, now - post.minutesAgo * 60_000)
}

/** 서버가 준 글 하나를 검사해 화면 모양으로. 틀리면 null */
export function toCommunityPost(raw: unknown): CommunityPost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  const postId = numberFromText(value.postId)
  const createdAt = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : NaN
  if (postId === null || typeof value.author !== 'string' || typeof value.content !== 'string' || Number.isNaN(createdAt)) return null
  const text = (key: string) => (typeof value[key] === 'string' && (value[key] as string).trim() !== '' ? (value[key] as string) : null)
  const images = Array.isArray(value.imageUrls) ? value.imageUrls.map(safeLink).filter((url) => url !== '') : []
  return {
    postId,
    author: value.author,
    stockCode: text('stockCode'),
    stockName: text('stockName'),
    title: text('title'),
    content: value.content,
    imageUrls: images,
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
  let timer = 0
  /** 다음 예시 새 글(다 흘렸으면 null). 그다음 글은 이때부터 다시 센다 */
  const take = (): CommunityPost | null => {
    window.clearTimeout(timer)
    const post = COMMUNITY_PREVIEW_LIVE[index]
    if (post === undefined) return null
    index += 1
    timer = window.setTimeout(next, MOCK_LIVE_DELAY_MS.between)
    return fromPreview(post, Date.now())
  }
  function next() {
    const post = take()
    if (post !== null) onEvent({ type: 'POST_CREATED', post })
  }
  timer = window.setTimeout(next, MOCK_LIVE_DELAY_MS.first)
  return {
    canSend: () => false,
    sendPost: () => false,
    pullNow: () => {
      const post = take()
      return post === null ? [] : [post]
    },
    close: () => window.clearTimeout(timer),
  }
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
    pullNow: () => [],
    sendPost: ({ title, content, stockCode }) => {
      if (!ready || socket === null) return false
      socket.send(frame('SEND', { destination: SEND_TO, 'content-type': 'application/json' }, JSON.stringify({ title, content, stockCode })))
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
