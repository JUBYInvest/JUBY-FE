import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ChatEmptyState, { PERSONALITY_TEST_URL } from '../components/ai/ChatEmptyState'
import ChatPane from '../components/ai/ChatPane'
import Composer from '../components/ai/Composer'
import { loadMarkdownAnswer } from '../components/loadMarkdownAnswer'
import SessionSidebar from '../components/SessionSidebar'
import { useChatRooms } from '../hooks/useChatRooms'
import { LOGIN_HINT, NO_PERSONALITY_HINT, useConversation, type Question } from '../hooks/useConversation'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useMyPersonality } from '../hooks/useMyPersonality'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAiHandoff } from '../hooks/useStockHandoff'
import styles from './AiPage.module.css'

/** 종목 상세의 'AI에게 물어보기'로 왔을 때 새 대화에 바로 보내는 질문 */
function briefingQuestion(stockName: string): string {
  return `${stockName}의 주가에 대해서 간단하게 브리핑을 해줘`
}

/**
 * AI 주가분석. 사이드바 목록은 hooks/useChatRooms, 대화 한 칸(말풍선·보내기·그만 기다리기·다시 시도)은 hooks/useConversation이
 * 들고 있고, 이 화면은 둘을 잇고 종목 상세·마이페이지에서 넘어온 것을 한 번 처리한다.
 * 훅 순서가 요청 순서다 — 대화방 목록(useChatRooms)을 성향(useMyPersonality)보다 먼저 부른다.
 */
