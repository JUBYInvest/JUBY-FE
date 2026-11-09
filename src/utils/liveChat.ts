import type { ChatMessage } from '../api/chat'

/*
 * 홈 전체 채팅의 상태 바꾸기 — 렌더와 상관없는 계산만 둔다(hooks/useLiveChat이 부른다, 단위 판정 judge/unit.test.mjs).
 * 대화는 id로 합치고, 내가 보낸 말은 서버가 /topic으로 되돌려 줄 때까지 "아직 오르지 않은 말"(PendingMessage)로 들고 있다.
 */

/** 내가 보낸 말 중 아직 대화에 오르지 않은 것. 서버가 /topic으로 되돌려 주면 지운다 */
export interface PendingMessage {
  key: number
  text: string
  /** 보낼 차례를 기다림(연결 전·1초 간격) · 보냄(되돌아오기를 기다림) · 실패 */
  state: 'queued' | 'sent' | 'failed'
  /** 실패한 까닭(화면 글) */
  reason: string | null
  /** 토큰이 만료돼 한 번 다시 보냈다 — 또 실패하면 실패로 둔다 */
  resent: boolean
}

/** 서버 실패 code → 화면 글. 모르는 code는 "보내지 못했어요" */
const SEND_ERRORS: Record<string, string> = {
  LIVECHAT400_1: '빈 말은 보낼 수 없어요',
  LIVECHAT400_2: '300자까지 보낼 수 있어요',
  LIVECHAT401_1: '로그인하면 보낼 수 있어요',
  LIVECHAT403_1: '닉네임을 정하면 보낼 수 있어요',
  LIVECHAT429_1: '너무 빨리 보내고 있어요. 잠깐 뒤에 다시 보내 주세요.',
}

/** 보냈는데 오지 않거나 모르는 실패일 때의 글 */
export const SEND_FAILED = '보내지 못했어요'

/** 같은 말이 두 번 오지 않게 id로 합치고 오래된 순으로 세운다 */
export function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/**
 * 돌아온 말이 내가 보낸 어느 말인가 — 같은 글의 가장 오래된 "보냄", 없으면 "실패"(기다리다 실패로 바꾼 뒤 늦게 온 것 — 다시 보내면 두 번 오른다).
 * 닉네임을 모르면(nickname undefined) 글만으로 맞추고, 알면 다른 사람의 말은 맞추지 않는다
 */
export function findEcho(pending: readonly PendingMessage[], message: ChatMessage, nickname: string | null | undefined): PendingMessage | undefined {
  if (nickname !== undefined && message.author !== nickname) return undefined
  return (
    pending.find((item) => item.state === 'sent' && item.text === message.text) ??
    pending.find((item) => item.state === 'failed' && item.text === message.text)
  )
}

/**
 * 서버가 "보냄" 말 하나를 거절했다(/user/queue/errors). 토큰이 만료돼 거절됐으면 다시 붙은 뒤 한 번 더 보내려고 줄에 다시 세우고
 * (api/chat.ts가 새 토큰으로 다시 붙는다), 그 밖에는 까닭과 함께 실패로 둔다
 */
export function afterSendError(item: PendingMessage, code: string): PendingMessage {
  if (code.startsWith('AUTH401') && !item.resent) return { ...item, state: 'queued', resent: true }
  return { ...item, state: 'failed', reason: SEND_ERRORS[code] ?? SEND_FAILED }
}
