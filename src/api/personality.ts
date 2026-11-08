import { get, post } from './client'
import { forgetMyPersonality } from './member'
import { isFiniteNumber } from '../utils/format'
import {
  describePersonality,
  normalizeScore,
  scoreToPersonality,
} from '../utils/personality'
import type { Choice, PersonalityResult, Question } from '../types/personality'
import { isFilledText } from '../utils/text'

/*
 * 성향 테스트는 로그인한 회원만 한다(2026-11-06 사용자 결정 — 화면이 비로그인에게는 로그인 안내만 둔다).
 * 문항 GET·결과 POST 모두 인증 경로다. DB에 **10문항 × 보기 5개(1·3·5·7·9점)**가 있고 합계 10~90이 서버 채점 구간과 맞는다.
 * 서버가 채점하고 회원에 저장한다. 문항을 못 받으면 예비 문항으로 물러서지 않고 실패로 알린다 — 저장되는 결과라 서버 문항이어야 한다.
 */

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
 * 보기도 같은 이유로 choiceId 순으로 세운다.
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
 * 합이 NaN이 돼 채점이 어긋난다.
 */
function toQuestion(question: QuestionResponse | null): Question | null {
  if (typeof question !== 'object' || question === null) return null
  const { questionId, content, choices } = question
  if (!isFiniteNumber(questionId) || !isFilledText(content)) return null
  if (!Array.isArray(choices) || choices.length === 0) return null

  const parsed = choices.map(toChoice)
  if (!parsed.every((choice): choice is Choice => choice !== null)) return null
  if (new Set(parsed.map((choice) => choice.choiceId)).size !== parsed.length) return null
  return { questionId, content, choices: parsed }
}

function toChoice(choice: ChoiceResponse | null): Choice | null {
  if (typeof choice !== 'object' || choice === null) return null
  const { choiceId, content, score } = choice
  if (!isFiniteNumber(choiceId) || !isFilledText(content) || !isFiniteNumber(score)) return null
  return { choiceId, content, score }
}

/**
 * 서버 문항을 받는다. 못 받으면(실패·빈 목록·모양이 틀림) 던진다 — 화면은 실패 안내와 다시 시도를 둔다.
 */
export async function getQuestions(): Promise<Question[]> {
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
  return sortByIds(parsed)
}

/**
 * 고른 보기의 점수들을 서버에 보내 성향을 받는다(서버가 채점하고 회원에 저장한다).
 *
 * questions를 같이 받는 이유는 서버가 이름을 비워 줄 때 같은 구간표로 이름을 짓는 데 배점 범위가 필요해서다.
 */
export async function submitTest(questions: Question[], scores: number[]): Promise<PersonalityResult> {
  const raw = scores.reduce((sum, score) => sum + score, 0)
  // 서버 문항(10개, 1~9점)이면 합계가 이미 10~90이라 환산해도 값이 같다
  const normalized = normalizeScore(raw, questions)

  // 서버는 받은 배열을 전부 더해 구간에 넣는다. 명세대로 낱개 점수를 보낸다
  const result = await post<TestResultResponse | null>('/api/personality-tests', { scores })
  forgetMyPersonality()

  /*
   * 여기까지 왔으면 서버는 이미 저장을 끝냈다. 여기서 던지면 화면이 "저장하지 못했어요"를 띄우고
   * 다시 저장할 때마다 또 저장된다 — 이름을 몰라도, 본문이 비어 와도 던지지 않는다.
   * 이름이 비면 같은 구간표로 프론트가 채점한 이름을 쓴다(서버와 같은 표·같은 점수라 결과가 같다).
   * personality 테이블이 비어 있으면 설명과 이미지가 빈 문자열로 온다. 그때는 로컬 문구를 쓴다(describePersonality)
   */
  const saved: TestResultResponse = typeof result === 'object' && result !== null ? result : {}
  // 서버가 받아 저장했으니 범위 안이다. 그래도 못 내면 이름 자리를 비운다
  const name = isFilledText(saved.personalityName)
    ? saved.personalityName
    : (scoreToPersonality(normalized) ?? '')
  return {
    type: name,
    ...describePersonality(name, saved.description, saved.url),
  }
}
