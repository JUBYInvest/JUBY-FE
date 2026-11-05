import { CHAT_PREVIEW_HISTORY, CHAT_PREVIEW_LIVE } from '../content/chatPreview'

/*
 * 홈 전체 채팅. 채팅 서버가 아직 없어 목업이다 — 예시 대화를 보이고, 몇십 초마다 예시 말이 들어오고, 보낸 말은 이 화면에만 붙는다.
 * 서버가 생기면 이 파일만 고친다: loadChatHistory(처음 대화)와 connectChat(새 말 받기·보내기)의 모양은 그대로 두고 속만 바꾼다.
 */

export interface ChatMessage {
  id: string
  author: string
  text: string
  /** 보낸 때(ms) */
  at: number
  mine: boolean
}

/** 한 번에 보낼 수 있는 글자 수 */
export const CHAT_LIMIT = 200

export interface ChatConnection {
  /** 말을 보낸다. 못 보냈으면 false */
  send: (text: string, author: string) => boolean
  close: () => void
}

/** 지금은 늘 예시다 — 화면이 "예시"라고 밝힌다 */
export const CHAT_IS_MOCK = true

/** 처음 보이는 대화(오래된 말이 앞) */
export function loadChatHistory(now: number = Date.now()): ChatMessage[] {
  return CHAT_PREVIEW_HISTORY.map((message, index) => ({
    id: `history-${index}`,
    author: message.author,
    text: message.text,
    at: now - message.minutesAgo * 60_000,
    mine: false,
  }))
}

/** 목업에서 예시 말이 들어오는 간격(판정은 Playwright 시계로 앞당긴다) */
const MOCK_LIVE_MS = { first: 20_000, between: 45_000 }

export function connectChat(onMessage: (message: ChatMessage) => void): ChatConnection {
  let index = 0
  let sent = 0
  let timer = window.setTimeout(function next() {
    const line = CHAT_PREVIEW_LIVE[index]
    if (line === undefined) return
    index += 1
    onMessage({ id: `live-${index}`, author: line[0], text: line[1], at: Date.now(), mine: false })
    timer = window.setTimeout(next, MOCK_LIVE_MS.between)
  }, MOCK_LIVE_MS.first)
  return {
    send: (text, author) => {
      sent += 1
      onMessage({ id: `mine-${sent}`, author, text, at: Date.now(), mine: true })
      return true
    },
    close: () => window.clearTimeout(timer),
  }
}
