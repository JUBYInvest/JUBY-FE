import { readJson, writeJson } from './cache'
import { getAccountId } from './auth'
import { PERIODS, findInvestType } from './backtest'
import { isStockCode } from '../api/stock'
import type { BacktestPeriod } from '../types/backtest'

/**
 * 최근 본 백테스트. 서버는 실행 결과를 저장하지 않아서(`/api/backtest/run`은 저장하지 않고 프리셋은 배치가 덮어쓴다)
 * **이 브라우저에만** 남긴다 — 다른 기기에서는 보이지 않고, 화면도 그렇게 적는다(마이페이지 한눈에 보기).
 *
 * **계정별이다**. 저장값에 주인(토큰의 subject — `utils/auth getAccountId`)을 적어 두고, 읽을 때 지금 계정의 것만 돌려준다.
 * 다른 계정이 결과를 보면 앞 계정의 줄은 버리고 새로 적는다 — 로그아웃 없이 다른 탭·콜백으로 다른 계정이 로그인해도 앞 사람의 기록이
 * 보이지 않는다.
 * 로그아웃·탈퇴하면 지운다(api/auth.ts clearSession). 토큰 만료로 풀린 것은 지우지 않는다 — 같은 사람이 다시 로그인하면 그대로 보인다.
 * 계정 번호를 모르는 토큰(JWT가 아님)이면 남기지도 보여 주지도 않는다.
 */
interface RecentBacktest {
  stockCode: string
  stockName: string
  investType: number
  period: BacktestPeriod
  finalScore: number
  /** 본 때(ms) */
  viewedAt: number
}

/** 저장 모양. 주인이 없는 옛 배열 모양은 못 읽는 값으로 버린다 */
interface Stored {
  owner: string
  rows: RecentBacktest[]
}

const KEY = 'recentBacktests'
/** 마이페이지가 보여 주는 줄 수보다 넉넉히 둔다. 같은 조건은 한 줄로 합친다 */
const MAX_ENTRIES = 10

function isRecent(value: unknown): value is RecentBacktest {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.stockCode === 'string' &&
    isStockCode(row.stockCode) &&
    typeof row.stockName === 'string' &&
    row.stockName.trim() !== '' &&
    typeof row.investType === 'number' &&
    // 전략 표에 없는 번호(손댄 값, 표가 줄어든 뒤)는 읽을 때 버린다 — 받는 쪽(useStockHandoff readPlan)이 버리면 그 줄은
    // 종목만 실린 채 '내 추천 전략·1년'으로 자동 실행돼 누른 줄과 다른 결과가 뜬다
    findInvestType(row.investType) !== null &&
    PERIODS.some((item) => item.period === row.period) &&
    typeof row.finalScore === 'number' &&
    Number.isFinite(row.finalScore) &&
    typeof row.viewedAt === 'number' &&
    Number.isFinite(row.viewedAt)
  )
}

/** 지금 계정의 줄만, 최근 본 순. 모양이 틀린 줄과 다른 계정의 줄은 빼고 읽는다 */
export function readRecentBacktests(): RecentBacktest[] {
  const owner = getAccountId()
  if (owner === null) return []
  const saved = readJson(KEY)
  if (typeof saved !== 'object' || saved === null) return []
  const { owner: savedOwner, rows } = saved as Partial<Record<keyof Stored, unknown>>
  if (savedOwner !== owner || !Array.isArray(rows)) return []
  return rows.filter(isRecent).sort((left, right) => right.viewedAt - left.viewedAt)
}

/** 결과를 받을 때마다 맨 앞에 넣는다. 같은 종목·전략·기간이면 옛 줄을 지우고 새로 넣는다. 다른 계정의 줄은 이때 버려진다 */
export function rememberBacktest(entry: Omit<RecentBacktest, 'viewedAt'>): void {
  const owner = getAccountId()
  if (owner === null) return
  const others = readRecentBacktests().filter(
    (row) =>
      row.stockCode !== entry.stockCode ||
      row.investType !== entry.investType ||
      row.period !== entry.period,
  )
  const stored: Stored = { owner, rows: [{ ...entry, viewedAt: Date.now() }, ...others].slice(0, MAX_ENTRIES) }
  writeJson(KEY, stored)
}

export function forgetRecentBacktests(): void {
  writeJson(KEY, null)
}
