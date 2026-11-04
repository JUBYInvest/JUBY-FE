import type { CommunityStatus } from '../api/community'
import { COMMUNITY_RULES } from '../content/communityRules'
import Spinner from './Spinner'
import styles from './CommunitySide.module.css'

interface Props {
  status: CommunityStatus
  /** 두 열 틀 안 자리(communityLayout.module.css side) */
  className: string
}

/** 커뮤니티 오른쪽 열 — 실시간 연결 · 이용 안내(src/content/communityRules.ts). 커뮤니티 목록과 글 상세가 같이 쓴다 */
export default function CommunitySide({ status, className }: Props) {
  return (
    <aside className={className} aria-label="커뮤니티 안내">
      <h2 id="community-side-title" className={styles.sideTitle}>
        이용 안내
      </h2>
      <section aria-labelledby="community-status-title" className={styles.sideSection}>
        <h3 id="community-status-title" className={styles.sideHeading}>
          실시간 연결
        </h3>
        <StatusLine status={status} />
      </section>
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

function StatusLine({ status }: { status: CommunityStatus }) {
  if (status === 'open') return <p className={styles.statusOn}>새 글을 실시간으로 받고 있어요.</p>
  if (status === 'mock') {
    return (
      <p className={styles.status}>
        지금 보이는 글은 예시예요. 커뮤니티 서버가 열리기 전까지, 새 글이 들어오는 모습을 보이려고 예시 글이 몇 분마다 들어와요.
      </p>
    )
  }
  return (
    <p className={styles.status}>
      <Spinner size={14} /> {status === 'connecting' ? '연결하는 중…' : '연결이 끊겨 다시 잇는 중…'}
    </p>
  )
}
