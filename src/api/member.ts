import { ApiError, get, malformedResponse, patch, post, remove, unchecked } from './client'
import { isStockCode, nameOrCode } from './stock'
import { clearTokens } from '../utils/auth'
import type {
  LikeStock,
  LikeStockList,
  MemberInfo,
  MemberUpdate,
  PersonalityInfo,
} from '../types/member'

/**
 * 회원 창구. 전부 로그인이 필요하다(토큰이 없거나 만료면 서버가 401을 주고
 * client.ts가 로그인 화면으로 보낸다).
 */

/**
 * 내 정보. 본문이 비어 오면 그리다가 null.birth를 읽어 화면 전체가 오류 화면이 되므로
 * 여기서 실패로 바꿔 던진다. 이름·이메일·생일 낱개가 빈 건 화면이 받아낸다.
 */
export async function getMemberInfo(): Promise<MemberInfo> {
  const member = await get<MemberInfo | null>('/api/members/me')
  if (member === null || typeof member !== 'object') throw malformedResponse()
  return member
}

/**
 * 이름·생일 수정. 서버가 이름 2~4자, 생일은 오늘 이전인지 검사하고 어긋나면 400을 준다.
 * 화면은 서버 message를 그대로 쓰지 않고 이 두 규칙을 적은 고정 문구를 보여준다.
 */
export async function updateMemberInfo(update: MemberUpdate): Promise<void> {
  await patch<{ modifiedDate: string }>('/api/members/me', update)
}

/**
 * 저장된 내 투자성향. 아직 검사하지 않았으면 null.
 *
 * 검사하지 않은 회원에게 서버는 **404(MEMBER404_2)** 를 준다
 * (MemberService.getPersonalityInfo). 갓 가입한 회원이 전부 여기에 해당하므로
 * 이 404는 실패가 아니라 "없음"이다. 본문이 null이거나 성향 이름이 빈 경우도 같이 받아준다.
 *
 * 다만 **그 밖의 통신·서버 오류는 삼키지 않고 던진다.** 부르는 쪽이
 * "아직 검사 안 함"과 "못 불러옴"을 다른 화면으로 보여줘야 하기 때문이다.
 */
export async function getMyPersonality(options?: {
  ignoreUnauthorized?: boolean
}): Promise<PersonalityInfo | null> {
  let result: PersonalityInfo | null
  try {
    result = await get<PersonalityInfo | null>('/api/members/me/personality', options)
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'MEMBER404_2') return null
    throw error
  }
  // 성향 이름이 없으면 결과 화면을 그릴 수 없다. 없는 것으로 본다
  return result === null || !result.investPersonality ? null : result
}

/**
 * 로그인 없이도 쓰는 화면(백테스트·AI)이 들어오자마자 부르는 성향 조회.
 *
 * 토큰이 만료됐으면 서버가 401을 주는데, 전역 처리대로 로그인 화면으로 보내면 로그인이 필요 없는 화면을
 * 열었는데도 아무것도 누르기 전에 끌려간다. 여기서는 토큰만 지우고(머리글이 "로그인"으로 돌아간다)
 * 성향 없음으로 본다. 사용자가 직접 한 동작(질문 보내기·하트·마이페이지)의 401은 지금처럼 로그인 화면으로 간다.
 * 401이 아닌 실패는 던진다 — 부르는 쪽이 "없음"과 "못 불러옴"을 가른다.
 */
export async function getMyPersonalityOnPublicPage(): Promise<PersonalityInfo | null> {
  try {
    return await getMyPersonality({ ignoreUnauthorized: true })
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      clearTokens()
      return null
    }
    throw error
  }
}

/** 탈퇴. 성공하면 계정과 성향 정보가 서버에서 모두 지워진다 */
export function deleteMember(): Promise<null> {
  return remove<null>('/api/members/me')
}

/* ── 관심종목 ─────────────────────────────────────────────────────────── */

/**
 * 관심종목 등록. 이미 등록된 종목을 또 보내면 서버가 409를 준다.
 * 홈의 하트가 낙관적으로 먼저 켜지고 이 요청이 실패하면 되돌린다.
 */
export async function likeStock(stockCode: string): Promise<void> {
  await post<unknown>('/api/members/me/like-stocks', { stockCode })
}

export async function unlikeStock(stockCode: string): Promise<void> {
  await remove<unknown>(
    `/api/members/me/like-stocks/${encodeURIComponent(stockCode)}`,
  )
}

/**
 * 내 관심종목 목록. 시세는 baseDate 종가 기준이다.
 * 목록이 배열이 아니면 화면이 그리다 `null.length`에서 던져 구역 경계까지 올라갔다 — 여기서 응답 모양 오류로 던져
 * 화면의 "불러오지 못했습니다 + 다시 시도"를 태운다. 기준일은 비어도 된다(화면이 그 줄만 숨긴다).
 */
export async function getLikeStocks(): Promise<LikeStockList> {
  const result = await get<LikeStockListResponse | null>('/api/members/me/like-stocks')
  if (typeof result !== 'object' || result === null || !Array.isArray(result.likeStockList)) {
    throw malformedResponse()
  }
  const likeStockList = result.likeStockList.flatMap(toLikeStock)
  if (likeStockList.length < result.likeStockList.length) {
    console.warn(`종목코드가 틀린 관심종목 ${result.likeStockList.length - likeStockList.length}개를 뺐습니다`)
  }
  return {
    // 기준일이 빈 건 화면이 그 줄을 숨긴다(fromDashedYmd → "")
    baseDate: unchecked(result.baseDate),
    totalCount: unchecked(result.totalCount),
    likeStockList,
  }
}

/*
 * 서버가 실제로 주는 모양. 스웨거에 필수 표시가 없어 필드를 전부 비어 올 수 있게 적는다.
 * 화면 타입(types/member.ts)으로 옮기는 자리에서 걸러 내고, 걸러 내지 않은 값은 unchecked()로 넘긴다.
 */

/** GET /api/members/me/like-stocks */
interface LikeStockListResponse {
  /** YYYY-MM-DD */
  baseDate?: string | null
  totalCount?: number | null
  likeStockList?: (LikeStockResponse | null)[] | null
}

interface LikeStockResponse {
  stockCode?: string | null
  stockName?: string | null
  closePrice?: number | null
  fluctuate?: number | null
  tradingValue?: number | null
  likedAt?: string | null
}

/**
 * 종목코드가 없거나 틀린 행은 뺀다 — 링크가 `/stocks/null`, 해제 요청이 `/like-stocks/null`로 나갔다(2026-09-27 확인).
 * 이름이 비면 종목코드로 대신한다. 값 칸이 빈 건 포맷 함수가 "-"로 적는다
 */
function toLikeStock(row: LikeStockResponse | null): LikeStock[] {
  if (typeof row !== 'object' || row === null) return []
  const { stockCode } = row
  if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return []
  return [{
    stockCode,
    stockName: nameOrCode(row.stockName, stockCode),
    closePrice: unchecked(row.closePrice),
    fluctuate: unchecked(row.fluctuate),
    tradingValue: unchecked(row.tradingValue),
    likedAt: unchecked(row.likedAt),
  }]
}