export default function AiPage() {
  useDocumentTitle('AI 주가분석')
  const loggedIn = useIsLoggedIn()
  const rooms = useChatRooms(loggedIn)
  const chat = useConversation(loggedIn, rooms)

  const [question, setQuestion] = useState('')
  /** 예시 질문을 누르면 입력칸으로 옮겨 간다 */
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /*
   * 답변 렌더러(마크다운·수식)를 화면이 뜨자마자 받기 시작한다. 말풍선 목록이 생길 때 받기 시작하면 저장된 방을 열거나
   * 첫 답이 올 때 서식 없는 글자가 한순간 보인다
   */
  useEffect(() => {
    void loadMarkdownAnswer()
  }, [])

  /*
   * 종목 상세의 'AI에게 물어보기'로 왔으면 새 대화에 그 종목의 브리핑 질문을 한 번 보낸다(입력칸으로 보내는 것과 같은 길 — submit).
   * 보내면 비운다. ref라서 개발 서버(StrictMode)가 effect를 두 번 돌려도 한 번만 보낸다.
   * sendable은 비로그인으로 들어와 입력칸에 채우기만 했다는 표시다 — 나중에 다른 탭에서 로그인해도 저절로 보내지 않는다.
   */
  const { stock: handoff, session: sessionHandoff } = useAiHandoff()
  const handoffAskRef = useRef<(Question & { sendable: boolean }) | null>(
    handoff === null
      ? null
      : { text: briefingQuestion(handoff.stockName), stockName: handoff.stockName, sendable: true },
  )

  /*
   * 비로그인이면 보내지 않고 입력칸에 채운 뒤 로그인 안내를 띄운다. useConversation의 effect(startNewChat)가 안내를 지운 뒤라
   * 그 뒤에 둔다 — StrictMode가 둘을 다시 돌려도 같은 값을 다시 채울 뿐이다
   */
  useEffect(() => {
    const handoffAsk = handoffAskRef.current
    if (handoffAsk === null || loggedIn) return
    handoffAskRef.current = { ...handoffAsk, sendable: false }
    setQuestion(handoffAsk.text)
    chat.showNotice(LOGIN_HINT)
    // 로그인 여부가 바뀔 때만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  /*
   * 로그인했으면 대화방 목록이 온 뒤에 보낸다(못 받았어도 보낸다 — 목록 없이도 질문은 된다). 목록을 받는 중에 방을 만들면
   * 늦게 온 목록이 방금 만든 방을 목록에서 지운다
   */
  useEffect(() => {
    const handoffAsk = handoffAskRef.current
    if (handoffAsk === null || !loggedIn) return
    if (!handoffAsk.sendable) {
      handoffAskRef.current = null
      return
    }
    if (rooms.state === 'loading') return
    handoffAskRef.current = null
    chat.submit(handoffAsk)
    // 로그인 여부와 목록 상태가 바뀔 때만 본다. submit은 그 순간의 화면 상태로 보낸다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, rooms.state])

  /*
   * 마이페이지 '최근 AI 대화'에서 왔으면 목록이 온 뒤 그 방을 연다(사이드바에서 누른 것과 같은 길 — select).
   * 목록을 못 받았어도 연다 — 방 하나는 목록 없이도 열린다. 지워진 방이면 select가 목록에서 빼고 알린다.
   * 비로그인이면 열지 않는다(대화는 계정의 것이다). ref라서 StrictMode가 effect를 두 번 돌려도 한 번만 연다
   */
  const openSessionRef = useRef(sessionHandoff)
  useEffect(() => {
    const roomId = openSessionRef.current
    if (roomId === null) return
    if (!loggedIn) {
      openSessionRef.current = null
      return
    }
    if (rooms.state === 'loading') return
    openSessionRef.current = null
    chat.select(roomId)
    // 로그인 여부와 목록 상태가 바뀔 때만 본다. select는 그 순간의 화면 상태로 연다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, rooms.state])

  /*
   * 내 성향. 토큰이 없으면 부르지 않는다(성향 영역은 어차피 숨긴다). 만료된 토큰(401)이면 토큰만 지우고
   * 이 화면에 머문다. 못 불러온 것은 "없음"이 아니라 실패로 보인다(useMyPersonality)
   */
  const { personality, retry: retryPersonality } = useMyPersonality(loggedIn)

  function handleSubmit() {
    // 입력칸으로 묻는 질문에는 종목명을 싣지 않는다. 받았으면 입력칸을 비운다(못 보내는 상태면 쓴 글을 둔다)
    if (chat.submit({ text: question.trim(), stockName: null })) setQuestion('')
  }

  /** 사이드바의 이름 바꾸기·지우기. 목록은 useChatRooms가, 보던 방이면 새 대화로 돌리는 건 useConversation이 한다 */
  async function handleRename(roomId: number, title: string): Promise<'renamed' | 'gone'> {
    const result = await rooms.rename(roomId, title)
    if (result === 'gone') chat.leaveRoom(roomId)
    return result
  }

  async function handleDelete(roomId: number) {
    await rooms.remove(roomId)
    chat.leaveRoom(roomId)
  }

  return (
    <>
      <h1 className={styles.title}>AI 주가분석 이용하기</h1>

      <div className={styles.layout}>
        <SessionSidebar
          sessions={rooms.rooms}
          listState={rooms.state}
          selectedId={chat.sessionId}
          onSelect={chat.select}
          onNewChat={chat.startNewChat}
          onRename={handleRename}
          onDelete={handleDelete}
          onRetryList={() => rooms.load()}
          isLoggedIn={loggedIn}
        />

        <section className={styles.chat}>
          <ChatPane
            detailState={chat.detailState}
            messages={chat.messages}
            pending={chat.pending}
            onRetryDetail={() => {
              if (chat.sessionId !== null) chat.select(chat.sessionId)
            }}
            onRetry={chat.retry}
            onStop={chat.stop}
            emptyState={
              <ChatEmptyState
                loggedIn={loggedIn}
                personality={personality}
                onRetryPersonality={retryPersonality}
                onPickExample={(text) => {
                  setQuestion(text)
                  inputRef.current?.focus()
                }}
              />
            }
          />

          {/*
            성향이 없다는 안내에는 갈 곳을 함께 준다. 검사 버튼은 말풍선이 하나도
            없을 때만 보이는 자리에 있어서, 질문을 보낸 뒤에는 화면에서 사라진다.
          */}
          {chat.notice !== '' && (
            <p className={styles.notice}>
              {chat.notice}
              {chat.notice === NO_PERSONALITY_HINT && (
                <Link className={styles.noticeLink} to={PERSONALITY_TEST_URL}>
                  투자성향 검사하기
                </Link>
              )}
            </p>
          )}

          <Composer
            value={question}
            onChange={setQuestion}
            onSubmit={handleSubmit}
            inputRef={inputRef}
            waiting={chat.pending === 'loading'}
            sendLocked={chat.detailState !== 'idle'}
          />
        </section>
      </div>
    </>
  )
}
