import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import PersonalityScale from '../components/PersonalityScale'
import { getSessions } from '../api/ai'
import { getLikeStocks, getMemberInfo, getMyPersonality } from '../api/member'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLoad, type Load } from '../hooks/useLoad'
import { toBacktestHandoff, toSessionHandoff } from '../hooks/useStockHandoff'
import { findByPersonality, findInvestType, periodLabel } from '../utils/backtest'
import { toKoreanDate, toYmd } from '../utils/date'
import { formatChangeRate, formatPrice, isFiniteNumber, isFlatRate, rateTone } from '../utils/format'
import { isPersonalityType } from '../utils/personality'
import { readRecentBacktests } from '../utils/recentBacktests'
import { socialLabel } from '../utils/social'
import { toQuotePreviewState } from '../utils/stockPreview'
import type { ChatSession } from '../types/ai'
import type { LikeStock, LikeStockList, MemberInfo, PersonalityInfo } from '../types/member'
import { basisLabel } from '../utils/priceBasis'
import styles from './MypageHomePage.module.css'

/** 칸마다 보여 주는 줄 수. 전부는 각 화면(주식 모아보기·AI 주가분석)에서 본다 */
const ROWS = 4

/**
 * 마이페이지 첫 화면(2026-10-30). 흩어진 내 기록을 한 화면에 모으고, 칸마다 그 기록이 사는 화면으로 가는 단추를 하나씩 둔다.
 * 요청은 이미 있는 API 넷(내 정보·성향·관심종목·대화방 목록)이고 증권사 호출은 없다. 최근 본 백테스트는 서버에 기록이 없어
 * 이 브라우저에 남긴 것을 읽는다(utils/recentBacktests.ts).
 * 칸마다 따로 받고 따로 실패한다(hooks/useLoad) — 대화 목록이 실패해도 관심종목은 보인다.
 */
export default function MypageHomePage() {
  useDocumentTitle('마이페이지')
  const [member, retryMember] = useLoad(getMemberInfo, '회원 정보')
  const [personality, retryPersonality] = useLoad(getMyPersonality, '투자성향')
  const [likes, retryLikes] = useLoad(getLikeStocks, '관심종목')
  const [sessions, retrySessions] = useLoad(getSessions, 'AI 대화 목록')

  return (
    <div className={styles.home}>
      <MemberLine state={member} onRetry={retryMember} />

      <div className={styles.grid}>
        <Section
          title="내 투자성향"
          more={{ to: '/mypage/personality', label: '투자유형 보기' }}
        >
          <PersonalityPart state={personality} onRetry={retryPersonality} />
        </Section>

        <Section title="관심종목" more={{ to: '/likes', label: '전체 보기' }}>
          <LikesPart state={likes} onRetry={retryLikes} />
        </Section>

        <Section title="최근 본 백테스트" more={{ to: '/backtest', label: '주식 백테스트' }}>
          <BacktestPart />
        </Section>

        <Section title="최근 AI 대화" more={{ to: '/ai', label: 'AI 주가분석' }}>
          <SessionsPart state={sessions} onRetry={retrySessions} />
        </Section>
      </div>
    </div>
  )
}

function Section({
  title,
  more,
  children,
}: {
  title: string
  more: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <Link to={more.to} className={styles.more}>
          {more.label}
        </Link>
      </div>
      {children}
    </section>
  )
}

/** 칸 안의 실패. 칸 자리를 지키며 다시 시도를 준다 */
function Failed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className={styles.failed}>
      <p className={styles.failedText}>{text}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        다시 시도
      </button>
    </div>
  )
}

function Skeleton() {
  return <div className={styles.skeleton} aria-label="불러오는 중" />
}

/** 빈 칸. 무엇을 하면 채워지는지와 그 단추 */
function Empty({ text, action }: { text: string; action: { to: string; label: string } }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyText}>{text}</p>
      <Link to={action.to} className={styles.emptyAction}>
        {action.label}
      </Link>
    </div>
  )
}

/* ── 내 정보 한 줄 ──────────────────────────────────────────────────── */

