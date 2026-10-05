import { ApiError, get, post } from './client'
import { isLoggedIn } from '../utils/auth'
import { isFiniteNumber } from '../utils/format'
import {
  PERSONALITY_INFO,
  describePersonality,
  normalizeScore,
  scoreToPersonality,
} from '../utils/personality'
import type { Choice, PersonalityResult, Question } from '../types/personality'

/*
 * 문항 출처를 여기서 정한다. 화면 코드는 어느 쪽이든 똑같이 동작한다.
 *
 *   USE_BACKEND_QUESTIONS  true → GET /api/personality-tests / false → 아래 MOCK_QUESTIONS
 *
 * 2026-09-18부터 true다. DB에 **10문항 × 보기 5개(1·3·5·7·9점)**가 들어왔다.
 * 합계 범위가 10~90이라 서버 채점 구간과 정확히 맞는다.
 * 서버가 죽어 문항을 못 받으면 **비로그인일 때만** mock으로 물러선다(getQuestions 참고).
 *
 * 채점 위치는 플래그가 아니라 **로그인 여부**로 정한다.
 *   로그인함     → POST /api/personality-tests (서버가 채점하고 회원에 저장)
 *   로그인 안 함 → 프론트 채점 (같은 구간표). 결과는 저장되지 않는다
 * POST는 로그인한 회원만 부를 수 있어 토큰 없이 보내면 401이다(JUBY-BE dev 7e5b023 — 그 전에는 공개 경로라 NPE로 500이었다).
 * 비로그인은 애초에 보내지 않는다. 같은 커밋부터 문항 GET도 토큰 없이 401이라, 비로그인은 늘 예비 문항으로 물러선다
 * (공개로 되돌릴지는 백엔드에 물었다 — docs/남은-일.md).
 */
const USE_BACKEND_QUESTIONS = true

/*
 * 아래 *Response는 서버가 실제로 주는 모양이다. 스웨거에 필수 표시가 없어 필드를 전부 비어 올 수 있게 적는다.
 * 화면 타입(types/personality.ts)으로 옮기는 자리에서 걸러 낸다(toQuestion, submitTest).
 */

/** GET /api/personality-tests */
interface QuestionListResponse {
  questions?: (QuestionResponse | null)[] | null
}

interface QuestionResponse {
  questionId?: number | null
  content?: string | null
  choices?: (ChoiceResponse | null)[] | null
}

interface ChoiceResponse {
  choiceId?: number | null
  content?: string | null
  score?: number | null
}

/** POST /api/personality-tests */
interface TestResultResponse {
  memberId?: number | null
  memberName?: string | null
  personalityId?: number | null
  /** 다섯 성향 이름이지만 서버에 성향이 늘면 모르는 이름이 올 수 있다 */
  personalityName?: string | null
  description?: string | null
  url?: string | null
}

/**
 * 문항을 questionId 오름차순으로 맞춘다.
 * 서버가 findAll()을 정렬 없이 부르므로 순서가 보장되지 않는다.
 * 보기도 같은 이유로 choiceId 순으로 세운다(mock은 화면에 놓을 순서대로 번호를 매겨 뒀다).
 */
function sortByIds(questions: Question[]): Question[] {
  return [...questions]
    .sort((a, b) => a.questionId - b.questionId)
    .map((question) => ({
      ...question,
      choices: [...question.choices].sort((a, b) => a.choiceId - b.choiceId),
    }))
}

/**
 * 쓸 수 있는 문항이면 화면 타입으로, 아니면 null. 번호·글이 비었거나, 보기가 없거나, 보기 하나라도 번호·글·점수가
 * 비었거나, 보기 번호가 겹치면 쓸 수 없다 — 번호가 둘 다 null이면 한 번 누를 때 둘이 같이 골라지고, 점수가 비면
 * 합이 NaN이 돼 채점이 어긋났다(2026-09-27 확인).
 */
function toQuestion(question: QuestionResponse | null): Question | null {
  if (typeof question !== 'object' || question === null) return null
  const { questionId, content, choices } = question
  if (!isFiniteNumber(questionId) || !isText(content)) return null
  if (!Array.isArray(choices) || choices.length === 0) return null

  const parsed = choices.map(toChoice)
  if (!parsed.every((choice): choice is Choice => choice !== null)) return null
  if (new Set(parsed.map((choice) => choice.choiceId)).size !== parsed.length) return null
  return { questionId, content, choices: parsed }
}

function toChoice(choice: ChoiceResponse | null): Choice | null {
  if (typeof choice !== 'object' || choice === null) return null
  const { choiceId, content, score } = choice
  if (!isFiniteNumber(choiceId) || !isText(content) || !isFiniteNumber(score)) return null
  return { choiceId, content, score }
}

/** 공백만 있는 글도 빈 것으로 본다 */
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

