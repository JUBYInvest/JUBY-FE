import type { BacktestStep } from './BacktestHelp'
import styles from '../../pages/BacktestPage.module.css'

export interface StepItem {
  key: BacktestStep
  label: string
  /** 고른 값. 아직이면 null */
  value: string | null
}

interface Props {
  steps: StepItem[]
  active: BacktestStep
  onPick: (step: BacktestStep) => void
}

/**
 * 왼쪽 날개 — 진행 단계(2026-11-03). 종목 → 전략 → 기간 → 결과를 한 줄씩(사용설명서 장 목록·커뮤니티 종목 목록과 같은 44px 줄),
 * 고른 값을 오른쪽에 적는다. 누르면 그 칸으로 옮기고 오른쪽 도움말이 그 단계 글로 바뀐다
 */
export default function BacktestSteps({ steps, active, onPick }: Props) {
  return (
    <nav className={styles.rail} aria-label="백테스트 단계">
      <ol className={styles.railList}>
        {steps.map((step, index) => (
          <li key={step.key}>
            {/*
              칸으로 옮기는 길잡이라 단추가 아니라 링크다(사용설명서 "이 장에서"와 같다 — 단추 세 종류 규칙 밖의 줄 모양).
              주소는 바꾸지 않는다(해시가 붙으면 라우터가 새 기록으로 본다). 새 탭으로 열기는 브라우저에 맡긴다
            */}
            <a
              href={`#backtest-${step.key}`}
              className={step.key === active ? styles.railStepOn : styles.railStep}
              aria-current={step.key === active ? 'step' : undefined}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                onPick(step.key)
              }}
            >
              <span className={styles.railNo}>{index + 1}</span>{' '}
              <span className={styles.railLabel}>{step.label}</span>{' '}
              <span className={step.value === null ? styles.railEmpty : styles.railValue}>{step.value ?? '아직'}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
