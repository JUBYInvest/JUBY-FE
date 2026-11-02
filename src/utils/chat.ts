import { toIsoTime, toKoreanClock } from './date'

/** 채팅 말 하나(홈 커뮤니티 예시 대화 — src/content/communityPreview.ts) */
export interface ChatMessageSource {
  id: number
  /** 말한 사람의 별명 */
  author: string
  /** 이야기하는 종목 이름. 없으면 null */
  stock: string | null
  text: string
  /** 몇 분 전 말인지. 지금 시각에서 빼서 "오전 10:48"처럼 보인다 */
  minutesAgo: number
}

/** 화면에 그리는 줄 */
export interface ChatRow {
  id: number
  author: string
  /** 이름 첫 글자 동그라미. 이모지·합친 글자도 반으로 자르지 않는다 */
  initial: string
  stock: string | null
  text: string
  /** "오전 10:48". 시각을 지을 수 없으면 "" */
  time: string
  /** `<time dateTime>`. 시각을 지을 수 없으면 "" */
  iso: string
  /** 앞 말과 같은 사람이 같은 분에 이어 말했다 — 이름·시각을 다시 보이지 않는다(메신저와 같은 규칙) */
  continued: boolean
}

/**
 * 말 목록을 화면 줄로. 오래된 말이 위(채팅은 아래가 최신)라 몇 분 전인지로 다시 세운다 — 사용자가 고치는 파일이라 순서가 틀려도 된다.
 * 같은 사람이라도 다른 분에 한 말은 묶지 않는다(묶으면 뒤 말의 시각이 사라져 앞 말과 같은 때로 읽힌다).
 * 시각을 지을 수 없는 값이 와도 던지지 않고 시각만 비운다 — 홈 오른쪽 열은 구역 경계 밖이라 던지면 홈 전체가 오류 화면이 된다
 */
export function toChatRows(messages: readonly ChatMessageSource[], now: number): ChatRow[] {
  const age = (message: ChatMessageSource) => (Number.isFinite(message.minutesAgo) ? message.minutesAgo : 0)
  const ordered = [...messages].sort((a, b) => age(b) - age(a))
  const rows: ChatRow[] = []
  for (const message of ordered) {
    const at = now - message.minutesAgo * 60_000
    const time = toKoreanClock(at)
    const previous = rows.at(-1)
    rows.push({
      id: message.id,
      author: message.author,
      initial: Array.from(message.author)[0] ?? '',
      stock: message.stock,
      text: message.text,
      time,
      iso: toIsoTime(at),
      continued: previous !== undefined && previous.author === message.author && previous.time === time && time !== '',
    })
  }
  return rows
}
