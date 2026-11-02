import type { SocialType } from '../types/member'

/**
 * 가입 경로(소셜 로그인) 셋. 로그인 단추·마이페이지 가입 경로·회원 정보 거르기가 이 표 하나를 쓴다(2026-11-02 — 세 곳이 따로 적어
 * 로그인 단추는 "Google", 마이페이지는 "구글"로 갈렸다). 순서는 국내에서 많이 쓰는 순이라 로그인 단추도 이 순서로 선다.
 * - `path`: 백엔드 소셜 로그인 주소 `/oauth2/authorization/{path}`
 * - `name`: 회사가 쓰는 표기(Google은 영문)
 * - `icon`: public/social의 회사 아이콘(흰 바탕 위에서 보이는 색)
 */
export const SOCIAL_PROVIDERS: readonly { type: SocialType; path: string; name: string; icon: string }[] = [
  { type: 'KAKAO', path: 'kakao', name: '카카오', icon: '/social/kakao.svg' },
  { type: 'NAVER', path: 'naver', name: '네이버', icon: '/social/naver.svg' },
  { type: 'GOOGLE', path: 'google', name: 'Google', icon: '/social/google.svg' },
]

export function isSocialType(value: unknown): value is SocialType {
  return SOCIAL_PROVIDERS.some((provider) => provider.type === value)
}

/** 가입 경로의 이름과 아이콘. 서버가 모르는 값을 주면 null — 화면이 그 줄을 빼고 그린다 */
export function socialLabel(socialType: unknown): { name: string; icon: string } | null {
  return SOCIAL_PROVIDERS.find((provider) => provider.type === socialType) ?? null
}
