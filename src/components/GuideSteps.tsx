import { Link } from 'react-router-dom'
import { HOME_GUIDE_STEPS } from '../content/homeGuide'
import styles from './GuideSteps.module.css'

interface Props {
  /** 목록(`ol`) 자리 — 바깥 여백·격자는 놓이는 화면이 정한다 */
  className: string
  /** 지금 화면의 경로. 이 경로로 가는 단계는 같은 화면이라 링크 없이 글로만 둔다(홈의 '종목 찾기') */
  here?: string
  /** 링크 끝에 › 를 단다(홈 오른쪽 열) */
  chevron?: boolean
}

/**
 * "처음이라면 이 순서로" 단계(src/content/homeGuide.ts). 홈 오른쪽 열(HomeRail)과 사용설명서 화면이 같이 쓴다 —
 * 두 곳에 같은 마크업과 같은 CSS 여섯 규칙이 따로 적혀 있었다(2026-11-03). 정말 차례가 있는 글이라 번호를 단다
 */
export default function GuideSteps({ className, here, chevron = false }: Props) {
  const stepClass = chevron ? `${styles.step} ${styles.withChevron}` : styles.step
  return (
    <ol className={`${styles.list} ${className}`}>
      {HOME_GUIDE_STEPS.map((step, index) => {
        const body = (
          <>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.text}>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
            </span>
          </>
        )
        return (
          <li key={step.title}>
            {step.to === undefined || step.to === here ? (
              <div className={stepClass}>{body}</div>
            ) : (
              <Link to={step.to} className={`${stepClass} ${styles.link}`}>
                {body}
                {chevron && (
                  <span className={styles.chevron} aria-hidden="true">
                    ›
                  </span>
                )}
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}
