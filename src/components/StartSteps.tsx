import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { isPlainClick } from '../utils/navigation'
import styles from './StartSteps.module.css'

export interface StartStep {
  title: string
  done: boolean
  /** 한 줄 아래 글 — 마친 단계는 그 값(위험중립형·2개), 남은 단계는 무엇을 하는지. 아직 모르면 null */
  note: string | null
  /** 남은 단계의 바로 가기. '#…'이면 같은 화면 안 그 자리로 옮긴다. 아직 모르거나 마쳤으면 null */
  action: { label: string; to: string; state?: unknown } | null
}

/** 같은 화면 안 자리로 — 주소는 바꾸지 않는다(해시가 붙으면 라우터가 새 기록으로 본다) */
function jumpWithin(id: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return
    const target = document.getElementById(id)
    if (target === null) return
    event.preventDefault()
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }
}

/**
 * 홈 오른쪽 위 "처음 시작하기" 줄(2026-11-03, HomeRail). 사용설명서 칸과 같은 줄 모양(GuideSteps.module.css — 번호 동그라미 · 제목/한 줄 · 오른쪽)이라
 * 칸이 바뀌어도 줄 높이와 왼쪽 대표 종목 줄에 맞춘 선이 그대로다. 마친 단계는 초록 동그라미에 ✓, 남은 단계는 번호와 바로 가기.
 * 순서가 정말 있는 일(로그인 → 성향 → 관심종목 → 백테스트)이라 번호를 단다
 */
export default function StartSteps({ steps, className }: { steps: StartStep[]; className: string }) {
  return (
    <ol className={`${styles.list} ${className}`}>
      {steps.map((step, index) => (
        <li key={step.title}>
          <div className={styles.step}>
            <span className={step.done ? styles.markDone : styles.mark} aria-hidden="true">
              {step.done ? '✓' : index + 1}
            </span>
            <span className={step.done ? styles.textDone : styles.text}>
              <strong>
                {step.title}
                <span className={styles.srOnly}>{step.done ? ' — 마침' : ' — 아직'}</span>
              </strong>
              {step.note !== null && <small>{step.note}</small>}
            </span>
            {step.action !== null &&
              (step.action.to.startsWith('#') ? (
                <a href={step.action.to} className={styles.action} onClick={jumpWithin(step.action.to.slice(1))}>
                  {step.action.label}
                </a>
              ) : (
                <Link to={step.action.to} state={step.action.state} className={styles.action}>
                  {step.action.label}
                </Link>
              ))}
          </div>
        </li>
      ))}
    </ol>
  )
}