interface QuestionSet {
  questions: Question[]
  /**
   * 서버 문항 대신 예비 문항인 까닭. null이면 서버 문항이다.
   * 'login' — 문항 API가 로그인을 요구해(401) 못 받았다(비로그인은 늘 여기다, JUBY-BE d7edec4부터).
   * 'server' — 서버가 실패했거나 문항 모양이 틀렸다.
   * 화면은 둘을 다르게 알린다 — 로그인만 하면 되는데 "서버 문항을 불러오지 못해"라고 하면 장애로 읽힌다(2026-10-05 점검).
   */
  fallbackReason: 'login' | 'server' | null
}

/**
 * 서버 문항을 받는다. 못 받으면(실패·빈 목록) 로그인 여부로 갈린다.
 *
 * 로그인 상태면 **예비 문항으로 물러서지 않고 던진다.** 로그인 상태의 결과는 서버에
 * 저장되는데(submitTest), 예비 문항 점수가 공식 문항 결과처럼 회원 성향으로 남으면
 * 안 된다. 화면은 실패 안내와 다시 시도를 보여준다.
 * 비로그인은 어차피 저장하지 않으므로 예비 문항으로 진행하되 isFallback으로 알린다.
 */
export async function getQuestions(): Promise<QuestionSet> {
  if (!USE_BACKEND_QUESTIONS) {
    return { questions: sortByIds(MOCK_QUESTIONS), fallbackReason: 'server' }
  }

  try {
    const response = await get<QuestionListResponse | null>('/api/personality-tests')
    const questions = response?.questions
    // 서버가 빈 목록을 주면 화면이 0/0으로 멈춘다. 받지 못한 것과 같이 다룬다
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('문항이 비어 있습니다')
    }
    // 보기가 비었거나 모양이 틀린 문항이 하나라도 있으면 그 문항에서 더 나아갈 수 없다. 이것도 받지 못한 것과 같다
    const parsed = questions.map(toQuestion)
    if (!parsed.every((question): question is Question => question !== null)) {
      throw new Error('보기가 비었거나 모양이 틀린 문항이 있습니다')
    }
    return { questions: sortByIds(parsed), fallbackReason: null }
  } catch (error: unknown) {
    if (isLoggedIn()) throw error
    const reason = error instanceof ApiError && error.status === 401 ? 'login' : 'server'
    console.warn(`성향 문항을 서버에서 못 받아 로컬 문항을 씁니다 (${reason})`, error)
    return { questions: sortByIds(MOCK_QUESTIONS), fallbackReason: reason }
  }
}

/**
 * 고른 보기의 점수들을 받아 성향을 낸다.
 *
 * questions를 같이 받는 이유는 환산에 배점 범위가 필요해서다.
 * 문항이 바뀌면 범위도 바뀌므로 그때그때 받은 목록에서 계산한다.
 */
export async function submitTest(
  questions: Question[],
  scores: number[],
): Promise<PersonalityResult> {
  const raw = scores.reduce((sum, score) => sum + score, 0)
  /*
   * 서버 문항(10개, 1~9점)이면 합계가 이미 10~90이라 환산해도 값이 같다.
   * mock 문항(7개)으로 물러선 경우에만 실제로 늘어난다.
   */
  const normalized = normalizeScore(raw, questions)

  if (!isLoggedIn()) {
    const type = scoreToPersonality(normalized)
    // 서버라면 채점을 거절할 점수다. 결과를 지어내지 않고 실패로 알린다(화면은 제자리에서 다시 하게 한다)
    if (type === null) throw new Error(`채점할 수 없는 점수입니다: ${normalized}`)
    return { type, ...PERSONALITY_INFO[type] }
  }

  /*
   * 서버는 받은 배열을 전부 더해 구간에 넣는다. 명세대로 낱개 점수를 보낸다.
   * 로그인 상태는 mock 문항으로 물러서지 않으므로(getQuestions) raw와 normalized가
   * 다를 수 있는 건 USE_BACKEND_QUESTIONS를 끈 개발 상태뿐이다. 그때만 환산값 하나로 보낸다.
   */
  const result = await post<TestResultResponse | null>('/api/personality-tests', {
    scores: raw === normalized ? scores : [normalized],
  })

  /*
   * 여기까지 왔으면 서버는 이미 저장을 끝냈다. 여기서 던지면 화면이 "저장하지 못했어요"를 띄우고
   * 다시 저장할 때마다 또 저장된다 — 이름을 몰라도, 본문이 비어 와도 던지지 않는다.
   * 이름이 비면 같은 구간표로 프론트가 채점한 이름을 쓴다(서버와 같은 표·같은 점수라 결과가 같다).
   * 예전엔 본문이 null이면 구조 분해에서 던져 저장 실패로 보였고, 이름이 null이면 결과 카드 이름 자리가 비었다.
   * personality 테이블이 비어 있으면 설명과 이미지가 빈 문자열로 온다. 그때는 로컬 문구를 쓴다(describePersonality)
   */
  const saved: TestResultResponse = typeof result === 'object' && result !== null ? result : {}
  // 서버가 받아 저장했으니 범위 안이다. 그래도 못 내면 이름 자리를 비운다
  const name = isText(saved.personalityName)
    ? saved.personalityName
    : (scoreToPersonality(normalized) ?? '')
  return {
    type: name,
    ...describePersonality(name, saved.description, saved.url),
  }
}

