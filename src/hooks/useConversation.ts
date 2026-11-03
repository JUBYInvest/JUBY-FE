import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TITLE, ask, createSession, getSessionDetail } from '../api/ai'
import { ApiError } from '../api/client'
import type { PendingState } from '../components/ChatMessages'
import type { ChatMessage } from '../types/ai'
import { isRoomGone, type ChatRooms } from './useChatRooms'

export const LOGIN_HINT = '로그인하면 질문할 수 있어요.'
export const NO_PERSONALITY_HINT = '투자성향을 먼저 정해야 답할 수 있어요.'
/** 같은 대화방에서 앞 질문의 답을 서버가 아직 만드는 중(409 CHAT409_1). 질문은 저장되지 않았다 */
const BUSY_HINT = '앞 질문의 답을 아직 만들고 있어요. 조금 뒤에 다시 시도해 주세요.'
/** 다른 탭에서 지웠거나 내 것이 아닌 대화방(404 CHAT404_1·403 CHAT403_1) */
const ROOM_GONE_HINT = '이 대화방을 찾을 수 없어요. 새 대화에서 다시 물어봐 주세요.'

/** 보낼 질문과, 함께 실을 종목명(종목 상세에서 온 첫 질문만 — api/ai.ts ask) */
export interface Question {
  text: string
  stockName: string | null
}

export type DetailState = 'idle' | 'loading' | 'error'

interface Conversation {
  /** 보고 있는 방. 새 대화면 null */
  sessionId: number | null
  messages: ChatMessage[]
  detailState: DetailState
  pending: PendingState
  /** 입력칸 위 한 줄 안내. 비면 없음 */
  notice: string
  showNotice: (text: string) => void
  startNewChat: () => void
  /** 방을 연다(사이드바·마이페이지 '최근 AI 대화'). 보던 방을 또 누른 것이면 다시 받지 않는다 */
  select: (roomId: number) => void
  /** 질문을 띄우고 보낸다. 받았으면 true(화면이 입력칸을 비운다), 보낼 수 없는 상태면 false */
  submit: (question: Question) => boolean
  /** 그만 기다리기 */
  stop: () => void
  /** 다시 시도 */
  retry: () => void
  /** 목록에서 뺀 방이 보던 방이면 새 대화로 돌린다. notice가 있으면 보던 방이 아니어도 새 대화로 돌리고 알린다 */
  leaveRoom: (roomId: number, notice?: string) => void
}

/**
 * AI 화면의 대화 한 칸(2026-10-31 pages/AiPage.tsx에서 나눔) — 보고 있는 방의 말풍선과 질문 보내기·그만 기다리기·다시 시도.
 * 사이드바 목록(hooks/useChatRooms)과는 답 뒤 목록 다시 받기·만든 방 올리기·없어진 방 빼기로 만난다.
 *
 * 번호 셋으로 늦게 온 것을 버린다(CLAUDE.md "늦게 온 응답"):
 * - askSeq: 질문마다·방을 바꾸거나 그만 기다릴 때 올라간다. 답·방 내용이 도착했을 때 번호가 다르면 버린다 — 안 그러면 A방에 물은 답이
 *   B방 말풍선 뒤에 붙고, 방을 누르고 곧바로 새 대화를 열면 늦게 온 그 방 말풍선이 새 대화를 채운다.
 * - roomSeq: 보던 자리(방·새 대화)가 바뀔 때만 올라간다. askSeq는 "그만 기다리기"에도 올라가지만 자리는 그대로다 — 방을 만드는 사이
 *   그만 기다렸어도 자리가 그대로면 만든 방을 쓴다(안 그러면 다시 시도가 방을 또 만들어 빈 방이 남았다).
 * - sessionIdRef: 서버를 기다린 뒤 "보던 방이었나"를 가를 때. 함수가 만들어질 때의 sessionId는 기다리는 사이 낡을 수 있다.
 */
