import { Link } from 'react-router-dom'
import type { MyPersonality } from '../../hooks/useMyPersonality'
import { isPersonalityType, PERSONALITY_INFO } from '../../utils/personality'
import styles from '../../pages/AiPage.module.css'

/** 검사를 마치면 doneRoute가 from=ai를 보고 AI 화면으로 돌려보낸다 */
export const PERSONALITY_TEST_URL = '/personality-test?from=ai'

/**
 * 문답 예시. 질문은 사용설명서 4장 "질문 사례별 안내"(src/content/guide/ai.md)의 것이고, 답은 그 사례의 답변 예시이거나
 * 챗봇이 무엇을 보고 답하는지다 — 지어낸 주가 숫자는 적지 않는다. 누르면 입력칸에 채우기만 한다(보내는 건 사용자다)
 */
const EXAMPLES = [
  {
    question: '내 투자 유형은 뭐야? 어떤 특징이 있어?',
    answer: '회원님은 위험중립형이에요. 어느 정도의 가격 변동은 감수하되, 수익과 안정성의 균형을 중요하게 생각하는 유형이에요.',
  },
  {
    question: '백테스트에서 최대낙폭이 무슨 뜻이야? 예를 들어 설명해 줘.',
    answer: '최대낙폭(MDD)은 투자 기간 중 투자금이 이전 고점에서 가장 크게 줄어든 비율이에요. 숫자가 낮을수록 안정적이라는 뜻이에요.',
  },
  {
    question: 'SK하이닉스 요즘 왜 이렇게 올랐어?',
    answer: '최근 일별 주가로 얼마나 올랐는지 짚고, 관련 뉴스를 묶어 까닭을 정리해요. 기사 출처도 함께 달아요.',
  },
  {
    question: '카카오는 내 투자 성향에 얼마나 맞아?',
    answer: '내 성향으로 돌린 최근 6개월 백테스트 결과로 적합도와 최대낙폭을 쉬운 말로 풀어 줘요.',
  },
]

interface Props {
  loggedIn: boolean
  personality: MyPersonality
  onRetryPersonality: () => void
  /** 예시 질문을 눌렀다. 화면이 입력칸에 채우고 포커스를 준다 */
  onPickExample: (text: string) => void
}

/**
 * 말풍선이 하나도 없을 때의 대화창 — 무엇을 물을 수 있는지 문답 예시로 보인다.
 * 첫 예시는 실제 대화와 같은 말풍선 한 쌍(내 질문 오른쪽, 답 왼쪽)으로 크게 — 답이 내 성향으로 적혀 "내 성향에 맞춰 답한다"를 보여 준다.
 * 나머지는 질문 줄 목록이다. 어느 것이든 누르면 입력칸에 질문을 채우기만 한다(보내는 건 사용자다).
 * 제목 아래에 성향 상태를 한 줄로 둔다. 성향이 없는 회원의 질문은 서버가 거절하므로 검사를 먼저 권하고, 못 불러왔으면 다시 시도만 준다
 * (검사를 권하면 멀쩡한 성향을 덮어쓸 수 있다). 불러오는 중·비로그인에는 그 줄을 비워 둔다.
 */
export default function ChatEmptyState({ loggedIn, personality, onRetryPersonality, onPickExample }: Props) {
  // 첫 예시의 답은 내 성향이 있으면 그 성향으로 적는다
  const mine = personality.kind === 'found' && isPersonalityType(personality.name) ? personality.name : null
  const [first, ...rest] = EXAMPLES
  const featured = mine === null ? first : { ...first, answer: `회원님은 ${mine}이에요. ${PERSONALITY_INFO[mine].description.replace(/\n/g, ' ')}이에요.` }
  return (
    <div className={styles.emptyArea}>
      <section className={styles.examples} aria-labelledby="ai-examples-title">
        <h2 id="ai-examples-title" className={styles.examplesTitle}>
          이렇게 물으면 이렇게 답해요
        </h2>
        {personality.kind === 'found' ? (
          <p className={styles.personalityText}>
            지금 투자성향은 <b>{personality.name}</b>이에요. 답도 이 성향에 맞춰요.
            <Link className={styles.personalityLink} to={PERSONALITY_TEST_URL}>
              성향 다시 검사
            </Link>
          </p>
        ) : personality.kind === 'error' ? (
          <div className={styles.personality}>
            <p className={styles.personalityText}>성향을 불러오지 못했어요</p>
            <button type="button" className={styles.darkButton} onClick={onRetryPersonality}>
              다시 시도
            </button>
          </div>
        ) : loggedIn && personality.kind === 'none' ? (
          <div className={styles.personality}>
            <p className={styles.personalityText}>투자성향을 정하면 질문할 수 있어요. 답도 내 성향에 맞춰 나와요.</p>
            <Link className={styles.darkButton} to={PERSONALITY_TEST_URL}>
              투자성향 검사하기
            </Link>
          </div>
        ) : null}

        <button type="button" className={styles.demo} onClick={() => onPickExample(featured.question)}>
          <span className={styles.demoAsk}>
            <span className={styles.exampleQuestion}>{featured.question}</span>
          </span>
          <span className={styles.demoAnswer}>{featured.answer}</span>
        </button>

        <h3 className={styles.moreTitle}>이런 것도 물어볼 수 있어요</h3>
        <ul className={styles.exampleList}>
          {rest.map((example) => (
            <li key={example.question}>
              <button type="button" className={styles.example} onClick={() => onPickExample(example.question)}>
                <span className={styles.exampleText}>
                  <span className={styles.exampleQuestion}>{example.question}</span>
                  <span className={styles.exampleAnswer}>{example.answer}</span>
                </span>
                <InsertIcon />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** 입력칸에 넣는다(줄 끝에서 왼쪽 아래로 꺾인 화살표) — 누르면 보내지 않고 채우기만 한다는 표시 */
function InsertIcon() {
  return (
    <svg className={styles.exampleIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 5v7a3 3 0 0 1-3 3H6m0 0 4-4m-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
