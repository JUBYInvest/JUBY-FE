import { useId } from 'react'
import { Link } from 'react-router-dom'
import { INVEST_TYPES, findInvestType } from '../../utils/backtest'
import { strategyExcerpt } from '../../utils/guideExcerpt'
import styles from '../../pages/BacktestPage.module.css'

interface PickerProps {
  investType: number | null
  savedPersonality: string | null
  onSelect: (investType: number) => void
}

/**
 * 전략 다섯 카드 — 전략을 고르는 곳은 여기 하나다(②전략 줄). 위험도 순(1 안정 → 5 공격)으로 한 줄에 서고,
 * 좁으면 한 줄에 하나씩 쌓인다. 카드에는 위험도·이름·나에게 맞음만 두고(성향 이름은 적지 않는다 — 2026-11-07 사용자),
 * 고른 전략의 설명은 아래 `StrategyDetail` 한 곳에만 적는다
 */
export default function StrategyPicker({ investType, savedPersonality, onSelect }: PickerProps) {
  const idBase = useId()
  return (
    <ul className={styles.strategyList}>
      {INVEST_TYPES.map((item) => {
        const isActive = item.investType === investType
        const isRecommended = savedPersonality !== null && item.personality === savedPersonality
        /*
         * 이름은 전략 이름 하나다. 단추 안 글 전체가 이름이 되면 "위험도 1단계 (5단계 중) RSI 역추세 전략…"처럼
         * 길어 무엇을 고르는지 늦게 들린다. 위험도·맞음 표시는 설명으로 읽힌다
         */
        const id = (part: string) => `${idBase}-${part}-${item.investType}`

        return (
          <li key={item.investType}>
            <button
              type="button"
              className={isActive ? styles.strategyOn : styles.strategyOff}
              aria-pressed={isActive}
              data-invest-type={item.investType}
              aria-labelledby={id('name')}
              aria-describedby={isRecommended ? `${id('risk')} ${id('mine')}` : id('risk')}
              onClick={() => onSelect(item.investType)}
            >
              <span className={styles.strategyTop}>
                <RiskDots level={item.investType} id={id('risk')} />
              </span>
              <span id={id('name')} className={styles.strategyName}>
                {item.strategyName}
              </span>
              {isRecommended && (
                <span id={id('mine')} className={styles.badge}>
                  나에게 맞음
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 고른 전략의 한 줄 설명과 사고파는 조건. 사용설명서 3장 그 전략 꼭지로 잇는다 */
export function StrategyDetail({ investType }: { investType: number | null }) {
  const chosen = investType === null ? null : findInvestType(investType)
  if (chosen === null) {
    return <p className={styles.strategyEmpty}>전략을 고르면 언제 사고파는지 여기에 나와요</p>
  }
  const { anchor } = strategyExcerpt(chosen.strategyName)
  return (
    <div className={styles.strategyDetail}>
      <p className={styles.strategySummary}>{chosen.strategySummary}</p>
      <dl className={styles.rules}>
        <dt>매수</dt>
        <dd>{chosen.entryRule}</dd>
        <dt>매도</dt>
        <dd>{chosen.exitRule}</dd>
      </dl>
      <Link to={anchor === null ? '/guide/backtest' : `/guide/backtest#${anchor}`} className={styles.textLink}>
        이 전략 자세히 보기
      </Link>
    </div>
  )
}

/** 위험도를 점 다섯 개로. 전략 번호가 곧 위험도 순서다(1 안정 → 5 공격) */
function RiskDots({ level, id }: { level: number; id: string }) {
  return (
    <span id={id} className={styles.dots} role="img" aria-label={`위험도 ${level}단계 (5단계 중)`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <i key={step} className={step <= level ? styles.dotOn : styles.dotOff} aria-hidden="true" />
      ))}
    </span>
  )
}
