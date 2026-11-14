import type { SocialType } from '../types/member'

/**
 * 가입 경로(소셜 로그인) 셋. 로그인 단추·마이페이지 가입 경로·회원 정보 거르기가 이 표 하나를 쓴다 — 따로 적으면
 * 표기가 갈린다("Google"·"구글"). 순서는 국내에서 많이 쓰는 순이라 로그인 단추도 이 순서로 선다.
 * - `path`: 백엔드 소셜 로그인 주소 `/oauth2/authorization/{path}`
 * - `name`: 회사가 쓰는 표기(Google은 영문)
 * - `icon`: public/social의 회사 아이콘(흰 바탕 위에서 보이는 색)
 * - `ready`: 지금 로그인할 수 있는가. false면 로그인 단추가 떠나지 않고 그 단추 아래에 승인 대기 안내를 띄운다.
 *   네이버는 앱이 아직 승인 전이라 등록한 사람만 로그인된다(2026-11-14 사용자) — 승인이 나면 true로 바꾼다
 */
export const SOCIAL_PROVIDERS: readonly { type: SocialType; path: string; name: string; icon: string; ready: boolean }[] = [
  { type: 'KAKAO', path: 'kakao', name: '카카오', icon: '/social/kakao.svg', ready: true },
  { type: 'NAVER', path: 'naver', name: '네이버', icon: '/social/naver.svg', ready: false },
  { type: 'GOOGLE', path: 'google', name: 'Google', icon: '/social/google.svg', ready: true },
]

export function isSocialType(value: unknown): value is SocialType {
  return SOCIAL_PROVIDERS.some((provider) => provider.type === value)
}

/** 가입 경로의 이름과 아이콘. 서버가 모르는 값을 주면 null — 화면이 그 줄을 빼고 그린다 */
export function socialLabel(socialType: unknown): { name: string; icon: string } | null {
  return SOCIAL_PROVIDERS.find((provider) => provider.type === socialType) ?? null
}