export function useConversation(loggedIn: boolean, rooms: ChatRooms): Conversation {
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [detailState, setDetailState] = useState<DetailState>('idle')
  const [pending, setPending] = useState<PendingState>(null)
  const [notice, setNotice] = useState('')

  /*
   * 화면에서 바로 만든 메시지에 붙일 번호. 서버가 주는 번호는 양수라서 음수로 내려가며 쓴다.
   * 겹치면 React가 두 말풍선을 같은 것으로 보고 하나를 지운다.
   */
  const localIdRef = useRef(-1)
  /** 실패한 질문. '다시 시도'가 이걸 그대로 다시 보낸다(실었던 종목명도 그대로) */
  const lastAskRef = useRef<Question | null>(null)
  const askSeqRef = useRef(0)
  const roomSeqRef = useRef(0)
  const sessionIdRef = useRef(sessionId)
  useEffect(() => {
    sessionIdRef.current = sessionId
  })
  /** 지금 기다리는 질문 요청. "그만 기다리기"가 끊는다(연결을 닫을 뿐 서버는 답을 계속 만든다) */
  const abortRef = useRef<AbortController | null>(null)

  // 로그아웃하면(다른 탭 포함) 보던 대화를 거둔다 — 계정의 대화라 로그아웃한 화면에 남으면 안 된다
  useEffect(() => {
    if (!loggedIn) startNewChat()
    // 로그인 여부가 바뀔 때만 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  function nextLocalId(): number {
    const id = localIdRef.current
    localIdRef.current -= 1
    return id
  }

  function startNewChat() {
    askSeqRef.current += 1
    roomSeqRef.current += 1
    setSessionId(null)
    setMessages([])
    setDetailState('idle')
    setPending(null)
    setNotice('')
  }

  function leaveRoom(roomId: number, roomNotice?: string) {
    // 번호가 올라가 그 방에 기다리던 답이 늦게 와도 버린다
    if (roomId === sessionIdRef.current || roomNotice !== undefined) startNewChat()
    if (roomNotice !== undefined) setNotice(roomNotice)
  }

  /** 없어진 방(다른 탭에서 지움·남의 방): 목록에서 빼고 새 대화로 돌리며 알린다 */
  function dropGoneRoom(roomId: number) {
    rooms.drop(roomId)
    leaveRoom(roomId, ROOM_GONE_HINT)
  }

  function select(roomId: number) {
    // 보고 있는 세션을 또 누른 것뿐이다. 다시 받아올 이유가 없다
    if (roomId === sessionId && detailState !== 'error') return

    askSeqRef.current += 1
    roomSeqRef.current += 1
    const seq = askSeqRef.current
    setSessionId(roomId)
    setPending(null)
    setNotice('')
    setDetailState('loading')

    getSessionDetail(roomId)
      .then((detail) => {
        // 받는 사이 다른 방이나 새 대화로 옮겼다
        if (seq !== askSeqRef.current) return
        setMessages(detail.messages)
        setDetailState('idle')
      })
      .catch((error: unknown) => {
        if (seq !== askSeqRef.current) return
        console.warn('AI 대화 조회 실패', error)
        // 다른 탭에서 지운 방이다. 다시 시도해도 같으니 목록에서 뺀다
        if (isRoomGone(error)) {
          dropGoneRoom(roomId)
          return
        }
        setDetailState('error')
      })
  }

  /**
   * @param asked 방금 띄운 내 말풍선(submit이 만든다). 그만 기다린 방을 되살릴 때 서버 메시지 뒤에 다시 붙인다
   * @param options.synced 방을 이미 다시 받았다(retry). 여기서 또 받지 않는다
   */
  async function send({ text, stockName }: Question, asked?: ChatMessage, options: { synced?: boolean } = {}) {
    lastAskRef.current = { text, stockName }
    // 그만 기다린 방이면 서버가 그 사이 끝낸 앞 답을 먼저 되살린다 — 안 그러면 새 답 뒤로 밀려 방을 다시 열기 전까지 안 보인다
    const wasStopped = pending === 'stopped' && options.synced !== true
    /*
     * 답이 온 뒤 대화방 목록을 다시 받을지. 서버는 방의 첫 질문으로만 제목을 짓는다 — 새로 만든 방이거나 아직 '새 대화'인 방이면
     * 받아서 지어진 제목을 쓰고, 아니면 그 방을 맨 위로 올리기만 한다(목록은 최근 대화 순). 예전엔 답마다 목록을 통째로 다시 받았다.
     * 목록에 그 방이 없어도(목록을 못 받았거나 아직 안 왔다) 다시 받는다 — 안 그러면 처음 목록이 실패한 화면은 끝까지 안 채워진다.
     */
    const answeredRoomInList = rooms.rooms.find((item) => item.sessionId === sessionId)
    const needsTitle =
      sessionId === null || answeredRoomInList === undefined || answeredRoomInList.title === DEFAULT_TITLE
    setPending('loading')
    askSeqRef.current += 1
    const seq = askSeqRef.current
    const roomSeq = roomSeqRef.current

    // 이 질문이 들어간 방. 실패하면 목록에서 뺄 때 쓴다
    let roomId = sessionId
    try {
      if (wasStopped && roomId !== null) {
        try {
          const detail = await getSessionDetail(roomId)
          if (seq !== askSeqRef.current) return
          setMessages(asked === undefined ? detail.messages : [...detail.messages, asked])
        } catch (error: unknown) {
          if (seq !== askSeqRef.current) return
          // 되살리지 못해도 질문은 보낸다. 앞 답은 방을 다시 열면 보인다
          console.warn('AI 대화 다시 확인 실패', error)
        }
      }

      /*
       * 새 대화면 방부터 만든다. 방 없이 물으면 서버가 방을 만들어 주지만, 답이 실패하면(502) 질문만 남은 그 방의 번호를
       * 몰라 다시 시도가 또 다른 방을 만든다. 만든 방은 곧바로 목록 맨 위에 올린다(제목은 첫 답 뒤에 서버 것으로 바뀐다).
       * 만드는 사이 그만 기다렸어도(askSeq가 올라감) 보던 자리가 새 대화 그대로면(roomSeq) 만든 방을 쓴다 —
       * 안 그러면 다시 시도가 방을 또 만들어 서버에 빈 '새 대화' 방이 남았다.
       */
      if (roomId === null) {
        const room = await createSession()
        if (roomSeq !== roomSeqRef.current) return
        roomId = room.sessionId
        setSessionId(room.sessionId)
        rooms.putOnTop(room)
        if (seq !== askSeqRef.current) return
      }

      // 같은 방 번호를 실어 보내면 서버가 앞 대화를 맥락으로 쓴다("그 종목은?")
      // 종목명은 종목 상세에서 온 첫 질문만 싣는다. 나머지는 서버가 질문과 앞 대화에서 찾는다(api/ai.ts ask)
      const controller = new AbortController()
      abortRef.current = controller
      const result = await ask(text, roomId, stockName, controller.signal).finally(() => {
        if (abortRef.current === controller) abortRef.current = null
      })
      // 기다리는 사이 화면이 다른 대화방으로 바뀌었거나 그만 기다렸다. 이 답은 버린다
      if (seq !== askSeqRef.current) return

      // 답이 비어 오면 빈 말풍선을 남기지 않고 실패로 다룬다. '다시 시도'로 같은 질문을 다시 보낸다
      if (result.answer.trim() === '') {
        console.warn('AI 답이 비어 있습니다', result)
        setPending('error')
        return
      }

      setMessages((previous) => [
        ...previous,
        {
          messageId: nextLocalId(),
          role: 'assistant',
          content: result.answer,
          createdAt: new Date().toISOString(),
        },
      ])
      setPending(null)
      if (needsTitle) rooms.load(true)
      else rooms.moveToTop(roomId)
    } catch (error: unknown) {
      if (seq !== askSeqRef.current) return
      console.warn('AI 질문 전송 실패', error)

      /*
       * 성향을 안 정한 회원은 서버가 404(MEMBER404_2)를 준다. 다시 보내 봐야 같은 답이라
       * '다시 시도'를 띄우지 않고 검사부터 하라고 안내한다.
       * 401은 client.ts가 이미 로그인 화면으로 보냈다.
       */
      if (error instanceof ApiError && error.code === 'MEMBER404_2') {
        setPending(null)
        setNotice(NO_PERSONALITY_HINT)
        return
      }
      if (roomId !== null && isRoomGone(error)) {
        dropGoneRoom(roomId)
        return
      }
      // 앞 질문의 답을 아직 만드는 중이다. 질문은 저장되지 않았으니 조금 뒤 다시 시도로 보낸다
      if (error instanceof ApiError && error.code === 'CHAT409_1') setNotice(BUSY_HINT)
      setPending('error')
    }
  }

  /** 입력칸과 종목 상세에서 온 첫 질문이 같은 길을 탄다 */
  function submit({ text, stockName }: Question): boolean {
    // 공백만 친 경우까지 걸러진다
    if (text === '' || pending === 'loading') return false
    /*
     * 대화방 내용을 받는 중이거나 못 받았으면 보내지 않는다. 받는 중에 보내면 늦게 온 대화 내용이 방금 띄운
     * 질문과 답을 덮어써 둘 다 사라지고, 못 받은 화면에서 보내면 오류 안내가 먼저라 질문·답·그만 기다리기가 안 보인 채
     * 서버에만 저장됐다(2026-10-31). 입력칸의 글은 그대로 남는다.
     */
    if (detailState !== 'idle') return false

    // 서버가 토큰 없는 요청을 401로 막는다. 보내 보고 실패하느니 먼저 알린다
    if (!loggedIn) {
      setNotice(LOGIN_HINT)
      return false
    }

    /* 내 질문을 먼저 띄운다. 서버를 기다렸다 그리면 반응이 느리게 느껴진다 */
    const asked: ChatMessage = {
      messageId: nextLocalId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((previous) => [...previous, asked])
    setNotice('')

    void send({ text, stockName }, asked)
    return true
  }

  /**
   * 그만 기다리기. 답은 제한 없이 기다려서(서버가 영영 안 답하면 입력칸이 잠긴 채 남았다) 사용자가 끊을 수 있게 한다
   * (사용자 결정 2026-09-27). 번호를 올려 늦게 온 답은 버리고, 같은 질문은 다시 시도로 다시 보낸다.
   * 서버는 이미 받은 질문의 답을 계속 만들어 방에 저장한다 — 프론트가 요청을 거둘 방법은 없다.
   */
  function stop() {
    abortRef.current?.abort()
    askSeqRef.current += 1
    setPending('stopped')
  }

  /**
   * 다시 시도. 방이 있으면 먼저 방을 다시 받아, 서버가 그 질문의 답을 이미 저장했으면(그만 기다린 뒤 답이 끝났거나 409 뒤
   * 앞 답이 끝났다) 그걸 보여 주고 끝낸다 — 그냥 다시 보내면 같은 질문과 답이 방에 두 번 저장된다. 답이 없으면 다시 보낸다.
   */
  async function retry() {
    const last = lastAskRef.current
    if (last === null) return
    if (sessionId === null) {
      void send(last)
      return
    }

    setPending('loading')
    askSeqRef.current += 1
    const seq = askSeqRef.current
    try {
      const detail = await getSessionDetail(sessionId)
      if (seq !== askSeqRef.current) return
      const [asked, answered] = detail.messages.slice(-2)
      if (
        asked?.role === 'user' &&
        asked.content === last.text &&
        answered?.role === 'assistant' &&
        answered.content.trim() !== ''
      ) {
        setMessages(detail.messages)
        setPending(null)
        setNotice('')
        rooms.load(true)
        return
      }
    } catch (error: unknown) {
      if (seq !== askSeqRef.current) return
      // 확인을 못 해도 다시 보내기는 한다
      console.warn('AI 대화 다시 확인 실패', error)
    }
    void send(last, undefined, { synced: true })
  }

  return {
    sessionId,
    messages,
    detailState,
    pending,
    notice,
    showNotice: setNotice,
    startNewChat,
    select,
    submit,
    stop,
    retry: () => void retry(),
    leaveRoom,
  }
}
