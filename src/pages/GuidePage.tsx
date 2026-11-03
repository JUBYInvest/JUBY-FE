import { useEffect, useState } from 'react'
import { getGuideSections } from '../api/guide'
import GuideSteps from '../components/GuideSteps'
import { HOME_GUIDE_INTRO } from '../content/homeGuide'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { GuideSection } from '../types/guide'
import styles from './GuidePage.module.css'

export default function GuidePage() {
  useDocumentTitle('사용설명서')
  const [sections, setSections] = useState<GuideSection[] | null>(null)

  useEffect(() => {
    /*
     * 지금은 mock이라 실패할 일이 없지만, DB를 붙이면 실패할 수 있다.
     * 그때도 설명서 때문에 화면이 비지 않도록 빈 목록으로 받는다.
     */
    getGuideSections()
      .catch(() => [])
      .then(setSections)
  }, [])

  /*
   * 왼쪽은 설명서 본문(src/api/guide.ts — 사용자가 채우는 글), 오른쪽은 홈과 같은 "처음이라면 이 순서로" 단계다
   * (src/content/homeGuide.ts 한 곳에서 가져온다). 좁은 화면은 단계를 먼저 보인다 — 본문이 아직 "준비중"이라
   * 그 화면에서 할 수 있는 일이 단계뿐이다(2026-10-30 재정비)
   */
  return (
    <>
      <h1 className={styles.title}>JUBY 사용설명서</h1>

      <div className={styles.layout}>
        <section className={styles.main} aria-label="설명서 본문">
          {sections === null ? (
            <div className={styles.skeleton} aria-label="불러오는 중" />
          ) : (
            <ol className={styles.list}>
              {sections.map((section, index) => (
                <li key={section.guideId} className={styles.item}>
                  <div className={styles.head}>
                    {/* 번호를 글로 적어야 목차 순서가 화면 폭과 무관하게 유지된다 */}
                    <span className={styles.number}>{index + 1}</span>
                    <h2 className={styles.itemTitle}>{section.title}</h2>
                  </div>

                  {section.body.map((paragraph) => (
                    <p key={paragraph} className={styles.body}>
                      {paragraph}
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className={styles.steps} aria-labelledby="guide-steps-title">
          <h2 id="guide-steps-title" className={styles.stepsTitle}>
            {HOME_GUIDE_INTRO}
          </h2>
          <GuideSteps className={styles.stepList} />
        </aside>
      </div>
    </>
  )
}
