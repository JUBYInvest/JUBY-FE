import { useEffect, useRef, useState } from 'react'
import { deleteSession, getSessions, renameSession } from '../api/ai'
import { ApiError } from '../api/client'
import type { SessionListState } from '../components/SessionSidebar'
import type { ChatSession } from '../types/ai'

/** 대화방이 없어진 경우의 오류인가(다시 받아도 같다) — 다른 탭에서 지웠거나 내 것이 아닌 방(404 CHAT404_1·403 CHAT403_1) */
export function isRoomGone(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'CHAT404_1' || error.code === 'CHAT403_1')
}

export interface ChatRooms {
  rooms: ChatSession[]
  state: SessionListState
  /** 목록을 (다시) 받는다. quiet면 받는 동안 보던 목록을 비우지 않는다 */
  load: (quiet?: boolean) => void
  /** 방을 맨 위에 둔다(만든 방·이름 바꾼 방). 이미 있으면 옮긴다 */
  putOnTop: (room: ChatSession) => void
  /** 목록에 있는 방을 맨 위로. 없으면 그대로 */
  moveToTop: (roomId: number) => void
  /** 목록에서 뺀다(서버에는 손대지 않는다) */
  drop: (roomId: number) => void
  /** 이름 바꾸기. 실패하면 던진다(사이드바가 이름칸을 두고 알린다). 다른 곳에서 지운 방이면 목록에서 빼고 'gone'이다 */
  rename: (roomId: number, title: string) => Promise<'renamed' | 'gone'>
  /** 지우기. 실패하면 던진다(확인 상자가 알린다). 이미 없는 방(404)·남의 방(403)이면 지운 것과 같다 */
  remove: (roomId: number) => Promise<void>
}

/**
 * AI 화면 사이드바의 대화방 목록. 제목(첫 질문 앞 30자)과 순서(최근 대화 순)는 서버가 정하므로
 * 답마다·이름을 바꾸거나 지울 때마다 조용히 다시 받는다. 비로그인이면 부르지 않는다 — 서버가 401로 막는다.
 * 보던 방을 비우는 일(지운 방이 보던 방이면 새 대화로)은 hooks/useConversation leaveRoom이 한다 — 화면이 둘을 잇는다.
 */
export function useChatRooms(loggedIn: boolean): ChatRooms {
  const [rooms, setRooms] = useState<ChatSession[]>([])
  const [state, setState] = useState<SessionListState>('loading')
  /**
   * 목록 요청 번호. 늦게 온 옛 목록이 새 목록을 덮지 않게 한다(답 뒤에 받기 시작한 목록이 방금 바꾼 제목이나 지운 방을 되살리지 않게)
   */
  const seqRef = useRef(0)

  function load(quiet = false) {
    seqRef.current += 1
    const seq = seqRef.current
    if (!loggedIn) {
      setRooms([])
      setState('ready')
      return
    }
    if (!quiet) setState('loading')
    getSessions()
      .then((list) => {
        if (seq !== seqRef.current) return
        setRooms(list)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (seq !== seqRef.current) return
        // 목록을 못 받아도 질문은 할 수 있다. 조용히 다시 받던 중이면 보던 목록을 둔다
        console.warn('AI 대화 목록 조회 실패', error)
        /*
         * 단, 아직 목록을 못 보여 준 채였으면(첫 목록을 받는 사이 답이 와서 이 요청이 그 요청을 밀어냈다) 실패로 보인다 —
         * 안 그러면 밀려난 첫 요청의 응답은 버려지고 이 요청은 조용히 끝나 "불러오는 중"에서 멈춘다
         */
        setState((previous) => (quiet && previous === 'ready' ? previous : 'error'))
      })
  }

  // 대화 목록은 회원마다 다르다. 로그인·로그아웃(다른 탭 포함)하면 다시 받는다
  useEffect(() => {
    load()
    // 로그인 여부가 바뀔 때만 돈다. load는 그 순간의 값을 쓰면 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  function putOnTop(room: ChatSession) {
    setRooms((previous) => [room, ...previous.filter((item) => item.sessionId !== room.sessionId)])
  }

  function moveToTop(roomId: number) {
    setRooms((previous) => {
      const room = previous.find((item) => item.sessionId === roomId)
      return room === undefined ? previous : [room, ...previous.filter((item) => item.sessionId !== roomId)]
    })
  }

  function drop(roomId: number) {
    setRooms((previous) => previous.filter((item) => item.sessionId !== roomId))
  }

  /** 서버는 바꾼 시각을 최근 대화 시각으로도 적어 그 방이 맨 위로 간다 — 목록을 다시 받기 전에 먼저 맞춰 둔다 */
  async function rename(roomId: number, title: string): Promise<'renamed' | 'gone'> {
    try {
      const renamed = await renameSession(roomId, title)
      putOnTop(renamed)
      load(true)
      return 'renamed'
    } catch (error: unknown) {
      if (!isRoomGone(error)) throw error
      drop(roomId)
      return 'gone'
    }
  }

  /** 답을 기다리던 방도 지울 수 있다 — 서버는 답을 저장하다 실패하고(방이 없다), 화면은 새 대화로 돌아가 그 실패를 버린다 */
  async function remove(roomId: number) {
    try {
      await deleteSession(roomId)
    } catch (error: unknown) {
      if (!isRoomGone(error)) throw error
    }
    drop(roomId)
    load(true)
  }

  return { rooms, state, load, putOnTop, moveToTop, drop, rename, remove }
}
