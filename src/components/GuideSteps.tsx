import { Link } from 'react-router-dom'
import { HOME_GUIDE_STEPS } from '../content/homeGuide'
import styles from './GuideSteps.module.css'

interface Props {
  /** 목록(`ol`) 자리 — 바깥 여백·격자는 놓이는 화면이 정한다 */
  className: string
}

/**
 * 홈 오른쪽 위 사용설명서 단계(src/content/homeGuide.ts — 네 장을 한 줄씩 줄인 것). 홈 오른쪽 열(HomeRail)이 쓴다.
 * 정말 차례가 있는 글(장 번호)이라 번호를 단다. 링크 끝에 › 를 단다
 */
export default function GuideSteps({ className }: Props) {
  const stepClass = `${styles.step} ${styles.withChevron}`
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
            {step.to === undefined ? (
              <div className={stepClass}>{body}</div>
            ) : (
              <Link to={step.to} className={`${stepClass} ${styles.link}`}>
                {body}
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}
