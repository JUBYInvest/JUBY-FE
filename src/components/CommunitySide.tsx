import { COMMUNITY_RULES } from '../content/communityRules'
import styles from './CommunitySide.module.css'

interface Props {
  /** 두 열 틀 안 자리(communityLayout.module.css side) */
  className: string
}

/** 커뮤니티 오른쪽 열 — 이용 안내. 목록과 글 상세가 같이 쓴다 */
export default function CommunitySide({ className }: Props) {
  return (
    <aside className={className} aria-label="커뮤니티 안내">
      <h2 id="community-side-title" className={styles.sideTitle}>
        이용 안내
      </h2>
      <section aria-labelledby="community-rules-title" className={styles.sideSection}>
        <h3 id="community-rules-title" className={styles.sideHeading}>
          함께 지켜요
        </h3>
        <ul className={styles.rules}>
          {COMMUNITY_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </aside>
  )
}

