import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ask, getSessionDetail, getSessions } from '../api/ai'
import { ApiError } from '../api/client'
import ChatMessages, { type PendingState } from '../components/ChatMessages'
import SessionSidebar from '../components/SessionSidebar'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useMyPersonality } from '../hooks/useMyPersonality'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { findStockName } from '../utils/stockName'
import type { ChatMessage, ChatSession } from '../types/ai'
import styles from './AiPage.module.css'

/** 검사를 마치면 doneRoute가 from=ai를 보고 이 화면으로 돌려보낸다 */
const PERSONALITY_TEST_URL = '/personality-test?from=ai'

const STOCK_HINT = '종목명을 함께 입력하면 더 정확한 분석을 받을 수 있어요.'
const LOGIN_HINT = '로그인하면 질문할 수 있어요.'
const NO_PERSONALITY_HINT = '투자성향을 먼저 정해야 답할 수 있어요.'

type DetailState = 'idle' | 'loading' | 'error'

export default function AiPage() {
  useDocumentTitle('AI 주가분석')
  const loggedIn = useIsLoggedIn()

  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [detailState, setDetailState] = useState<DetailState>('idle')

  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState<PendingState>(null)
  const [notice, setNotice] = useState('')

  /*
   * 화면에서 바로 만든 메시지에 붙일 번호. 서버가 주는 번호는 양수라서 음수로 내려가며 쓴다.
   * 겹치면 React가 두 말풍선을 같은 것으로 보고 하나를 지운다.
   */
  const localIdRef = useRef(-1)
  /** 실패한 질문. '다시 시도'가 이걸 그대로 다시 보낸다 */
  const lastAskRef = useRef<{ text: string; stockName: string } | null>(null)
  /*
   * 질문을 보낼 때마다 하나씩 올라가는 번호.
   * 답을 기다리는 동안 다른 대화방을 누르거나 새 대화를 열면 이 번호도 올라간다.
   * 답이 도착했을 때 번호가 달라져 있으면 보던 화면이 바뀐 것이므로 그 답은 버린다.
   * 안 그러면 A방에 물은 답이 B방 말풍선 뒤에 가서 붙는다.
   * 대화방 내용도 같은 번호로 거른다 — 방을 누르고 곧바로 새 대화를 열면 늦게 온
   * 그 방 말풍선이 새 대화 화면을 채운다.
   */
  const askSeqRef = useRef(0)

  // 대화 목록은 회원마다 다르다. 로그인·로그아웃하면 다시 받는다
  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((error: unknown) => {
        // 목록을 못 받아도 질문은 할 수 있다. 사이드바만 비워둔다
        console.warn('AI 대화 목록 조회 실패', error)
      })
  }, [loggedIn])

  /*
   * 내 성향. 토큰이 없으면 부르지 않는다(성향 영역은 어차피 숨긴다). 만료된 토큰(401)이면 토큰만 지우고
   * 이 화면에 머문다. 못 불러온 것은 "없음"이 아니라 실패로 보인다(useMyPersonality)
   */
  const { personality, retry: retryPersonality } = useMyPersonality(loggedIn)

  function nextLocalId(): number {
    const id = localIdRef.current
    localIdRef.current -= 1
    return id
  }

  function handleNewChat() {
    askSeqRef.current += 1
    setSessionId(null)
    setMessages([])
    setDetailState('idle')
    setPending(null)
    setNotice('')
  }

  function handleSelect(selectedId: number) {
    // 보고 있는 세션을 또 누른 것뿐이다. 다시 받아올 이유가 없다
    if (selectedId === sessionId && detailState !== 'error') return

    askSeqRef.current += 1
    const seq = askSeqRef.current
    setSessionId(selectedId)
    setPending(null)
    setNotice('')
    setDetailState('loading')

    getSessionDetail(selectedId)
      .then((detail) => {
        // 받는 사이 다른 방이나 새 대화로 옮겼다
        if (seq !== askSeqRef.current) return
        setMessages(detail.messages)
        setDetailState('idle')
      })
      .catch((error: unknown) => {
        if (seq !== askSeqRef.current) return
        console.warn('AI 대화 조회 실패', error)
        setDetailState('error')
      })
  }

  async function send(text: string, stockName: string) {
    lastAskRef.current = { text, stockName }
    setPending('loading')
    askSeqRef.current += 1
    const seq = askSeqRef.current

    try {
      const result = await ask(text, stockName, sessionId ?? undefined)
      // 기다리는 사이 화면이 다른 대화방으로 바뀌었다. 이 답은 그 방의 것이 아니다
      if (seq !== askSeqRef.current) return

      // 답이 비어 오면 빈 말풍선을 남기지 않고 실패로 다룬다. '다시 시도'로 같은 질문을 다시 보낸다
      if (typeof result.answer !== 'string' || result.answer.trim() === '') {
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

      // 새 대화였다면 방금 발급받은 세션으로 옮겨 앉고 목록 맨 위에 올린다
      if (sessionId === null) {
        setSessionId(result.sessionId)
        setSessions((previous) => [
          { sessionId: result.sessionId, title: result.title },
          ...previous,
        ])
      }
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
      setPending('error')
    }
  }

  function handleSubmit() {
    const text = question.trim()
    // 공백만 친 경우까지 걸러진다
    if (text === '' || pending === 'loading') return
    /*
     * 대화방 내용을 받는 중이면 보내지 않는다. 보내면 늦게 온 대화 내용이 방금 띄운
     * 질문과 답을 덮어써 둘 다 사라진다. 입력칸의 글은 그대로 남는다.
     */
    if (detailState === 'loading') return

    // 서버가 토큰 없는 요청을 401로 막는다. 보내 보고 실패하느니 먼저 알린다
    if (!loggedIn) {
      setNotice(LOGIN_HINT)
      return
    }

    const stockName = findStockName(text)

    /* 내 질문을 먼저 띄운다. 서버를 기다렸다 그리면 반응이 느리게 느껴진다 */
    setMessages((previous) => [
      ...previous,
      {
        messageId: nextLocalId(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
    ])
    setQuestion('')
    setNotice(stockName === '' ? STOCK_HINT : '')

    void send(text, stockName)
  }

  /**
   * 그만 기다리기. 답은 제한 없이 기다려서(서버가 영영 안 답하면 입력칸이 잠긴 채 남았다) 사용자가 끊을 수 있게 한다
   * (사용자 결정 2026-09-27). 번호를 올려 늦게 온 답은 버리고, 같은 질문은 다시 시도로 다시 보낸다.
   * 서버는 이미 받은 질문의 답을 계속 만든다 — 프론트가 요청을 거둘 방법은 없다.
   */
  function handleStop() {
    askSeqRef.current += 1
    setPending('stopped')
  }

  function handleRetry() {
    const last = lastAskRef.current
    if (last === null) return
    void send(last.text, last.stockName)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter는 줄바꿈으로 둔다. 조합 중인 한글이 확정되는 엔터도 보내면 안 된다
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    handleSubmit()
  }

  const isEmpty = messages.length === 0 && pending === null

  return (
    <>
      <h1 className={styles.title}>AI 주가분석 이용하기</h1>

      <div className={styles.layout}>
        <SessionSidebar
          sessions={sessions}
          selectedId={sessionId}
          onSelect={handleSelect}
          onNewChat={handleNewChat}
          isLoggedIn={loggedIn}
        />

        <section className={styles.chat}>
          {detailState === 'loading' ? (
            <div className={styles.skeletonArea} aria-label="대화를 불러오는 중">
              <span className={`${styles.skeleton} ${styles.skeletonUser}`} />
              <span className={styles.skeleton} />
              <span className={`${styles.skeleton} ${styles.skeletonUser}`} />
              <span className={styles.skeleton} />
            </div>
          ) : detailState === 'error' ? (
            <div className={styles.centerArea}>
              <p className={styles.errorText}>대화를 불러오지 못했습니다.</p>
              <button
                type="button"
                className={styles.darkButton}
                onClick={() => {
                  if (sessionId !== null) handleSelect(sessionId)
                }}
              >
                다시 시도
              </button>
            </div>
          ) : isEmpty ? (
            <div className={styles.centerArea}>
              <p className={styles.watermark}>JUBY</p>
              <p className={styles.watermarkSub}>AI 도우미</p>

              {/*
                성향이 있으면 보여주고, 로그인했는데 없으면 검사를 권한다 —
                성향 없는 회원의 질문은 서버가 거절하므로 미리 알려야 한다.
                못 불러왔으면 검사를 권하지 않는다(다시 검사하면 멀쩡한 성향을 덮어쓴다).
                비로그인·불러오는 중은 이 영역을 숨긴다. 지어낸 값을 보여줄 수는 없다.
              */}
              {personality.kind === 'found' ? (
                <div className={styles.personality}>
                  <p className={styles.personalityText}>
                    현재 당신의 투자성향은 ‘{personality.name}’ 입니다.
                  </p>
                  <Link className={styles.darkButton} to={PERSONALITY_TEST_URL}>
                    투자성향 변경하기
                  </Link>
                </div>
              ) : personality.kind === 'error' ? (
                <div className={styles.personality}>
                  <p className={styles.personalityText}>성향을 불러오지 못했어요.</p>
                  <button type="button" className={styles.darkButton} onClick={retryPersonality}>
                    다시 시도
                  </button>
                </div>
              ) : personality.kind === 'none' ? (
                <div className={styles.personality}>
                  <p className={styles.personalityText}>
                    투자성향을 정하면 나에게 맞춘 답을 받을 수 있어요.
                  </p>
                  <Link className={styles.darkButton} to={PERSONALITY_TEST_URL}>
                    투자성향 검사하기
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            <ChatMessages
              messages={messages}
              pending={pending}
              onRetry={handleRetry}
              onStop={handleStop}
            />
          )}

          {/*
            성향이 없다는 안내에는 갈 곳을 함께 준다. 검사 버튼은 말풍선이 하나도
            없을 때만 보이는 자리에 있어서, 질문을 보낸 뒤에는 화면에서 사라진다.
          */}
          {notice !== '' && (
            <p className={styles.notice}>
              {notice}
              {notice === NO_PERSONALITY_HINT && (
                <Link className={styles.noticeLink} to={PERSONALITY_TEST_URL}>
                  투자성향 검사하기
                </Link>
              )}
            </p>
          )}

          <div className={styles.composer}>
            <div className={styles.composerBox}>
              <textarea
                className={styles.input}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="예시 : 삼성전자의 주가 현황을 알려줘."
                rows={1}
                disabled={pending === 'loading'}
                aria-label="질문 입력"
              />
              <button
                type="button"
                className={styles.send}
                onClick={handleSubmit}
                disabled={
                  pending === 'loading' ||
                  detailState === 'loading' ||
                  question.trim() === ''
                }
              >
                보내기
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
