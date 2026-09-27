import type { PersonalityType, Question } from '../types/personality'

/**
 * 서버가 성향을 가르는 점수 구간. 총점이 이 안에 들어와야 결과가 나온다.
 * 벗어나면 서버가 예외를 던진다(PersonalityTestService).
 */
const SERVER_MIN = 10
const SERVER_MAX = 90

/**
 * 문항 배점으로 나올 수 있는 총점의 최소·최대.
 *
 * 서버 채점 구간은 "10문항 × 5보기(1~9점)", 합계 10~90을 전제로 짜여 있다. 서버 문항은
 * 그대로 맞지만, 서버가 죽어 예비 문항으로 물러서면 문항 수와 배점이 달라 그대로 더한 합이
 * 서버 하한(10)에 못 미치거나 공격투자형 기준(75)에 닿지 못한다.
 *
 * 범위를 상수로 두지 않고 문항에서 직접 계산한다.
 * 백엔드가 문항을 채우는 순간 개수와 배점이 달라지는데, 숫자를 박아두면 그때 환산이 어긋난다.
 * 계산해서 쓰면 mock이든 서버 문항이든 고칠 곳이 없다.
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
 * 백엔드가 7문항 기준으로 채점 구간을 다시 잡으면 이 함수는 통째로 필요 없어진다.
 */
export function normalizeScore(raw: number, questions: Question[]): number {
  const { min, max } = getScoreRange(questions)
  // 문항이 없거나 배점이 전부 같으면 나눌 수 없다. 하한을 돌려주고 끝낸다
  if (max === min) return SERVER_MIN

  const ratio = (raw - min) / (max - min)
  return Math.round(SERVER_MIN + ratio * (SERVER_MAX - SERVER_MIN))
}

/** 서버 PersonalityTestService의 구간과 동일하게 맞춘다 */
export function scoreToPersonality(score: number): PersonalityType {
  if (score < 15) return '안정형'
  if (score < 35) return '안정추구형'
  if (score < 55) return '위험중립형'
  if (score < 75) return '적극투자형'
  return '공격투자형'
}

/**
 * 서버가 준 글이 비었으면 대신할 글을 쓴다. null·빈 문자열뿐 아니라 공백만 있는 값도
 * 빈 것으로 본다 — `||`로 고르면 "  "가 참이라 설명이 통째로 빠지고 이미지가 src=" "로 깨졌다.
 */
function textOr(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
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
 * 이름이 다섯 성향이 아니면 로컬 표를 읽지 않는다. 예전엔 `PERSONALITY_INFO[이름].description`을
 * 인자로 먼저 계산해 모르는 이름에서 던졌고, 성향 저장은 서버에서 끝났는데 "저장하지 못했어요"가 떠
 * 다시 저장할 때마다 POST가 또 나갔다. 모르는 이름은 이름 그대로 두고 설명만 대신하며, 이미지는 비운다
 * (카드가 `<img>`를 그리지 않는다 — `src=""`는 지금 페이지를 다시 요청한다).
 */
export function describePersonality(
  name: string,
  description: string | null | undefined,
  imageUrl: string | null | undefined,
): { description: string; imageUrl: string } {
  const local = isPersonalityType(name) ? PERSONALITY_INFO[name] : null
  return {
    description: textOr(description, local?.description ?? '설명을 불러오지 못했어요.'),
    imageUrl: textOr(imageUrl, local?.imageUrl ?? ''),
  }
}

/**
 * 성향별 설명과 이미지.
 *
 * 서버 채점으로 넘어가면 description과 url을 서버가 준다. 그때는 이 표가
 * 서버 값이 비어 있을 때 쓰는 대비책이 된다(personality 테이블도 아직 비어 있다).
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
