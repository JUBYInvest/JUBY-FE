import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getQuestions, submitTest } from '../api/personality'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { loginPathFrom } from '../utils/navigation'
import type { Question } from '../types/personality'
import styles from './PersonalityTestPage.module.css'

/** 화면 흐름상 전부 고른 뒤에만 부르므로 못 찾는 보기는 없다 */
function toScores(questions: Question[], answers: (number | null)[]): number[] {
  return questions.map((question, index) => {
    const chosen = question.choices.find(
      (choice) => choice.choiceId === answers[index],
    )
    return chosen === undefined ? 0 : chosen.score
  })
}

export default function PersonalityTestPage() {
  useDocumentTitle('투자성향테스트')
  const navigate = useNavigate()
  /* 어디서 들어왔는지(?from=mypage)·가려던 자리(?next=, 첫 로그인)를 결과 화면까지 그대로 넘긴다 */
  const { pathname, search } = useLocation()

  const [questions, setQuestions] = useState<Question[] | null>(null)
  /** 서버 문항 대신 예비 문항으로 진행 중인 까닭(비로그인만 여기로 온다). null이면 서버 문항이다 */
  const [fallbackReason, setFallbackReason] = useState<'login' | 'server' | null>(null)
  /** 문항을 못 받았다. 그릴 게 없으니 화면 전체를 안내로 바꾼다 */
  const [hasError, setHasError] = useState(false)
  /** 문항 조회 '다시 시도'. 올리면 아래 effect가 다시 돈다 */
  const [retryCount, setRetryCount] = useState(0)
  /** 문항마다 고른 보기의 choiceId. 아직 안 고른 문항은 null */
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /*
   * 결과를 서버에 저장하지 못했다. 문항 조회 실패와 따로 둔다 — 같은 상태를 쓰면
   * 고른 답 10개가 "문항을 불러오지 못했습니다" 한 줄로 바뀌어 사라진다.
   * 저장 못 한 성향을 결과처럼 보여주면 마이페이지 성향과 어긋나므로
   * 결과 화면으로 넘기지 않고 이 자리에서 다시 저장하게 한다.
   */
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    setHasError(false)
    getQuestions()
      .then((loaded) => {
        setQuestions(loaded.questions)
        setFallbackReason(loaded.fallbackReason)
        setAnswers(Array(loaded.questions.length).fill(null))
      })
      .catch((error: unknown) => {
        // 로그인 상태에서 서버 문항을 못 받은 경우다. 예비 문항 결과가 저장되면 안 되므로 멈춘다
        console.warn('성향 테스트 문항 조회 실패', error)
        setHasError(true)
      })
  }, [retryCount])

  if (hasError) {
    return (
      <div className={styles.message}>
        <p>문항을 불러오지 못했습니다.</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => setRetryCount((count) => count + 1)}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (questions === null) {
    return <p className={styles.message}>불러오는 중…</p>
  }

  const total = questions.length
  const question = questions[currentIndex]
  const selectedId = answers[currentIndex]
  const isLast = currentIndex === total - 1

  function handleSelect(choiceId: number) {
    // 답을 바꾸면 다시 보낼 내용도 바뀐다. 앞선 저장 실패 안내는 거둔다
    setSaveFailed(false)
    // 배열을 직접 고치면 React가 같은 객체로 보고 다시 그리지 않는다. 새 배열을 만든다
    setAnswers((previous) =>
      previous.map((answer, index) =>
        index === currentIndex ? choiceId : answer,
      ),
    )
  }

  async function handleNext() {
    if (questions === null) return

    if (!isLast) {
      setCurrentIndex((index) => index + 1)
      return
    }

    setIsSubmitting(true)
    setSaveFailed(false)
    try {
      const result = await submitTest(questions, toScores(questions, answers))
      navigate(
        { pathname: '/personality-test/result', search },
        { state: { result } },
      )
    } catch (error: unknown) {
      // 401이면 client.ts가 이미 로그인 화면으로 보냈다. 그 밖은 여기 머물러 다시 저장하게 한다
      console.warn('성향 결과 저장 실패', error)
      setSaveFailed(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <h1 className={styles.title}>나의 투자성향 테스트</h1>

      {/* 로그인만 하면 되는 경우와 서버가 실패한 경우를 가른다. 둘을 같은 말로 알리면 멀쩡한 서버가 장애로 읽힌다 */}
      {fallbackReason === 'login' && (
        <p className={styles.fallbackNotice} role="status">
          지금은 임시 문항으로 진행해요. 결과는 참고로만 봐 주세요.{' '}
          <Link to={loginPathFrom(pathname + search)} className={styles.fallbackLink}>
            로그인하면
          </Link>{' '}
          정식 문항으로 검사하고 결과를 저장해요.
        </p>
      )}
      {fallbackReason === 'server' && (
        <p className={styles.fallbackNotice} role="status">
          서버 문항을 불러오지 못해 임시 문항으로 진행하고 있어요. 결과는 참고로만 봐 주세요.
        </p>
      )}

      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentIndex + 1}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.questionNo}>Q{currentIndex + 1}.</span>
          <span className={styles.counter}>
            {currentIndex + 1} / {total}
          </span>
        </div>

        <p className={styles.question}>{question.content}</p>

        <div className={styles.choices}>
          {question.choices.map((choice) => {
            const isSelected = choice.choiceId === selectedId

            return (
              <button
                key={choice.choiceId}
                type="button"
                className={
                  isSelected
                    ? `${styles.choice} ${styles.choiceSelected}`
                    : styles.choice
                }
                onClick={() => handleSelect(choice.choiceId)}
                aria-pressed={isSelected}
              >
                {choice.content}
              </button>
            )
          })}
        </div>

        {saveFailed && isLast && (
          <p className={styles.saveError} role="alert">
            결과를 저장하지 못했어요. 고른 답은 그대로 있으니 다시 저장해 주세요.
          </p>
        )}

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.prev}
            onClick={() => setCurrentIndex((index) => index - 1)}
            disabled={currentIndex === 0}
          >
            이전
          </button>
          <button
            type="button"
            className={styles.next}
            onClick={handleNext}
            disabled={selectedId === null || isSubmitting}
          >
            {!isLast ? '다음' : saveFailed ? '다시 저장' : '결과 보기'}
          </button>
        </div>
      </section>
    </>
  )
}
