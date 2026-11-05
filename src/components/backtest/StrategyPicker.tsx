import { useId } from 'react'
import { INVEST_TYPES, periodLabel } from '../../utils/backtest'
import styles from '../../pages/BacktestPage.module.css'

interface PickerProps {
  investType: number | null
  savedPersonality: string | null
  onSelect: (investType: number) => void
}

/**
 * 전략 다섯 카드 — 전략을 고르는 곳은 여기 하나다(넓은 화면은 왼쪽 열, 좁은 화면은 입력 ②칸). 설명을 읽다가 그 자리에서 고른다.
 * 다섯 개를 모두 펼치면 훑기 어려워 고른 것만 매수·매도 조건까지 펴고 나머지는 한 줄 요약으로 접어 둔다.
 */
export default function StrategyPicker({ investType, savedPersonality, onSelect }: PickerProps) {
  const idBase = useId()
  return (
    <ul className={styles.strategyList}>
      {INVEST_TYPES.map((item) => {
        const isActive = item.investType === investType
        const isRecommended =
          savedPersonality !== null &&
          item.personality === savedPersonality
        /*
         * 이름은 전략 이름 하나다. 단추 안 글 전체가 이름이 되면 "위험도 1단계 (5단계 중) RSI 역추세 전략 너무 많이 팔려…"처럼
         * 길어 무엇을 고르는지 늦게 들렸다. 위험도·맞음 표시·요약은 설명으로 읽힌다
         */
        const id = (part: string) => `${idBase}-${part}-${item.investType}`

        return (
          <li key={item.investType}>
            <button
              type="button"
              className={
                isActive ? styles.strategyOn : styles.strategyOff
              }
              aria-pressed={isActive}
              aria-labelledby={id('name')}
              aria-describedby={[id('risk'), isRecommended ? id('fit') : '', id('desc')].filter(Boolean).join(' ')}
              onClick={() => onSelect(item.investType)}
            >
              <span className={styles.strategyTop}>
                <RiskDots level={item.investType} id={id('risk')} />
                {isRecommended && (
                  <span id={id('fit')} className={styles.badge}>
                    나에게 맞음
                  </span>
                )}
              </span>

              <span id={id('name')} className={styles.strategyName}>
                {item.strategyName}
              </span>
              <span id={id('desc')} className={styles.strategyDesc}>
                {item.strategySummary}
              </span>

              {/* 고른 전략만 자세히 편다 */}
              {isActive && (
                <span className={styles.detail}>
                  <span className={styles.detailRow}>
                    <b className={styles.buy}>매수</b>
                    {item.entryRule}
                  </span>
                  <span className={styles.detailRow}>
                    <b className={styles.sell}>매도</b>
                    {item.exitRule}
                  </span>
                  <span className={styles.detailRow}>
                    <b className={styles.term}>기간</b>
                    {periodLabel(item.minPeriod)} 이상
                  </span>
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}


/** 위험도를 점 다섯 개로. 전략 번호가 곧 위험도 순서다(1 안정 → 5 공격) */
function RiskDots({ level, id }: { level: number; id: string }) {
  return (
    <span id={id} className={styles.dots} role="img" aria-label={`위험도 ${level}단계 (5단계 중)`}>
      {[1, 2, 3, 4, 5].map((step) => (
    <i
      key={step}
      className={step <= level ? styles.dotOn : styles.dotOff}
      aria-hidden="true"
    />
      ))}
    </span>
  )
}