/**
 * 서버가 죽었을 때 쓰는 예비 문항(7개). 배점은 서버와 공유된 적 없는 임시값이다.
 * 실제 조회 응답과 같은 모양이라 화면은 어느 쪽인지 모른다.
 * 정식 문항은 DB에 10개가 있고 getQuestions()가 그쪽을 먼저 본다.
 */
const MOCK_QUESTIONS: Question[] = [
  {
    questionId: 1,
    content:
      '나에게 1천만 원의 여유 자금이 생겼다.\n1천만 원을 예금과 주식투자로 배분한다면?',
    choices: [
      { choiceId: 1, content: '예금 1,000만 원', score: 1 },
      { choiceId: 2, content: '예금 700만 원, 주식 300만 원', score: 3 },
      { choiceId: 3, content: '예금 500만 원, 주식 500만 원', score: 5 },
      { choiceId: 4, content: '예금 300만 원, 주식 700만 원', score: 7 },
      { choiceId: 5, content: '주식 1,000만 원', score: 9 },
    ],
  },
  {
    questionId: 2,
    content: '이 자금으로 투자를 한다면 어느 정도 기간 동안 투자할 것인가?',
    choices: [
      { choiceId: 6, content: '1개월 미만', score: 1 },
      { choiceId: 7, content: '1개월 이상 ~ 6개월 미만', score: 3 },
      { choiceId: 8, content: '6개월 이상 ~ 1년 미만', score: 5 },
      { choiceId: 9, content: '1년 이상 ~ 3년 미만', score: 7 },
      { choiceId: 10, content: '3년 이상', score: 9 },
    ],
  },
  {
    questionId: 3,
    content:
      '내 월급에서 여유자금이 매달 100만 원씩 생긴다면,\n매달 이 돈을 적금과 주식에 어느 정도로 배분할 것인가?',
    choices: [
      { choiceId: 11, content: '적금 100만 원', score: 1 },
      { choiceId: 12, content: '적금 70만 원, 주식 30만 원', score: 3 },
      { choiceId: 13, content: '적금 50만 원, 주식 50만 원', score: 5 },
      { choiceId: 14, content: '적금 30만 원, 주식 70만 원', score: 7 },
      { choiceId: 15, content: '주식 100만 원', score: 9 },
    ],
  },
  {
    questionId: 4,
    content: '자산관리 원칙 중 내가 우선시하는 특성 순서는?',
    choices: [
      { choiceId: 16, content: '안정성 > 유동성 > 수익성', score: 1 },
      { choiceId: 17, content: '안정성 > 수익성 > 유동성', score: 3 },
      { choiceId: 18, content: '유동성 > 안정성 > 수익성', score: 5 },
      { choiceId: 19, content: '유동성 > 수익성 > 안정성', score: 7 },
      { choiceId: 20, content: '수익성 > 안정성 > 유동성', score: 9 },
    ],
  },
  {
    questionId: 5,
    content: '내가 가장 선호하는 금융 상품은?',
    choices: [
      { choiceId: 21, content: '예금', score: 1 },
      { choiceId: 22, content: '채권', score: 5 },
      { choiceId: 23, content: '주식', score: 9 },
    ],
  },
  {
    /*
     * 이 문항만 위험 선호 항목이 먼저 나온다. 화면 순서는 그대로 두고 점수만 각 보기에 붙인다.
     * 위에서 아래로 점수가 커지지 않는 유일한 문항이다.
     */
    questionId: 6,
    content: '내가 더 선호하는 투자 전략은?',
    choices: [
      {
        choiceId: 24,
        content:
          '원금 손실 위험이 있더라도 시장 평균보다 높은 수익률을 기대',
        score: 9,
      },
      {
        choiceId: 25,
        content:
          '원금 손실 위험이 잘 분산된 포트폴리오를 구성해 시장 평균 정도의 투자 성과를 기대',
        score: 3,
      },
    ],
  },
  {
    questionId: 7,
    content: '투자를 통해 만약 손실이 난다면 어느 정도까지 수용할 수 있는가?',
    choices: [
      {
        choiceId: 26,
        content: '무슨 일이 있어도 투자원금은 보전되어야 한다.',
        score: 1,
      },
      {
        choiceId: 27,
        content: '10% 미만까지는 손실을 감수할 수 있을 것 같다.',
        score: 3,
      },
      {
        choiceId: 28,
        content: '20% 미만까지는 손실을 감수할 수 있을 것 같다.',
        score: 5,
      },
      {
        choiceId: 29,
        content: '40% 미만까지는 손실을 감수할 수 있을 것 같다.',
        score: 7,
      },
      {
        choiceId: 30,
        content: '기대수익이 높다면 위험이 높아도 상관하지 않겠다.',
        score: 9,
      },
    ],
  },
]
