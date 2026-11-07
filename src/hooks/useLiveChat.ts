import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_SEND_GAP_MS, loadChatPage, openLiveChat, type ChatMessage, type ChatStatus, type LiveChat } from '../api/chat'
import { getMemberInfo } from '../api/member'
import { useIsLoggedIn } from './useIsLoggedIn'

/** 지난 대화: 받는 중 · 못 받음 · 받음(더 이전이 있으면 그 커서, 더 받는 중·더 받기 실패) */
type ChatHistory =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; nextCursor: number | null; loadingMore: boolean; moreFailed: boolean }

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

/** 보낸 뒤 이만큼 안 돌아오면 실패로 본다 */
const ECHO_TIMEOUT_MS = 10_000

/** 서버 실패 code → 화면 글. 모르는 code는 "보내지 못했어요" */
const SEND_ERRORS: Record<string, string> = {
  LIVECHAT400_1: '빈 말은 보낼 수 없어요.',
  LIVECHAT400_2: '300자까지 보낼 수 있어요.',
  LIVECHAT401_1: '로그인하면 보낼 수 있어요.',
  LIVECHAT403_1: '닉네임을 정하면 보낼 수 있어요.',
  LIVECHAT429_1: '너무 빨리 보내고 있어요. 잠깐 뒤에 다시 보내 주세요.',
}

/** 같은 말이 두 번 오지 않게 id로 합치고 오래된 순으로 세운다 */
function mergeMessages(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((message) => [message.id, message]))
  for (const message of incoming) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/**
 * 홈 전체 채팅의 상태 — 대화(지난 대화 + 새 말), 연결 상태, 내 닉네임(내 말 구분·보내기 자격), 아직 오르지 않은 내 말.
 * 로그인 상태가 바뀌면 그 토큰으로 다시 붙는다. 다시 붙을 때마다 최근 대화를 다시 받아 끊긴 사이 말을 메운다
 */
