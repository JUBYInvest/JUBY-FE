import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HOME_GUIDE_INTRO } from '../content/homeGuide'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import CommunityPosts from './CommunityPosts'
import GuideSteps from './GuideSteps'
import styles from './HomeRail.module.css'

/**
 * 홈 오른쪽 열(2026-10-30 재정비). 위는 사용설명서(네 장을 한 줄씩 — 2026-11-03), 아래는 커뮤니티 최신 글(2026-11-03부터 게시판 모양)이다.
 * 16:9에서 홈 오른쪽이 비어 보인다는 말에 사용자가 정한 자리다. 사용설명서 글은 src/content/homeGuide.ts,
 * 커뮤니티 글은 서버가 생기기 전까지 src/content/communityPreview.ts의 예시 글이다(src/api/community.ts가 가른다).
 */
export default function HomeRail() {
  return (
    <aside className={styles.rail} aria-label="사용설명서와 커뮤니티">
      <GuideSection />
      <CommunityPreview />
    </aside>
  )
}

function GuideSection() {
  return (
    <section className={styles.guide} aria-labelledby="home-guide-title">
      <div className={styles.head}>
        <h2 id="home-guide-title" className={styles.title}>
          사용설명서
        </h2>
        <Link to="/guide" className={styles.more}>
          전체 보기
        </Link>
      </div>
      {/* 넓은 화면에서 제목 줄은 홈 검색 줄, 이 묶음은 대표 종목 줄에 놓인다(HomeRail.module.css) */}
      <div className={styles.guideBody}>
        <p className={styles.intro}>{HOME_GUIDE_INTRO}</p>
        <GuideSteps className={styles.steps} here="/" chevron />
      </div>
    </section>
  )
}

/**
 * 커뮤니티 미리보기(2026-11-03 사용자 "토스증권처럼 게시판으로" — 2026-11-02의 채팅창을 글 목록으로 되돌렸다).
 * 최신 글 다섯 줄을 두 줄씩 보이고 제목 줄 오른쪽 '전체 보기'가 커뮤니티 화면이다. 글·연결은 커뮤니티 화면과 같은 훅(useCommunityFeed)이다.
 * 보고 있는 동안 웹소켓(지금은 목업)으로 새 글이 오면 바로 끼우지 않고 제목 옆 "새 글 N"으로 알린다 — 누르면 위에 선다.
 * 오른쪽 열은 홈 격자의 줄을 나눠 쓰므로(subgrid) 줄 수를 다섯으로 묶어 높이가 글 수만큼 늘지 않게 한다
 */
const HOME_POST_COUNT = 5

function CommunityPreview() {
  const { posts, pending, status, revealPending } = useCommunityFeed()
  // "N분 전"을 그릴 때 한 번 정한 시각으로 센다 — 다시 그릴 때마다 흔들리지 않게
  const [now] = useState(() => Date.now())
  const latest = [...(posts ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, HOME_POST_COUNT)

  return (
    <section className={styles.community} aria-labelledby="home-community-title">
      <div className={styles.head}>
        <h2 id="home-community-title" className={styles.title}>
          커뮤니티
        </h2>
        {status === 'mock' && <span className={styles.sampleTag}>예시</span>}
        {pending.length > 0 && (
          <button type="button" className={styles.fresh} onClick={revealPending}>
            새 글 {pending.length}
          </button>
        )}
        <Link to="/community" className={styles.more}>
          전체 보기
        </Link>
      </div>
      {posts === null ? (
        <div className={styles.loading} aria-hidden="true" />
      ) : (
        <CommunityPosts posts={latest} now={pending.length > 0 ? Date.now() : now} compact />
      )}
      {status === 'mock' && <p className={styles.notice}>지금 보이는 글은 예시예요. 커뮤니티 서버가 열리면 실제 글로 바뀌어요.</p>}
    </section>
  )
}
