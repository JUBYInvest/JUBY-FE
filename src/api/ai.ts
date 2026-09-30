import { get, malformedResponse, patch, post, remove } from './client'
import type { AskResult, ChatMessage, ChatSession, ChatSessionDetail } from '../types/ai'

/**
 * AI 주가분석 창구. 질문과 대화방 모두 실제 API다(JUBY-BE dev `0c79ec5`, 2026-09-30). 전부 로그인해야 한다.
 *
 * - 대화방: `GET /api/chat-sessions`(최근 대화 순), `POST /api/chat-sessions`(빈 방, 제목 '새 대화', 201),
 *   `GET /api/chat-sessions/{id}`(메시지 작성 순. 없는 방 404 `CHAT404_1`, 남의 방 403 `CHAT403_1`),
 *   `PATCH /api/chat-sessions/{id}`(제목 바꾸기), `DELETE /api/chat-sessions/{id}`(방과 메시지를 모두 지움). 없는 방·남의 방은 같은 404·403.
 * - 질문: `POST /api/open-ai/ask`에 `chatSessionId`를 실으면 그 방에 이어 저장하고 **앞 대화를 맥락으로 쓴다**. 첫 질문이면 서버가
 *   질문 앞 30자로 방 제목을 붙인다. 같은 방에서 앞 답을 만드는 중이면 409 `CHAT409_1`이고 질문은 저장되지 않는다.
 *   성향을 안 정한 회원이면 404 `MEMBER404_2`. 답 생성이 실패하면(502) 질문만 방에 남는다.
 *   stockName은 비워 보내면 서버가 질문(과 앞 대화)에서 종목을 찾는다.
 */

/** 서버 SessionSummary(목록 한 줄, 만들기·제목 바꾸기 응답) */
interface SessionSummaryResponse {
  chatSessionId?: number | null
  title?: string | null
  updatedAt?: string | null
}

interface SessionDetailResponse extends SessionSummaryResponse {
  messages?: (MessageResponse | null)[] | null
}

interface MessageResponse {
  messageId?: number | null
  role?: string | null
  content?: string | null
  createdAt?: string | null
}

interface AskResponse {
  answer?: string | null
  chatSessionId?: number | null
  messageId?: number | null
}

const DEFAULT_TITLE = '새 대화'
/** 서버 ChatService의 MAX_TITLE_LENGTH. 사람이 붙인 제목은 여기서 자르고, 첫 질문으로 지은 제목은 30자 + '…'다 */
export const TITLE_MAX_LENGTH = 30

/** 사람이 붙인 제목을 서버처럼 다듬는다(앞뒤 공백을 떼고 이어진 공백을 하나로, 30자까지). 바뀐 게 없는지도 이걸로 가른다 */
export function normalizeTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX_LENGTH)
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 방 번호가 없거나 틀리면 null(그 줄은 뺀다). 제목이 비면 서버 기본값과 같은 '새 대화'로 적는다 */
function toSession(row: SessionSummaryResponse | null | undefined): ChatSession | null {
  if (typeof row !== 'object' || row === null || !isId(row.chatSessionId)) return null
  const title = typeof row.title === 'string' && row.title.trim() !== '' ? row.title : DEFAULT_TITLE
  return { sessionId: row.chatSessionId, title }
}

/** 말한 쪽이나 글이 틀린 메시지는 null(그 말풍선은 뺀다). 빈 말풍선이나 엉뚱한 쪽 말풍선을 그리지 않는다 */
function toMessage(row: MessageResponse | null): ChatMessage | null {
  if (typeof row !== 'object' || row === null || typeof row.content !== 'string') return null
  const role = row.role === 'USER' ? 'user' : row.role === 'ASSISTANT' ? 'assistant' : null
  if (role === null || !isId(row.messageId)) return null
  return {
    messageId: row.messageId,
    role,
    content: row.content,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
  }
}

/**
 * 내 대화방 목록(최근 대화 순). AI 화면이 들어오자마자 부르므로 401이어도 로그인 화면으로 끌고 가지 않는다
 * (공개 화면 규칙 — 만료된 토큰이면 client.ts가 먼저 재발급해 본다).
 */
