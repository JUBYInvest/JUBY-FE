import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { HOME_GUIDE_INTRO } from '../content/homeGuide'
import { useCommunityFeed } from '../hooks/useCommunityFeed'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useMyPersonality } from '../hooks/useMyPersonality'
import { toBacktestHandoff } from '../hooks/useStockHandoff'
import { findByPersonality } from '../utils/backtest'
import { readLastLoginProvider } from '../utils/lastLogin'
import { loginPathFrom } from '../utils/navigation'
import { isPersonalityType } from '../utils/personality'
import { readRecentBacktests } from '../utils/recentBacktests'
import { SOCIAL_PROVIDERS } from '../utils/social'
import { isStartFinished, rememberStartFinished } from '../utils/startSteps'
import CommunityPosts from './CommunityPosts'
import GuideSteps from './GuideSteps'
import StartSteps, { type StartStep } from './StartSteps'
import styles from './HomeRail.module.css'

/**
 * 홈 오른쪽 열(2026-10-30 재정비). 위는 사용설명서(네 장을 한 줄씩 — 2026-11-03), 아래는 커뮤니티 최신 글(2026-11-03부터 게시판 모양)이다.
 * 16:9에서 홈 오른쪽이 비어 보인다는 말에 사용자가 정한 자리다. 사용설명서 글은 src/content/homeGuide.ts,
 * 커뮤니티 글은 서버가 생기기 전까지 src/content/communityPreview.ts의 예시 글이다(src/api/community.ts가 가른다).
 */
export default function HomeRail({ likedCount }: { likedCount: number | null }) {
  return (
    <aside className={styles.rail} aria-label="시작하기·사용설명서와 커뮤니티">
      <StartOrGuide likedCount={likedCount} />
      <CommunityPreview />
    </aside>
  )
}

/**
 * 처음 시작하기 진행표(2026-11-03 사용자가 시안 비교 1번을 고름 — "다음에 뭘 하면 되는지"). 로그인 → 투자성향 테스트 → 관심종목 하나 →
 * 내 전략으로 첫 백테스트 넷을 다 마치면 사용설명서 칸으로 돌아간다(그 계정은 다음부터 곧바로 — utils/startSteps).
 * 새 API를 만들지 않았다: 성향은 있는 조회 한 건(로그인했을 때만), 관심종목은 홈 시세표가 받은 하트, 백테스트는 최근 본 백테스트 기록이다
 */
function StartOrGuide({ likedCount }: { likedCount: number | null }) {
  const loggedIn = useIsLoggedIn()
  const finishedBefore = loggedIn && isStartFinished()
  const { personality, retry: retryPersonality } = useMyPersonality(loggedIn && !finishedBefore)
  const recent = loggedIn ? readRecentBacktests() : []
  const provider = loggedIn ? SOCIAL_PROVIDERS.find((item) => item.type === readLastLoginProvider()) : undefined
  const myStrategy = personality.kind === 'found' && isPersonalityType(personality.name) ? findByPersonality(personality.name) : null

  const steps: StartStep[] = [
    {
      title: '로그인',
      done: loggedIn,
      note: loggedIn ? (provider === undefined ? '로그인했어요' : `${provider.name} 계정`) : '카카오·네이버·Google 계정으로',
      action: loggedIn ? null : { label: '로그인하기', to: loginPathFrom('/') },
    },
    {
      title: '투자성향 테스트',
      done: personality.kind === 'found',
      // 못 받았으면(500) 검사를 권하지 않는다 — 다시 검사하면 멀쩡한 성향을 덮어쓴다(CLAUDE.md "성향 없음은 실패가 아니다", 코드 점검 D2)
      note:
        personality.kind === 'found'
          ? personality.name
          : personality.kind === 'loading'
            ? null
            : personality.kind === 'error'
              ? '성향을 불러오지 못했어요'
              : '10문항으로 내 성향 찾기',
      action:
        personality.kind === 'found' || personality.kind === 'loading'
          ? null
          : personality.kind === 'error'
            ? { label: '다시 시도', onClick: retryPersonality }
            : { label: '테스트하기', to: '/personality-test' },
    },
    {
      title: '관심종목 하나 담기',
      done: likedCount !== null && likedCount > 0,
      note: likedCount === null ? null : likedCount > 0 ? `${likedCount}개 담았어요` : '시세표의 하트를 눌러 담아요',
      action: likedCount === 0 ? { label: '담으러 가기', to: '#home-stocks-title' } : null,
    },
    {
      title: '내 전략으로 첫 백테스트',
      done: recent.length > 0,
      note: recent.length > 0 ? `${recent[0].stockName} · 적합도 ${recent[0].finalScore.toFixed(1)}` : '내 성향 전략으로 과거 주가를 돌려 봐요',
      action:
        recent.length > 0
          ? null
          : {
              label: '해 보기',
              to: '/backtest',
              state: myStrategy === null ? undefined : toBacktestHandoff(null, { investType: myStrategy.investType, period: null }),
            },
    },
  ]
  const done = steps.filter((step) => step.done).length
  const allDone = done === steps.length

  useEffect(() => {
    if (allDone) rememberStartFinished()
  }, [allDone])

  if (finishedBefore || allDone) return <GuideSection />
  return (
    <section className={styles.guide} aria-labelledby="home-guide-title">
      <div className={styles.head}>
        <h2 id="home-guide-title" className={styles.title}>
          처음 시작하기
        </h2>
        <span className={styles.count}>
          {done} / {steps.length}
        </span>
        <Link to="/guide" className={styles.more}>
          사용설명서
        </Link>
      </div>
      <div className={styles.guideBody}>
        <div
          className={styles.meter}
          role="progressbar"
          aria-label="처음 시작하기"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
        >
          {steps.map((step) => (
            <span key={step.title} className={step.done ? styles.meterOn : styles.meterOff} />
          ))}
        </div>
        <StartSteps steps={steps} className={styles.steps} />
      </div>
    </section>
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
 * 최신 글 다섯 줄(제목 한 줄 + 종목·본문 한 줄)을 보이고 제목 줄 오른쪽 '전체 보기'가 커뮤니티 화면이다. 글 줄을 누르면 그 글 상세(`/community/{postId}`, 2026-11-04)로 간다. 글·연결은 커뮤니티 화면과 같은 훅(useCommunityFeed)이다.
 * 보고 있는 동안 웹소켓(지금은 목업)으로 새 글이 오면 바로 끼우지 않고 제목 옆 "새 글 N"으로 알린다 — 누르면 위에 선다.
 * 오른쪽 열은 홈 격자의 줄을 나눠 쓰므로(subgrid) 줄 수를 다섯으로 묶어 높이가 글 수만큼 늘지 않게 한다
 */
const HOME_POST_COUNT = 5

function CommunityPreview() {
  const { posts, pending, status, revealPending } = useCommunityFeed()
  // "N분 전"은 목록이 바뀌어 다시 그릴 때마다 지금 시각으로 센다(커뮤니티 화면과 같다) — 새 글을 세운 뒤 앞 글이 옛 시각에 멈춰 있지 않게
  const now = Date.now()
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
        <CommunityPosts posts={latest} now={now} compact />
      )}
      {status === 'mock' && <p className={styles.notice}>지금 보이는 글은 예시예요. 커뮤니티 서버가 열리면 실제 글로 바뀌어요.</p>}
    </section>
  )
}
