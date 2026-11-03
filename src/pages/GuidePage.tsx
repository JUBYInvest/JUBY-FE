import type { MouseEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import GuideArticle from '../components/GuideArticle'
import { GUIDE_CHAPTERS } from '../content/guide'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { readGuideDocument, type GuideDocument } from '../utils/guideMarkdown'
import { prefersReducedMotion } from '../utils/motion'
import styles from './GuidePage.module.css'

interface Chapter {
  id: string
  name: string
  number: number
  /** 글이 있는 장만. 없으면 차례에 "준비 중"으로만 선다 */
  document: GuideDocument | null
}

const CHAPTERS: Chapter[] = GUIDE_CHAPTERS.map((source, index) => ({
  id: source.id,
  name: source.name,
  number: index + 1,
  document: source.markdown === null ? null : readGuideDocument(source.id, source.markdown),
}))

/** 글이 있는 첫 장이 `/guide`다. 1장이 채워지면 그 장이 `/guide`가 되고, 그 전의 주소(`/guide/backtest`)는 그대로 열린다 */
const FIRST_READY = CHAPTERS.find((chapter) => chapter.document !== null)
const pathOf = (chapter: Chapter) => (chapter === FIRST_READY ? '/guide' : `/guide/${chapter.id}`)

/** 차례의 꼭지로 옮긴다. 주소는 바꾸지 않는다(새 기록이 생기면 뒤로 가기가 꼭지마다 걸린다). 새 탭으로 열기는 브라우저에 맡긴다 */
function jumpTo(id: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = document.getElementById(id)
    if (target === null) return
    event.preventDefault()
    target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    target.focus({ preventScroll: true })
  }
}

/** 글이 있는 장 사이에서 앞뒤 장으로 */
function Pager({ chapter }: { chapter: Chapter }) {
  const ready = CHAPTERS.filter((item) => item.document !== null)
  const index = ready.indexOf(chapter)
  const previous = ready[index - 1]
  const next = ready[index + 1]
  if (previous === undefined && next === undefined) return null
  return (
    <nav className={styles.pager} aria-label="장 넘기기">
      {previous !== undefined && (
        <Link to={pathOf(previous)} rel="prev" className={styles.pagerLink}>
          <small>이전 장</small>{' '}
          <span>
            {previous.number}. {previous.name}
          </span>
        </Link>
      )}
      {next !== undefined && (
        <Link to={pathOf(next)} rel="next" className={`${styles.pagerLink} ${styles.pagerNext}`}>
          <small>다음 장</small>{' '}
          <span>
            {next.number}. {next.name}
          </span>
        </Link>
      )}
    </nav>
  )
}

/**
 * 사용설명서(2026-11-03 — 사용자가 노션에 쓴 글을 장마다 옮긴다, src/content/guide). 왼쪽은 장 본문, 오른쪽은 차례(네 장 + 지금 장의 꼭지).
 * 차례는 읽는 동안 화면 위에 붙어 따라온다. 좁은 화면은 차례(장 이름만)를 본문 앞에 둔다.
 * 예전 오른쪽 "처음이라면 이 순서로" 단계는 본문이 "준비중" 한 줄이던 때 그 자리를 채운 것이라 걷었다 — 같은 단계가 홈 오른쪽 열에 있고,
 * 차례의 장(투자성향 → 주식 백테스트 → AI 투자챗봇)이 같은 순서다.
 */
export default function GuidePage() {
  const { chapterId } = useParams()
  const chapter = chapterId === undefined ? FIRST_READY : CHAPTERS.find((item) => item.id === chapterId && item.document !== null)
  useDocumentTitle(chapter === undefined ? '사용설명서' : `${chapter.name} 사용설명서`)

  // 없는 장·아직 글이 없는 장의 주소는 첫 장으로 보낸다
  if (chapterId !== undefined && chapter === undefined) return <Navigate to="/guide" replace />

  const content = chapter?.document ?? null
  return (
    <>
      <h1 className={styles.title}>JUBY 사용설명서</h1>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-labelledby="guide-toc-title">
          <h2 id="guide-toc-title" className={styles.tocTitle}>
            차례
          </h2>
          <ol className={styles.chapters}>
            {CHAPTERS.map((item) => {
              const label = (
                <>
                  {/* 여백으로 띄운 자리에도 빈칸을 둔다 — 없으면 읽어 주는 쪽·복사한 글이 "1JUBY 소개준비 중"으로 붙는다 */}
                  <span className={styles.number}>{item.number}</span>{' '}
                  <span>{item.name}</span>
                </>
              )
              const current = item === chapter
              return (
                <li key={item.id}>
                  {item.document === null ? (
                    <span className={styles.chapterSoon}>
                      {label}{' '}
                      <span className={styles.soon}>준비 중</span>
                    </span>
                  ) : (
                    <Link to={pathOf(item)} className={current ? styles.chapterOn : styles.chapter} aria-current={current ? 'page' : undefined}>
                      {label}
                    </Link>
                  )}
                  {current && content !== null && content.sections.length > 0 && (
                    <ol className={styles.sections}>
                      {content.sections.map((section) => (
                        <li key={section.id}>
                          <a href={`#${section.id}`} className={styles.sectionLink} onClick={jumpTo(section.id)}>
                            {section.title}
                          </a>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>

        <article className={styles.article} aria-labelledby="guide-chapter-title">
          <h2 id="guide-chapter-title" className={styles.chapterTitle}>
            {content?.title ?? chapter?.name ?? '사용설명서'}
          </h2>
          {content === null ? (
            <p className={styles.empty}>준비 중입니다.</p>
          ) : (
            <GuideArticle body={content.body} sections={content.sections} />
          )}
          {chapter !== undefined && <Pager chapter={chapter} />}
        </article>
      </div>
    </>
  )
}
