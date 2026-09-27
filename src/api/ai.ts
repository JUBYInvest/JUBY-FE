import { malformedResponse, post } from './client'
import { delay } from '../utils/async'
import type { AskResult, ChatMessage, ChatSession, ChatSessionDetail } from '../types/ai'

/**
 * AI 주가분석 창구.
 *
 * **질문(ask)만 실제 API고, 대화방 목록·상세는 아직 mock이다.**
 *
 * `POST /api/open-ai/ask` 는 `{ answer }` 를 돌려준다(2026-09-18 확인). 로그인이 필요하고,
 * 성향을 안 정한 회원이면 404(MEMBER404_2)라 화면이 성향테스트로 안내한다.
 * stockName은 비워 보내면 서버가 질문에서 종목을 알아서 찾는다.
 *
 * 대화방(`/api/chat-sessions` 5종)은 백엔드 진행 중이라 붙일 곳이 없다.
 * 그래서 새 대화의 sessionId·title은 화면에서 지어낸다. 서버가 발급하기 시작하면
 * 아래 mock 함수들만 실제 호출로 갈아끼운다. 화면 코드는 손대지 않는다.
 *
 * 응답 형태는 요구사항서에 적어둔 가정을 따른다. 명세가 확정되면 문서와 이 파일을 함께 고친다.
 */

const MOCK_SESSIONS: ChatSession[] = [
  { sessionId: 1, title: '한화디펜스 전쟁 영향' },
  { sessionId: 2, title: 'HYBE 콘서트 성공 여부' },
  { sessionId: 3, title: 'LG에너지솔루션 분석' },
  { sessionId: 4, title: '에스오일 석유화학 관련' },
  { sessionId: 5, title: 'SK하이닉스 사업분석' },
  { sessionId: 6, title: 'GS건설 수주사업' },
]

/** 새 세션에 붙일 번호. 서버가 발급하기 시작하면 필요 없어진다 */
let nextSessionId = MOCK_SESSIONS.length + 1

/** GET /v1/ai/sessions 로 교체 */
export async function getSessions(): Promise<ChatSession[]> {
  await delay(300)
  return MOCK_SESSIONS
}

/** GET /v1/ai/sessions/{sessionId} 로 교체 */
export async function getSessionDetail(
  sessionId: number,
): Promise<ChatSessionDetail> {
  await delay(500)

  const session =
    MOCK_SESSIONS.find((item) => item.sessionId === sessionId) ??
    { sessionId, title: '대화' }

  return { ...session, messages: mockMessages(session.title) }
}

/**
 * 질문을 보내고 답을 받는다. **실제 API다.**
 *
 * 대화 이어가기는 아직 서버에 없다. sessionId를 받아도 서버에는 보내지 않고,
 * 화면이 같은 방에 말풍선을 이어 붙이는 데만 쓴다. `/api/chat-sessions`가 생기면
 * 그쪽 POST로 바꾸고 sessionId를 함께 보낸다.
 */
export async function ask(
  question: string,
  stockName: string,
  sessionId?: number,
): Promise<AskResult> {
  const result = await post<{ answer: string } | null>(
    '/api/open-ai/ask',
    {
      question,
      // 빈 문자열을 보내면 서버가 "종목명 있음"으로 오해할 수 있다. 없으면 null로 비운다
      stockName: stockName === '' ? null : stockName,
    },
    /*
     * 제한 시간을 두지 않고 답이 올 때까지 기다린다. 서버가 AI를 두 번 차례로 부르고(질문 분류 → 답)
     * 자세히 쓰라고 시키므로 기본 12초를 넘기기 쉽다. 12초에 끊으면 서버는 계속 답을 만드는데
     * 화면은 실패로 뜨고, 다시 시도까지 끊기면 차단기(client.ts)가 걸려 15초 동안 홈 시세표까지 막힌다.
     */
    { timeoutMs: null },
  )
  // 본문이 객체가 아니면 다른 API처럼 응답 모양 오류로 던진다. 구조 분해하면 null에서 TypeError가 났다.
  // 답이 빈 건 여기서 막지 않는다 — 화면이 "답변을 가져오지 못했어요 + 다시 시도"로 받는다
  if (typeof result !== 'object' || result === null) throw malformedResponse()
  const { answer } = result

  return {
    sessionId: sessionId ?? nextSessionId++,
    /* 서버는 아직 제목을 안 만든다. 첫 질문 앞부분을 잘라 쓴다 */
    title: toTitle(question),
    answer,
  }
}

function toTitle(question: string): string {
  const trimmed = question.trim()
  return trimmed.length <= 20 ? trimmed : `${trimmed.slice(0, 20)}…`
}

/**
 * 사용자와 AI가 번갈아 나오는 예시 대화.
 * 말풍선 폭·줄바꿈·스크롤이 실제 길이에서 어떻게 보이는지 확인하려고 길이를 섞어 뒀다.
 */
function mockMessages(title: string): ChatMessage[] {
  const contents: string[] = [
    `${title}에 대해 알려줘.`,
    `(예시 응답) ${title} 관련해서 확인된 내용을 정리해 드릴게요.\n\n` +
      `아직 백엔드 연동 전이라 실제 분석 결과가 아닙니다. ` +
      `연동이 끝나면 이 자리에 뉴스 검색(RAG)을 거친 답변이 표시됩니다.`,
    '그럼 지금 사는 건 어때?',
    `(예시 응답) 투자 판단은 직접 하셔야 해요.\n` +
      `다만 확인해두면 좋은 지표는 알려드릴 수 있습니다.`,
  ]

  return contents.map((content, index) => ({
    messageId: index + 1,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content,
    /* 예시 데이터라 시각은 의미가 없다. 화면에도 아직 안 쓴다 */
    createdAt: new Date().toISOString(),
  }))
}
