import { useState } from 'react'
import { Link } from 'react-router-dom'
import { COMMUNITY_PREVIEW_MESSAGES } from '../content/communityPreview'
import { HOME_GUIDE_INTRO, HOME_GUIDE_STEPS } from '../content/homeGuide'
import { toKoreanClock } from '../utils/date'
import styles from './HomeRail.module.css'

/**
 * 홈 오른쪽 열(2026-10-30 재정비). 위는 처음 쓰는 순서(사용설명서), 아래는 커뮤니티 예시 대화(2026-11-02부터 채팅 모양)다.
 * 16:9에서 홈 오른쪽이 비어 보인다는 말에 사용자가 정한 자리다. 둘 다 서버를 부르지 않는다 —
 * 글은 src/content의 두 파일에만 있다(사용자가 고치기 쉽게).
 */
export default function HomeRail() {
  return (
    <aside className={styles.rail} aria-label="처음 쓰는 순서와 커뮤니티">
      <GuideSteps />
      <CommunityChat />
    </aside>
  )
}

function GuideSteps() {
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
        <ol className={styles.steps}>
          {HOME_GUIDE_STEPS.map((step, index) => {
            const body = (
              <>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.stepText}>
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>
              </>
            )
            return (
              <li key={step.title}>
                {/* 홈 안에서 홈으로 가는 링크는 같은 화면이라 글로만 둔다 */}
                {step.to === undefined || step.to === '/' ? (
                  <div className={styles.step}>{body}</div>
                ) : (
                  <Link to={step.to} className={`${styles.step} ${styles.stepLink}`}>
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
      </div>
    </section>
  )
}

/**
 * 커뮤니티 예시 대화(src/content/communityPreview.ts). 2026-11-02 사용자 요청("글 형식이 아니라 채팅 형식")으로 글 목록에서 채팅으로 바꿨다.
 * 커뮤니티 백엔드가 없어 입력칸·보내기는 잠그고 "준비 중"이라고 밝힌다 — 써도 아무 데도 가지 않는 칸을 열어 두지 않는다.
 * 오래된 말이 위, 최신이 아래다. 대화창 안에서만 스크롤하고 처음에는 맨 아래(최신)가 보인다 — 창을 column-reverse로 세워
 * 스크롤 기준이 아래 끝이라 글꼴이 늦게 와 높이가 바뀌어도 아래에 붙어 있다(스크립트로 내리지 않는다). 말 순서(DOM)는 오래된 순 그대로다.
 * 같은 사람이 이어 말하면 이름·시각을 한 번만 보이고, 읽어 주는 쪽에는 이름을 남긴다.
 */
function CommunityChat() {
  // 처음 그릴 때의 시각으로 "N분 전"을 시계 시각으로 바꾼다. 다시 그려도 시각이 흔들리지 않게 한 번만 잰다
  const [now] = useState(() => Date.now())

  return (
    <section className={styles.community} aria-labelledby="home-community-title">
      <div className={styles.head}>
        <h2 id="home-community-title" className={styles.title}>
          커뮤니티
        </h2>
        <span className={styles.sampleTag}>예시</span>
      </div>
      <div className={styles.chat}>
        {/* 스크롤되는 칸이라 키보드로도 들어와 위아래로 움직일 수 있게 tabIndex를 준다 */}
        <div className={styles.log} role="log" aria-label="커뮤니티 예시 대화" tabIndex={0}>
          <ol className={styles.messages}>
            {COMMUNITY_PREVIEW_MESSAGES.map((message, index) => {
              const at = now - message.minutesAgo * 60_000
              const continued = index > 0 && COMMUNITY_PREVIEW_MESSAGES[index - 1].author === message.author
              return (
                <li key={message.id} className={`${styles.message} ${continued ? styles.continued : ''}`}>
                  <span className={styles.avatar} aria-hidden="true">
                    {continued ? '' : message.author.slice(0, 1)}
                  </span>
                  <div className={styles.messageBody}>
                    {continued ? (
                      <span className={styles.srOnly}>{message.author}</span>
                    ) : (
                      <p className={styles.messageMeta}>
                        <strong data-author>{message.author}</strong>
                        <time dateTime={new Date(at).toISOString()}>{toKoreanClock(at)}</time>
                      </p>
                    )}
                    <p className={styles.bubble} data-bubble>
                      {message.stock !== null && <span className={styles.stockTag}>{message.stock}</span>}
                      {message.text}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
        <div className={styles.composer}>
          <label className={styles.srOnly} htmlFor="home-community-input">
            커뮤니티에 보낼 말
          </label>
          <input id="home-community-input" className={styles.input} type="text" placeholder="채팅은 준비 중이에요" disabled />
          <button type="button" className={styles.send} disabled>
            보내기
          </button>
        </div>
      </div>
      <p className={styles.notice}>지금 보이는 대화는 예시예요. 커뮤니티 채팅은 준비 중이에요.</p>
    </section>
  )
}