export async function getSessions(): Promise<ChatSession[]> {
  const rows = await get<(SessionSummaryResponse | null)[] | null>('/api/chat-sessions', {
    ignoreUnauthorized: true,
  })
  if (!Array.isArray(rows)) throw malformedResponse()
  const sessions = rows.flatMap((row) => toSession(row) ?? [])
  if (sessions.length < rows.length) {
    console.warn(`번호가 틀린 대화방 ${rows.length - sessions.length}개를 뺐습니다`)
  }
  return sessions
}

/** 빈 대화방을 만든다. 제목은 '새 대화'로 오고, 첫 질문이 들어가면 서버가 바꾼다 */
export async function createSession(): Promise<ChatSession> {
  const session = toSession(await post<SessionSummaryResponse | null>('/api/chat-sessions', {}))
  if (session === null) throw malformedResponse()
  return session
}

/**
 * 대화방 제목을 바꾼다. 빈 제목은 서버가 400으로 막으므로 부르는 쪽이 거른다. 서버는 바꾼 시각을 최근 대화 시각으로도
 * 적어 그 방이 목록 맨 위로 간다.
 */
export async function renameSession(sessionId: number, title: string): Promise<ChatSession> {
  const sent = normalizeTitle(title)
  const row = await patch<SessionSummaryResponse | null>(`/api/chat-sessions/${sessionId}`, { title: sent })
  // 200이면 서버는 이미 바꿨다. 응답에 제목이 비어 오면 보낸 제목을 쓴다
  const saved = typeof row?.title === 'string' && row.title.trim() !== '' ? row.title : sent
  return { sessionId, title: saved }
}

/** 대화방과 그 안의 메시지를 모두 지운다. 되돌릴 수 없다 */
export async function deleteSession(sessionId: number): Promise<void> {
  await remove<unknown>(`/api/chat-sessions/${sessionId}`)
}

/** 대화방의 전체 메시지(작성 순) */
export async function getSessionDetail(sessionId: number): Promise<ChatSessionDetail> {
  const detail = await get<SessionDetailResponse | null>(`/api/chat-sessions/${sessionId}`)
  const session = toSession(detail)
  if (session === null || !Array.isArray(detail?.messages)) throw malformedResponse()
  const messages = detail.messages.flatMap((row) => toMessage(row) ?? [])
  if (messages.length < detail.messages.length) {
    console.warn(`모양이 틀린 메시지 ${detail.messages.length - messages.length}개를 뺐습니다`, sessionId)
  }
  return { ...session, messages }
}

/**
 * 질문을 보내고 답을 받는다. sessionId의 대화방에 이어 저장되고, 서버는 그 방의 앞 대화를 맥락으로 쓴다.
 * 새 대화는 화면이 createSession으로 방부터 만든 뒤 부른다(AiPage) — 방 없이 물었다가 답이 실패하면 서버에 질문만 남은 방이
 * 생기는데 그 번호를 몰라, 다시 시도가 또 다른 방을 만든다.
 */
export async function ask(
  question: string,
  stockName: string,
  sessionId: number,
): Promise<AskResult> {
  const result = await post<AskResponse | null>(
    '/api/open-ai/ask',
    {
      question,
      // 빈 문자열을 보내면 서버가 "종목명 있음"으로 오해할 수 있다. 없으면 null로 비운다
      stockName: stockName === '' ? null : stockName,
      chatSessionId: sessionId,
    },
    /*
     * 제한 시간을 두지 않고 답이 올 때까지 기다린다. 서버가 AI를 두 번 차례로 부르고(질문 분류 → 답)
     * 자세히 쓰라고 시키므로 기본 12초를 넘기기 쉽다. 12초에 끊으면 서버는 계속 답을 만드는데
     * 화면은 실패로 뜨고, 다시 시도까지 끊기면 차단기(client.ts)가 걸려 15초 동안 홈 시세표까지 막힌다.
     */
    { timeoutMs: null },
  )
  // 본문이 객체가 아니면 다른 API처럼 응답 모양 오류로 던진다. 답이 빈 건 화면이 "답변을 가져오지 못했어요 + 다시 시도"로 받는다
  if (typeof result !== 'object' || result === null) throw malformedResponse()
  return {
    sessionId: isId(result.chatSessionId) ? result.chatSessionId : sessionId,
    answer: typeof result.answer === 'string' ? result.answer : '',
  }
}
