import type { StockInfo } from './stock'

/** 가입 경로. 백엔드 Member.socialType과 같은 값이다 */
export type SocialType = 'NAVER' | 'KAKAO' | 'GOOGLE'

export interface MemberInfo {
  name: string
  email: string
  /**
   * "2002-05-07". null일 수 있다.
   * 백엔드 parseBirth()가 소셜에서 생년월일을 못 받으면 null을 저장하는데,
   * 구글은 기본 스코프에 생일이 없어 실제로 자주 그렇게 된다.
   */
  birth: string | null
  socialType: SocialType
}

/** PATCH /api/members/me 본문. 이름은 2~4자(화면 검사), 생일은 오늘 이전이어야 한다(서버 검증) */
export interface MemberUpdate {
  /** 바꾼 이름. null이면 서버가 이름을 바꾸지 않는다 — 안 바꾼 이름은 검사하지도 보내지도 않는다 */
  name: string | null
  /**
   * "YYYY-MM-DD" 또는 null. 서버는 null을 "바꾸지 않음"으로 봐서 지우지 못한다(Member.updateInfo) —
   * 그래서 생일이 있던 회원이 칸을 비우면 화면이 보내지 않고 막는다(MypageProfilePage)
   */
  birth: string | null
}

export interface PersonalityInfo {
  /** 보통 다섯 성향 중 하나. 서버에 성향이 늘면 모르는 이름이 온다 — 없음(null)으로 바꾸지 않는다 */
  investPersonality: string
  description: string
  /** 서버가 가진 이미지 주소. 비어 있으면 화면이 로컬 PNG로 대신한다 */
  personalityImg: string | null
}

/** GET /api/members/me/like-stocks 한 줄. 시세는 baseDate 기준 종가다. 숫자 칸은 비어 오면 null("-") */
export interface LikeStock extends StockInfo {
  closePrice: number | null
  fluctuate: number | null
  tradingValue: number | null
  /** ISO 날짜시각. 비어 오면 null */
  likedAt: string | null
}

export interface LikeStockList {
  /** YYYY-MM-DD. 비어 오면 ""(화면이 기준일 줄을 숨긴다) */
  baseDate: string
  /** 서버가 비워 보내면 받은 목록의 길이 */
  totalCount: number
  likeStockList: LikeStock[]
}

/**
 * 프로필 사진 주소. 지금은 언제나 null이다.
 *
 * 백엔드 Member 엔티티에 이미지 필드 자체가 없다. 네이버·구글 응답 DTO에는
 * 꺼내는 코드가 있는데(NaverResponse.getProfileImage, GoogleResponse의 picture)
 * CustomOAuth2MemberService가 저장하지 않고 버린다.
 * 카카오는 profile_image_needs_agreement=true라 동의 항목 설정 없이는 받아올 수도 없다.
 *
 * 필드가 생기면 이 타입을 MemberInfo에 넣고 값만 채우면 화면은 그대로 붙는다.
 */
export type ProfileImageUrl = string | null
