import { useEffect, useState, type MouseEvent } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
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
  action: { to: string; label: string }
  /** 글이 있는 장만. 없으면 장 목록에 "준비 중"으로만 선다 */
  document: GuideDocument | null
}

const CHAPTERS: Chapter[] = GUIDE_CHAPTERS.map((source, index) => ({
  id: source.id,
  name: source.name,
  number: index + 1,
  action: source.action,
  document: source.markdown === null ? null : readGuideDocument(source.id, source.markdown),
}))

/** 글이 있는 첫 장이 `/guide`다. 다른 장이 먼저 채워져 있던 때의 주소(`/guide/backtest`)도 그대로 열린다 */
const READY = CHAPTERS.filter((chapter) => chapter.document !== null)
const FIRST_READY = READY[0]
const pathOf = (chapter: Chapter) => (chapter === FIRST_READY ? '/guide' : `/guide/${chapter.id}`)

/** 꼭지로 옮긴다. 주소는 바꾸지 않는다(새 기록이 생기면 뒤로 가기가 꼭지마다 걸린다). 새 탭으로 열기는 브라우저에 맡긴다 */
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

/**
 * 지금 읽는 꼭지(2026-11-03). 화면 위 30% 선을 지난 마지막 꼭지 제목이다 — 첫 꼭지 전이면 null.
 * 스크롤마다 제목 몇 개의 자리만 재고(그리는 때에 한 번), 오른쪽 "이 장에서"가 그 꼭지를 표시한다
 */
function useReadingSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    const headings = key === '' ? [] : key.split('|').map((id) => document.getElementById(id))
    let frame = 0
    const measure = () => {
      frame = 0
      const line = window.innerHeight * 0.3
      let current: string | null = null
      for (const heading of headings) if (heading !== null && heading.getBoundingClientRect().top <= line) current = heading.id
      setActive(current)
    }
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [key])
  return active
}

/** 글이 있는 장 사이에서 앞뒤 장으로 */
function Pager({ chapter }: { chapter: Chapter }) {
  const index = READY.indexOf(chapter)
  const previous = READY[index - 1]
  const next = READY[index + 1]
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
 * 사용설명서(2026-11-03 — 사용자가 노션에 쓴 글을 장마다 옮긴다, src/content/guide).
 * 넓은 화면(1200px~)은 세 열이다: 왼쪽 장 목록(마이페이지 메뉴와 같은 줄) | 가운데 본문 | 오른쪽 "이 장에서"(꼭지 + 그 기능 바로 열기).
 * 본문 760px을 두 열 사이 가운데에 세운다 — 본문 | 차례 두 열일 때 넓은 화면에서 그 사이가 500px 넘게 비었다(사용자 "허전함").
 * 두 옆 열은 읽는 동안 위에 붙어 따라온다. 901~1199px은 오른쪽 열이 장 목록 아래로, 900px 이하는 장 목록(두 칸씩) → 본문 → 단추 → 장 넘기기.
 * 선은 다른 화면처럼 길잡이에만 둔다(메뉴 줄 사이 가는 선, "이 장에서" 먹 선 — 왼쪽 첫 줄 선과 같은 높이). 본문 글 사이에는 굵은 선을 두지 않는다.
 */
export default function GuidePage() {
  const { chapterId } = useParams()
  const chapter = chapterId === undefined ? FIRST_READY : READY.find((item) => item.id === chapterId)
  useDocumentTitle(chapter === undefined ? '사용설명서' : `${chapter.name} 사용설명서`)

  // 없는 장·아직 글이 없는 장의 주소는 첫 장으로 보낸다
  if (chapterId !== undefined && chapter === undefined) return <Navigate to="/guide" replace />

  const content = chapter?.document ?? null
  return <GuideView chapter={chapter} content={content} />
}

function GuideView({ chapter, content }: { chapter: Chapter | undefined; content: GuideDocument | null }) {
  const reading = useReadingSection(content?.sections.map((section) => section.id) ?? [])
  // 다른 화면이 꼭지 주소로 보내면(백테스트 도움말의 "자세히 보기" — /guide/backtest#backtest-1) 그 꼭지에서 시작한다
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '') return
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (target === null) return
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [hash, content])
  return (
    <>
      <h1 className={styles.title}>JUBY 사용설명서</h1>

      <div className={styles.layout}>
        <nav className={styles.chapters} aria-label="사용설명서 장">
          <ol className={styles.chapterList}>
            {CHAPTERS.map((item) => {
              // 여백으로 띄운 자리에도 빈칸을 둔다 — 없으면 읽어 주는 쪽·복사한 글이 "1JUBY 소개"로 붙는다
              const label = (
                <>
                  <span className={styles.number}>{item.number}</span>{' '}
                  <span>{item.name}</span>
                </>
              )
              return (
                <li key={item.id}>
                  {item.document === null ? (
                    <span className={styles.chapterSoon}>
                      {label}{' '}
                      <span className={styles.soon}>준비 중</span>
                    </span>
                  ) : (
                    <Link
                      to={pathOf(item)}
                      className={item === chapter ? styles.chapterOn : styles.chapter}
                      aria-current={item === chapter ? 'page' : undefined}
                    >
                      {label}
                    </Link>
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
        </article>

        {chapter !== undefined && (
          <aside className={styles.side} aria-labelledby="guide-side-title">
            <h2 id="guide-side-title" className={styles.sideTitle}>
              이 장에서
            </h2>
            {content !== null && content.sections.length > 0 && (
              <ol className={styles.sections}>
                {content.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className={reading === section.id ? styles.sectionLinkOn : styles.sectionLink}
                      aria-current={reading === section.id ? 'location' : undefined}
                      onClick={jumpTo(section.id)}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            )}
            <Link to={chapter.action.to} className={styles.action}>
              {chapter.action.label}
            </Link>
          </aside>
        )}

        {chapter !== undefined && <Pager chapter={chapter} />}
      </div>
    </>
  )
}
