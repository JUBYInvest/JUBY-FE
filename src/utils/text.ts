/*
 * 서버 응답의 글 칸 거르기(CLAUDE.md "응답 거르기" — 문자열은 typeof). 숫자 칸은 utils/format.ts finiteOrNull.
 * "비었다"는 문자열이 아니거나 공백뿐인 것이다 — `||`로 고르면 "  "가 참이라 빈 제목·이름이 그대로 나가고 이미지 주소가 src=" "로 깨진다.
 */

/** 공백이 아닌 글이 든 문자열인가 */
export function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 공백이 아닌 글이면 그대로(다듬지 않는다), 아니면 fallback */
export function filledOr<T>(value: unknown, fallback: T): string | T {
  return isFilledText(value) ? value : fallback
}

/** 문자열이면 그대로, 아니면 "". 한 줄의 null 하나가 목록 전체를 실패시키지 않게 한다 */
export function textOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
