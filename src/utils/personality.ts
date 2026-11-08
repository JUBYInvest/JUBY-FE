import type { PersonalityType, Question } from '../types/personality'
import { filledOr } from './text'

/**
 * 서버가 성향을 가르는 점수 구간. 총점이 이 안에 들어와야 결과가 나온다.
 * 벗어나면 서버가 예외를 던진다(PersonalityTestService).
 */
const SERVER_MIN = 10
const SERVER_MAX = 90

/**
 * 문항 배점으로 나올 수 있는 총점의 최소·최대.
 *
 * 서버 채점 구간은 "10문항 × 5보기(1~9점)", 합계 10~90을 전제로 짜여 있다. 지금 서버 문항은 그대로 맞는다.
 *
 * 범위를 상수로 두지 않고 문항에서 직접 계산한다.
 * 백엔드가 문항 개수나 배점을 바꾸면 숫자를 박아 둔 환산이 어긋난다. 계산해서 쓰면 고칠 곳이 없다.
 */
function getScoreRange(questions: Question[]): { min: number; max: number } {
  let min = 0
  let max = 0

  for (const question of questions) {
    const scores = question.choices.map((choice) => choice.score)
    min += Math.min(...scores)
    max += Math.max(...scores)
  }

  return { min, max }
}

/**
 * 원점수를 서버 구간(10~90)으로 늘려 옮긴다.
 *
 *   환산점수 = 10 + (원점수 - 최소점) / (최대점 - 최소점) × 80
 *
 * 이렇게 해야 모든 보기를 최저로 고르면 안정형, 최고로 고르면 공격투자형이 나온다.
 * 서버가 정수 배열을 받으므로 반올림한다.
 *
 * 지금 서버 문항(10개, 1~9점)은 합계가 이미 10~90이라 값이 그대로다. 서버가 이름을 비워 줄 때 이름을 짓는 데만 쓴다
 * (예비 7문항은 2026-11-06 비로그인 검사를 막으며 걷었다). 문항 수가 바뀌어도 구간에 맞춰 옮긴다.
 */
export function normalizeScore(raw: number, questions: Question[]): number {
  const { min, max } = getScoreRange(questions)
  // 문항이 없거나 배점이 전부 같으면 나눌 수 없다. 하한을 돌려주고 끝낸다
  if (max === min) return SERVER_MIN

  const ratio = (raw - min) / (max - min)
  return Math.round(SERVER_MIN + ratio * (SERVER_MAX - SERVER_MIN))
}

/**
 * 서버 PersonalityTestService의 구간과 동일하게 맞춘다.
 * 서버처럼 10~90 밖(NaN 포함)이면 성향을 내지 않는다(null).
 */
export function scoreToPersonality(score: number): PersonalityType | null {
  if (!(score >= SERVER_MIN && score <= SERVER_MAX)) return null
  if (score < 15) return '안정형'
  if (score < 35) return '안정추구형'
  if (score < 55) return '위험중립형'
  if (score < 75) return '적극투자형'
  return '공격투자형'
}

const PERSONALITY_TYPES: readonly string[] = [
  '안정형',
  '안정추구형',
  '위험중립형',
  '적극투자형',
  '공격투자형',
] satisfies readonly PersonalityType[]

/** 서버가 준 성향 이름이 다섯 성향 중 하나인가. 서버에 성향이 늘면 여기에 없는 이름이 온다 */
export function isPersonalityType(value: unknown): value is PersonalityType {
  return typeof value === 'string' && PERSONALITY_TYPES.includes(value)
}

/**
 * 화면에 쓸 성향 설명·이미지. 서버 값이 먼저이고, 비면 로컬 표로 받친다.
 *
 * 이름이 다섯 성향이 아니면 로컬 표를 읽지 않는다 — `PERSONALITY_INFO[이름]`은 모르는 이름에서 던져,
 * 성향 저장은 서버에서 끝났는데 "저장하지 못했어요"가 뜨고 다시 저장할 때마다 POST가 또 나간다. 모르는 이름은 이름 그대로 두고 설명만 대신하며, 이미지는 비운다
 * (카드가 `<img>`를 그리지 않는다 — `src=""`는 지금 페이지를 다시 요청한다).
 */
export function describePersonality(
  name: string,
  description: string | null | undefined,
  imageUrl: string | null | undefined,
): { description: string; imageUrl: string } {
  const local = isPersonalityType(name) ? PERSONALITY_INFO[name] : null
  return {
    description: filledOr(description, local?.description ?? '설명을 불러오지 못했어요.'),
    imageUrl: filledOr(imageUrl, local?.imageUrl ?? ''),
  }
}

/**
 * 성향별 설명과 이미지.
 *
 * 로그인한 회원은 서버가 채점하고 description과 url을 준다. 이 표는 비로그인 채점과, 서버 값이 비어 올 때 쓴다.
 *
 * 설명의 줄바꿈은 화면에서 white-space: pre-line으로 살린다.
 * 서버 문구에 줄바꿈이 없어도 그냥 이어져 나올 뿐 깨지지 않는다.
 */
export const PERSONALITY_INFO: Record<
  PersonalityType,
  { description: string; imageUrl: string }
> = {
  안정형: {
    description:
      '원금 손실을 무엇보다 먼저 피하며\n예금·적금 수준의 안정적인 수익을 기대하는 스타일',
    imageUrl: '/personality/stable.svg',
  },
  안정추구형: {
    description:
      '원금을 지키는 것을 우선하되\n낮은 위험을 감수해 예금보다 나은 수익을 노리는 스타일',
    imageUrl: '/personality/conservative.svg',
  },
  위험중립형: {
    description:
      '안정성과 수익성 사이에서 균형을 추구하며\n시장 평균 수준의 위험을 감수하는 스타일',
    imageUrl: '/personality/neutral.svg',
  },
  적극투자형: {
    description:
      '원금 손실 위험을 감수하더라도\n시장 평균보다 높은 수익을 적극적으로 추구하는 스타일',
    imageUrl: '/personality/active.svg',
  },
  공격투자형: {
    description:
      '높은 기대수익을 좇아\n큰 폭의 손실까지 감수할 수 있는 스타일',
    imageUrl: '/personality/aggressive.svg',
  },
}
