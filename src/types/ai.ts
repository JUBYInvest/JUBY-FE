/** 말한 쪽. 서버는 `USER`·`ASSISTANT`로 준다(api/ai.ts가 옮긴다) */
export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  messageId: number
  role: ChatRole
  content: string
  /** ISO 8601. 화면에는 아직 안 쓴다 */
  createdAt: string
}

/** 사이드바 한 줄. 제목은 서버가 첫 질문 앞 30자로 붙인다(빈 방은 '새 대화') */
export interface ChatSession {
  sessionId: number
  title: string
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[]
}

/** 질문 전송 결과. 답이 비어 오면 answer가 ""다(화면이 실패로 다룬다) */
export interface AskResult {
  sessionId: number
  answer: string
}
