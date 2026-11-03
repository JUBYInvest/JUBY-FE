import { useId } from 'react'
import { Link } from 'react-router-dom'
import { toStockHandoff } from '../hooks/useStockHandoff'
import type { LikeView } from '../hooks/useLikeToggle'
import type { StockInfo } from '../types/stock'
import HeartIcon from './HeartIcon'
import styles from '../pages/StockChartPage.module.css'

/*
 * 종목 상세 머리 띠의 단추들(2026-10-31 pages/StockChartPage.tsx에서 나눔) — 관심종목 토글(하트)과 바로 가기 둘(이 종목 백테스트·
 * AI에게 물어보기). 하트의 상태·동작은 hooks/useLikeToggle, 비로그인 안내 모달은 화면(StockChartPage)이 연다.
 */

/** 관심종목 토글. 종목명 줄 오른쪽 끝의 작은 테두리 단추(하트 + "관심종목")다 */
export function LikeToggle({ like, onToggle }: { like: LikeView; onToggle: () => void }) {
  const liked = like.kind === 'ready' && like.liked
  return (
    <button
      type="button"
      className={liked ? styles.likeOn : styles.like}
      onClick={onToggle}
      // 받는 중이거나 못 받았으면 켜져 있는지 모른다. 모르는 채로 바꾸지 않는다. 비로그인은 눌러서 로그인 안내를 본다
      disabled={like.kind === 'loading' || like.kind === 'error'}
      aria-pressed={liked}
      aria-label={liked ? '관심종목 해제' : '관심종목 추가'}
    >
      <HeartIcon filled={liked} />
      {/* 보이는 글은 이름("관심종목 추가/해제")에 들어 있다 */}
      관심종목
    </button>
  )
}

/** 바로 가기 두 단추. 백테스트가 주 행동이라 브랜드 초록으로 채우고, AI는 먹 테두리다(2026-10-30 재정비, 시안 B) */
const ACTIONS = [
  {
    to: '/backtest',
    name: '이 종목 백테스트',
    desc: '전략을 과거 주가에 적용해 점수로 보여드려요',
    primary: true,
  },
  {
    to: '/ai',
    name: 'AI에게 물어보기',
    desc: '왜 올랐는지, 나와 맞는지 물어보세요',
    primary: false,
  },
] as const

interface ActionPanelProps {
  title: string
  /** 실어 갈 종목. 종목명을 아직 모르면 null — 두 줄을 링크로 두지 않는다 */
  stock: StockInfo | null
  /** 비로그인이면 로그인 주소(로그인하면 이 상세로 돌아온다). 로그인했으면 null */
  loginPath: string | null
}

/**
 * 정보 열의 바로 가기 두 단추. 단추가 곧 링크다 — 이 종목을 실어 그 화면으로 가서 곧바로 실행한다
 * (받는 화면이 한 번만 읽는다 — hooks/useStockHandoff). DB·서버 AI만 쓰고 증권사를 부르지 않는다.
 * 비로그인은 두 화면 다 결과를 못 보므로 "로그인 필요"를 달고 로그인으로 보낸다
 */
export function ActionPanel({ title, stock, loginPath }: ActionPanelProps) {
  const titleId = useId()
  return (
    <section className={styles.actionPanel} aria-labelledby={titleId}>
      {/* 제목은 읽어 주는 기기에만 둔다 — 화면에서는 종목명과 단추 글이 이미 말한다 */}
      <h2 id={titleId} className={styles.visuallyHidden}>
        {title}
      </h2>
      <ul className={styles.actionList}>
        {ACTIONS.map((action) => (
          <li key={action.to}>
            <ActionRow action={action} stock={stock} loginPath={loginPath} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActionRow({
  action,
  stock,
  loginPath,
}: {
  action: (typeof ACTIONS)[number]
  stock: StockInfo | null
  loginPath: string | null
}) {
  const nameId = useId()
  const descId = useId()
  const content = (
    <>
      <span id={nameId} className={styles.actionName}>
        {action.name}
        {loginPath !== null && <span className={styles.actionBadge}>로그인 필요</span>}
      </span>
      {/* 설명 한 줄은 읽어 주는 기기에만 들린다(aria-describedby). 화면에서는 단추 글이 할 일을 말한다 */}
      <span id={descId} className={styles.visuallyHidden}>
        {action.desc}
      </span>
    </>
  )
  // 단추 모양은 한 종류만 단다 — primary·secondary를 같이 달면 뒤에 정의된 쪽이 바탕을 덮는다
  const className = action.primary ? styles.actionRowPrimary : styles.actionRow
  // 이름은 제목(과 배지), 설명은 따로 읽힌다 — 줄 전체 글이 이름이 되면 길어서 무엇인지 늦게 들린다
  const a11y = { 'aria-labelledby': nameId, 'aria-describedby': descId }

  if (loginPath !== null) {
    return (
      <Link to={loginPath} className={className} {...a11y}>
        {content}
      </Link>
    )
  }
  if (stock === null) {
    return (
      <div className={styles.actionRowDisabled} aria-disabled="true">
        {content}
      </div>
    )
  }
  return (
    <Link to={action.to} state={toStockHandoff(stock)} className={className} {...a11y}>
      {content}
    </Link>
  )
}
