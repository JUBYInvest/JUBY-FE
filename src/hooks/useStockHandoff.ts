import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toCommunityPost, type CommunityPost } from '../api/community'
import { isStockCode } from '../api/stock'
import { PERIODS } from '../utils/backtest'
import type { BacktestPeriod } from '../types/backtest'
import type { StockInfo } from '../types/stock'

/**
 * 종목 상세의 바로 가기('이 종목 백테스트'·'AI에게 물어보기')가 navigate state에 싣는 종목.
 * 받는 화면이 그 종목으로 곧바로 실행한다(백테스트 계산, AI 질문). 주소에 달지 않는 건 새로고침·공유한 주소로
 * 다시 실행되면 안 돼서다 — state도 주소 기록에 남으므로 받는 쪽이 한 번 읽고 비운다(useStockHandoff).
 */
export function toStockHandoff(stock: StockInfo): { handoff: StockInfo } {
  return { handoff: stock }
}

/**
 * 백테스트 화면에 종목과 함께(또는 종목 없이) 싣는 전략·기간. 마이페이지의 '최근 본 백테스트'(같은 조건으로 다시 보기)와
 * 투자유형의 '이 전략으로 백테스트'가 싣는다. 기간이 null이면 전략만 골라 둔다
 */
interface BacktestPlan {
  investType: number
  period: BacktestPeriod | null
}

export function toBacktestHandoff(
  stock: StockInfo | null,
  plan: BacktestPlan,
): { handoff?: StockInfo; plan: BacktestPlan } {
  return stock === null ? { plan } : { handoff: stock, plan }
}

/**
 * 마이페이지 '최근 AI 대화'가 싣는 대화방 번호. AI 화면이 목록을 받은 뒤 그 방을 연다
 */
export function toSessionHandoff(sessionId: number): { openSession: number } {
  return { openSession: sessionId }
}

/**
 * 글 줄(홈·커뮤니티 목록)·글쓰기가 글 상세로 싣는 글. 번호가 아니라 글을 싣는 건, 보고 있는 동안 들어온 새 글이
 * 글 상세가 따로 받는 처음 목록에 없을 수 있어서다(글 하나를 받는 API도 아직 없다)
 */
export function toCommunityHandoff(post: CommunityPost): { communityPost: CommunityPost } {
  return { communityPost: post }
}

/** 이 파일이 싣는 state 칸. 받는 화면은 이 중 하나라도 있으면 읽은 뒤 state를 비운다 */
const HANDOFF_KEYS = ['handoff', 'plan', 'openSession', 'communityPost'] as const

function field(state: unknown, key: (typeof HANDOFF_KEYS)[number]): unknown {
  if (typeof state !== 'object' || state === null || !(key in state)) return undefined
  return (state as Record<string, unknown>)[key]
}

/** 모양이 틀리면(종목코드가 여섯 자리 숫자가 아니거나 이름이 빈 문자열) 없는 셈 친다 */
function readHandoff(state: unknown): StockInfo | null {
  const handoff = field(state, 'handoff')
  if (typeof handoff !== 'object' || handoff === null) return null
  const { stockCode, stockName } = handoff as Record<string, unknown>
  if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return null
  if (typeof stockName !== 'string' || stockName.trim() === '') return null
  return { stockCode, stockName }
}

/** 성향 번호는 1~5, 기간은 아는 값이거나 null. 틀리면 없는 셈 친다 */
function readPlan(state: unknown): BacktestPlan | null {
  const plan = field(state, 'plan')
  if (typeof plan !== 'object' || plan === null) return null
  const { investType, period } = plan as Record<string, unknown>
  if (typeof investType !== 'number' || !Number.isInteger(investType) || investType < 1 || investType > 5) return null
  if (period === null) return { investType, period: null }
  const known = PERIODS.find((item) => item.period === period)
  return known === undefined ? null : { investType, period: known.period }
}

function readSession(state: unknown): number | null {
  const sessionId = field(state, 'openSession')
  return typeof sessionId === 'number' && Number.isInteger(sessionId) && sessionId > 0 ? sessionId : null
}

/** 주소 기록에 남은 값이라 서버 글과 같은 검사(toCommunityPost)를 다시 거친다 */
function readCommunityPost(state: unknown): CommunityPost | null {
  const post = field(state, 'communityPost')
  return post === undefined ? null : toCommunityPost(post)
}

/**
 * 처음 그릴 때 한 번만 읽고, 곧바로 같은 주소로 바꿔 넣으며(replace) state를 비운다. 그대로 두면 새로고침·뒤로 갔다
 * 앞으로 오기에 같은 state가 살아 있어 백테스트가 다시 계산되고 AI 방이 또 생긴다. 읽은 값은 이 화면이 떠 있는 동안 그대로다 —
 * 언제 실행할지(성향·대화방 목록을 기다린 뒤 한 번)는 부르는 화면이 정한다.
 */
function useHandoffState<T>(read: (state: unknown) => T): T {
  const location = useLocation()
  const navigate = useNavigate()
  const [value] = useState(() => read(location.state))

  useEffect(() => {
    if (!HANDOFF_KEYS.some((key) => field(location.state, key) !== undefined)) return
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location.pathname, location.search, location.state, navigate])

  return value
}

/** 백테스트 화면이 받는 종목과 전략·기간. 둘 다 없을 수 있다 */
export function useBacktestHandoff(): { stock: StockInfo | null; plan: BacktestPlan | null } {
  return useHandoffState((state) => ({ stock: readHandoff(state), plan: readPlan(state) }))
}

/**
 * AI 화면이 받는 종목(상세 'AI에게 물어보기')과 대화방 번호(마이페이지 '최근 AI 대화'). 둘 다 없을 수 있다.
 * 한 훅으로 한 번에 읽는다 — 훅 둘을 따로 쓰면 state를 비우는 replace 이동이 같은 커밋에서 두 번 나간다
 */
export function useAiHandoff(): { stock: StockInfo | null; session: number | null } {
  return useHandoffState((state) => ({ stock: readHandoff(state), session: readSession(state) }))
}

/** 글 상세가 받는 글(글 줄을 눌러 왔을 때). 주소로 바로 열면 null */
export function useCommunityHandoff(): CommunityPost | null {
  return useHandoffState(readCommunityPost)
}

/** 글쓰기 화면이 받는 종목(커뮤니티 목록에서 종목 카드를 고른 채 "글쓰기"를 눌렀을 때 — 그 종목 이야기로 쓴다). 없으면 null */
export function useCommunityWriteHandoff(): StockInfo | null {
  return useHandoffState(readHandoff)
}