export function useLiveChat() {
  const loggedIn = useIsLoggedIn()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [history, setHistory] = useState<ChatHistory>({ kind: 'loading' })
  const [status, setStatus] = useState<ChatStatus>('connecting')
  const [pending, setPending] = useState<PendingMessage[]>([])
  /** 내 닉네임. 모름(받는 중·비로그인) undefined, 아직 안 정함 null */
  const [nickname, setNickname] = useState<string | null | undefined>(undefined)
  /** 토큰을 살리지 못해 읽기 전용으로 붙었다 */
  const [signedOut, setSignedOut] = useState(false)
  /** 닉네임이 없어 서버가 거절했다 — 화면이 닉네임 창을 연다 */
  const [nicknameAsked, setNicknameAsked] = useState(0)
  /** 내가 보내 돌아온 말의 id — 닉네임을 못 받았어도 내 말을 오른쪽에 둔다 */
  const [mineIds, setMineIds] = useState<ReadonlySet<number>>(() => new Set())

  const chatRef = useRef<LiveChat | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const statusRef = useRef(status)
  const nicknameRef = useRef(nickname)
  nicknameRef.current = nickname
  const lastSentRef = useRef(0)
  const flushTimerRef = useRef<number | undefined>(undefined)
  const nextKeyRef = useRef(1)
  const echoTimersRef = useRef(new Map<number, number>())

  const refreshLatest = useCallback(() => {
    loadChatPage(null)
      .then((page) => {
        setMessages((list) => mergeMessages(list, page.messages))
        // 처음 받은 때만 커서를 정한다 — 다시 붙어 메운 것은 위쪽 커서를 바꾸지 않는다
        setHistory((current) => (current.kind === 'ready' ? current : { kind: 'ready', nextCursor: page.nextCursor, loadingMore: false, moreFailed: false }))
      })
      .catch((error: unknown) => {
        console.warn('지난 채팅을 받지 못했습니다', error)
        setHistory((current) => (current.kind === 'ready' ? current : { kind: 'error' }))
      })
  }, [])

  /** 보낼 차례를 기다리는 말을 보낸다. 붙어 있을 때만, 서버의 1초 간격을 지켜 하나씩 */
  const flush = useCallback(() => {
    window.clearTimeout(flushTimerRef.current)
    flushTimerRef.current = undefined
    const next = pendingRef.current.find((item) => item.state === 'queued')
    const chat = chatRef.current
    if (next === undefined || chat === null || statusRef.current !== 'live') return
    const wait = lastSentRef.current + CHAT_SEND_GAP_MS - Date.now()
    if (wait > 0) {
      flushTimerRef.current = window.setTimeout(flush, wait)
      return
    }
    if (!chat.send(next.text)) return
    lastSentRef.current = Date.now()
    setPending((list) => list.map((item) => (item.key === next.key ? { ...item, state: 'sent' } : item)))
    pendingRef.current = pendingRef.current.map((item) => (item.key === next.key ? { ...item, state: 'sent' } : item))
    echoTimersRef.current.set(
      next.key,
      window.setTimeout(() => {
        echoTimersRef.current.delete(next.key)
        setPending((list) => list.map((item) => (item.key === next.key && item.state === 'sent' ? { ...item, state: 'failed', reason: '보내지 못했어요.' } : item)))
      }, ECHO_TIMEOUT_MS),
    )
    flushTimerRef.current = window.setTimeout(flush, CHAT_SEND_GAP_MS)
  }, [])

  const settle = useCallback((key: number) => {
    window.clearTimeout(echoTimersRef.current.get(key))
    echoTimersRef.current.delete(key)
  }, [])

  // 지난 대화는 처음 한 번(다시 붙을 때는 아래 onStatus가 메운다)
  useEffect(() => {
    refreshLatest()
  }, [refreshLatest])

  // 내 닉네임 — 내 말을 오른쪽에 두고, 없으면 말하기 전에 정하게 한다
  useEffect(() => {
    if (!loggedIn) {
      setNickname(undefined)
      return
    }
    let stale = false
    getMemberInfo()
      .then((member) => {
        if (!stale) setNickname(member.nickname)
      })
      .catch(() => {
        // 모르면 보낼 때 서버가 알려 준다(LIVECHAT403_1)
        if (!stale) setNickname(undefined)
      })
    return () => {
      stale = true
    }
  }, [loggedIn])

  // 연결 — 로그인 상태가 바뀌면 새 토큰(또는 토큰 없이)으로 다시 붙는다
  useEffect(() => {
    setSignedOut(false)
    let everLive = false
    const chat = openLiveChat({
      onStatus: (next) => {
        statusRef.current = next
        setStatus(next)
        if (next !== 'live') return
        if (everLive) refreshLatest()
        everLive = true
        flush()
      },
      onMessage: (message) => {
        setMessages((list) => mergeMessages(list, [message]))
        // 닉네임을 모르면 글만으로 맞춘다
        if (nicknameRef.current !== undefined && message.author !== nicknameRef.current) return
        // 내 말이 돌아왔다 — 같은 글의 가장 오래된 보낸 말을 지운다
        const mine = pendingRef.current.find((item) => item.state === 'sent' && item.text === message.text)
        if (mine === undefined) return
        settle(mine.key)
        setMineIds((ids) => new Set(ids).add(message.id))
        pendingRef.current = pendingRef.current.filter((item) => item.key !== mine.key)
        setPending((list) => list.filter((item) => item.key !== mine.key))
      },
      onSendError: (code) => {
        const failed = pendingRef.current.find((item) => item.state === 'sent')
        if (code === 'LIVECHAT403_1') {
          setNickname(null)
          setNicknameAsked((count) => count + 1)
        }
        if (failed === undefined) return
        settle(failed.key)
        // 토큰이 만료돼 거절됐으면 다시 붙은 뒤 한 번 더 보낸다(api/chat.ts가 새 토큰으로 다시 붙는다)
        const retry = code.startsWith('AUTH401') && !failed.resent
        const update = (item: PendingMessage): PendingMessage =>
          item.key !== failed.key ? item : retry ? { ...item, state: 'queued', resent: true } : { ...item, state: 'failed', reason: SEND_ERRORS[code] ?? '보내지 못했어요.' }
        pendingRef.current = pendingRef.current.map(update)
        setPending((list) => list.map(update))
      },
      onSignedOut: () => setSignedOut(true),
    })
    chatRef.current = chat
    const wake = () => {
      if (document.visibilityState === 'visible') chat.reconnect()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      chatRef.current = null
      chat.close()
    }
  }, [loggedIn, refreshLatest, flush, settle])

  // 화면을 떠나면 기다리던 타이머를 거둔다
  useEffect(() => {
    const echoTimers = echoTimersRef.current
    return () => {
      window.clearTimeout(flushTimerRef.current)
      for (const id of echoTimers.values()) window.clearTimeout(id)
    }
  }, [])

  const send = useCallback(
    (text: string) => {
      const item: PendingMessage = { key: nextKeyRef.current++, text, state: 'queued', reason: null, resent: false }
      pendingRef.current = [...pendingRef.current, item]
      setPending((list) => [...list, item])
      flush()
    },
    [flush],
  )

  const resend = useCallback(
    (key: number) => {
      const update = (item: PendingMessage): PendingMessage => (item.key === key ? { ...item, state: 'queued', reason: null, resent: false } : item)
      pendingRef.current = pendingRef.current.map(update)
      setPending((list) => list.map(update))
      flush()
    },
    [flush],
  )

  const discard = useCallback(
    (key: number) => {
      settle(key)
      pendingRef.current = pendingRef.current.filter((item) => item.key !== key)
      setPending((list) => list.filter((item) => item.key !== key))
    },
    [settle],
  )

  const loadOlder = useCallback(() => {
    if (history.kind !== 'ready' || history.nextCursor === null || history.loadingMore) return
    const cursor = history.nextCursor
    setHistory({ ...history, loadingMore: true, moreFailed: false })
    loadChatPage(cursor)
      .then((page) => {
        setMessages((list) => mergeMessages(list, page.messages))
        setHistory({ kind: 'ready', nextCursor: page.nextCursor, loadingMore: false, moreFailed: false })
      })
      .catch((error: unknown) => {
        console.warn('이전 채팅을 받지 못했습니다', error)
        setHistory({ kind: 'ready', nextCursor: cursor, loadingMore: false, moreFailed: true })
      })
  }, [history])

  const retryHistory = useCallback(() => {
    setHistory({ kind: 'loading' })
    refreshLatest()
  }, [refreshLatest])

  return {
    loggedIn,
    messages,
    history,
    status,
    pending,
    nickname,
    /** 이 말이 내 말인가(닉네임이 같거나 내가 보내 돌아온 말) */
    isMine: (message: ChatMessage) => mineIds.has(message.id) || (typeof nickname === 'string' && message.author === nickname),
    signedOut,
    nicknameAsked,
    setNickname,
    send,
    resend,
    discard,
    loadOlder,
    retryHistory,
    reconnect: () => chatRef.current?.reconnect(),
  }
}
