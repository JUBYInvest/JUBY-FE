import { INVEST_TYPES } from '../utils/backtest'
import type { PersonalityType } from '../types/personality'
import styles from './PersonalityScale.module.css'

interface Props {
  /** 내 성향. 모르거나 검사 전이면 null — 눈금만 그린다 */
  mine: PersonalityType | null
  /** 둘러보는 중인 성향(투자유형 화면). 주면 눈금이 단추가 되어 고를 수 있다 */
  selected?: PersonalityType
  onSelect?: (next: PersonalityType) => void
}

/**
 * 다섯 성향 눈금. 안정형에서 공격투자형까지 감수하는 위험이 커지는 순서라 실제로 차례가 있는 값이다 —
 * 그래서 번호 대신 한 줄 자로 그리고, 내 자리를 호박 막대와 "내 성향"으로 표시한다.
 * 마이페이지 한눈에 보기(보기만)와 투자유형 화면(다른 성향 둘러보기)이 함께 쓴다.
 */
export default function PersonalityScale({ mine, selected, onSelect }: Props) {
  return (
    <div className={styles.scale}>
      <ol className={styles.steps}>
        {INVEST_TYPES.map(({ personality }) => {
          const isMine = personality === mine
          const isSelected = personality === selected
          const label = (
            <>
              <span className={isMine ? styles.barMine : isSelected ? styles.barSelected : styles.bar} aria-hidden="true" />
              <span className={styles.name}>{personality}</span>
              {isMine && <span className={styles.mineTag}>내 성향</span>}
            </>
          )
          return (
            <li key={personality} className={styles.step} aria-current={isMine ? 'true' : undefined}>
              {onSelect === undefined ? (
                <span className={isMine ? styles.cellMine : styles.cell}>{label}</span>
              ) : (
                <button
                  type="button"
                  className={isSelected ? styles.cellButtonSelected : styles.cellButton}
                  aria-pressed={isSelected}
                  onClick={() => onSelect(personality)}
                >
                  {label}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <p className={styles.ends} aria-hidden="true">
        <span>위험을 덜 감수</span>
        <span>더 감수</span>
      </p>
    </div>
  )
}