function MemberLine({ state, onRetry }: { state: Load<MemberInfo>; onRetry: () => void }) {
  if (state.kind === 'loading') return <div className={styles.memberSkeleton} aria-label="불러오는 중" />
  if (state.kind === 'error') {
    return (
      <div className={styles.member}>
        <Failed text="회원 정보를 불러오지 못했어요." onRetry={onRetry} />
      </div>
    )
  }
  const { name, email, socialType } = state.value
  const social = socialLabel(socialType)
  return (
    <div className={styles.member}>
      <div className={styles.memberText}>
        <p className={styles.memberName}>{name !== '' ? `${name} 님` : '회원님'}</p>
        <p className={styles.memberAccount}>
          {social !== null && (
            <span className={styles.social}>
              <img src={social.icon} alt="" width={16} height={16} />
              {social.name}로 가입한 계정
            </span>
          )}
          <span>{email}</span>
        </p>
      </div>
      <Link to="/mypage/profile" className={styles.memberEdit}>
        내 정보 확인
      </Link>
    </div>
  )
}

/* ── 내 투자성향 ────────────────────────────────────────────────────── */

function PersonalityPart({ state, onRetry }: { state: Load<PersonalityInfo | null>; onRetry: () => void }) {
  if (state.kind === 'loading') return <Skeleton />
  if (state.kind === 'error') return <Failed text="투자성향을 불러오지 못했어요." onRetry={onRetry} />

  const info = state.value
  if (info === null) {
    return (
      <div className={styles.personality}>
        <p className={styles.lead}>아직 투자성향 검사를 하지 않았어요</p>
        <PersonalityScale mine={null} />
        <p className={styles.note}>10문항이면 끝나요. 검사하면 나에게 맞는 백테스트 전략을 골라 드려요.</p>
        <div className={styles.actions}>
          <Link to="/personality-test?from=mypage" className={styles.primary}>
            검사하러 가기
          </Link>
        </div>
      </div>
    )
  }

  const name = info.investPersonality
  const known = isPersonalityType(name) ? name : null
  const strategy = known === null ? null : findByPersonality(known)
  return (
    <div className={styles.personality}>
      <p className={styles.lead}>{name}</p>
      <PersonalityScale mine={known} />
      {strategy !== null && (
        <dl className={styles.facts}>
          <div>
            <dt>맞는 전략</dt>
            <dd>{strategy.strategyName}</dd>
          </div>
          <div>
            <dt>사는 때</dt>
            <dd>{strategy.entryRule}</dd>
          </div>
        </dl>
      )}
      <div className={styles.actions}>
        {strategy !== null && (
          <Link
            to="/backtest"
            state={toBacktestHandoff(null, { investType: strategy.investType, period: null })}
            className={styles.primary}
          >
            내 전략으로 백테스트
          </Link>
        )}
        <Link to="/personality-test?from=mypage" className={styles.secondary}>
          검사 다시하기
        </Link>
      </div>
    </div>
  )
}

/* ── 관심종목 ──────────────────────────────────────────────────────── */

/** 오늘 가장 크게 움직인 순. 등락률이 빈 종목은 뒤로 */
function byMove(stocks: LikeStock[]): LikeStock[] {
  return [...stocks].sort((left, right) => {
    const a = isFiniteNumber(left.fluctuate) ? Math.abs(left.fluctuate) : -1
    const b = isFiniteNumber(right.fluctuate) ? Math.abs(right.fluctuate) : -1
    return b - a
  })
}

function rateClassName(rate: number | null): string {
  const tone = rateTone(rate)
  return tone === 'flat' ? '' : styles[tone]
}

function LikesPart({ state, onRetry }: { state: Load<LikeStockList>; onRetry: () => void }) {
  if (state.kind === 'loading') return <Skeleton />
  if (state.kind === 'error') return <Failed text="관심종목을 불러오지 못했어요." onRetry={onRetry} />

  const { likeStockList: stocks, baseDate, realtime } = state.value
  if (stocks.length === 0) {
    return (
      <Empty
        text="아직 담은 종목이 없어요. 시세표나 종목 화면에서 하트를 누르면 여기에 모여요."
        action={{ to: '/', label: '종목 보러 가기' }}
      />
    )
  }

  const rated = stocks.filter((s) => isFiniteNumber(s.fluctuate) && !isFlatRate(s.fluctuate))
  const ups = rated.filter((s) => (s.fluctuate ?? 0) > 0).length
  const downs = rated.length - ups
  const base = basisLabel({ baseDate, asOf: null, realtime }, false)

  return (
    <>
      <p className={styles.lead}>
        {stocks.length}개 중 {ups}개 올랐고 {downs}개 내렸어요
      </p>
      <p className={styles.note}>오늘 가장 크게 움직인 종목{base !== '' && `, ${base}`}</p>
      <ul className={styles.rows}>
        {byMove(stocks)
          .slice(0, ROWS)
          .map((stock) => (
            <li key={stock.stockCode}>
              {/* 이름·기준일 종가를 실어 상세가 응답 전에 그 자리를 채운다(홈 시세표와 같다) */}
              <Link
                to={`/stocks/${stock.stockCode}`}
                state={toQuotePreviewState(stock, baseDate)}
                className={styles.row}
              >
                <span className={styles.rowMain}>{stock.stockName}</span>
                <span className={styles.rowNumber}>{formatPrice(stock.closePrice)}</span>
                <span className={`${styles.rowRate} ${rateClassName(stock.fluctuate)}`}>
                  {formatChangeRate(stock.fluctuate)}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </>
  )
}

/* ── 최근 본 백테스트 ───────────────────────────────────────────────── */

function BacktestPart() {
  // 이 화면을 여는 순간의 기록. 백테스트를 본 뒤 돌아오면 다시 마운트되어 새로 읽는다
  const [recent] = useState(readRecentBacktests)

  if (recent.length === 0) {
    return (
      <Empty
        text="아직 본 백테스트가 없어요. 결과를 보면 여기에 남아 같은 조건으로 다시 볼 수 있어요."
        action={{ to: '/backtest', label: '백테스트 하러 가기' }}
      />
    )
  }

  return (
    <>
      <p className={styles.note}>이 브라우저에서 본 결과만 남아요. 누르면 같은 조건으로 다시 계산해요.</p>
      <ul className={styles.rows}>
        {recent.slice(0, ROWS).map((row) => {
          const strategy = findInvestType(row.investType)
          return (
            <li key={`${row.stockCode}|${row.investType}|${row.period}`}>
              <Link
                to="/backtest"
                state={toBacktestHandoff(
                  { stockCode: row.stockCode, stockName: row.stockName },
                  { investType: row.investType, period: row.period },
                )}
                className={styles.row}
              >
                <span className={styles.rowMain}>
                  {row.stockName}
                  <small className={styles.rowSub}>
                    <span>{strategy?.strategyName ?? '알 수 없는 전략'}</span>
                    <span>{periodLabel(row.period)}</span>
                  </small>
                </span>
                <span className={styles.rowNumber}>{row.finalScore.toFixed(1)}점</span>
                <span className={styles.rowDate}>{toKoreanDate(toYmd(new Date(row.viewedAt)))}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/* ── 최근 AI 대화 ──────────────────────────────────────────────────── */

function SessionsPart({ state, onRetry }: { state: Load<ChatSession[]>; onRetry: () => void }) {
  if (state.kind === 'loading') return <Skeleton />
  if (state.kind === 'error') return <Failed text="AI 대화 목록을 불러오지 못했어요." onRetry={onRetry} />

  const list = state.value
  if (list.length === 0) {
    return (
      <Empty
        text="아직 AI와 나눈 대화가 없어요. 궁금한 종목을 말로 물어보세요."
        action={{ to: '/ai', label: 'AI에게 물어보기' }}
      />
    )
  }

  return (
    <ul className={styles.rows}>
      {list.slice(0, ROWS).map((session) => (
        <li key={session.sessionId}>
          <Link to="/ai" state={toSessionHandoff(session.sessionId)} className={styles.row}>
            <span className={styles.rowTitle}>{session.title}</span>
            <span className={styles.rowDate}>{toKoreanDate(session.updatedDate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
