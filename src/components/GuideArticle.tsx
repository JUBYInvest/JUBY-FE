import { memo, useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { Link } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { GUIDE_IMAGE_SIZES } from '../content/guide'
import type { GuideSectionLink } from '../utils/guideMarkdown'
import { plainText, remarkLooseStrong } from '../utils/guideMarkdown'
import { safeLink } from '../utils/link'
import styles from './GuideArticle.module.css'

/** react-markdown이 넘기는 글 나무(hast)에서 쓰는 만큼만 */
interface TreeNode {
  type: string
  tagName?: string
  value?: string
  children?: TreeNode[]
}

const textOf = (node: TreeNode | undefined): string =>
  node === undefined ? '' : node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('')

/** 빈 글자 조각을 뺀 자식이 요소 하나뿐이면 그 태그 */
function onlyChildTag(node: TreeNode | undefined): string | null {
  const children = (node?.children ?? []).filter((child) => !(child.type === 'text' && (child.value ?? '').trim() === ''))
  return children.length === 1 && children[0].type === 'element' ? (children[0].tagName ?? null) : null
}

function makeComponents(sections: GuideSectionLink[]): Components {
  return {
    /*
     * 제목은 한 단계씩 내린다 — 화면 제목(h1)·장 제목(h2)이 위에 있다. "## 꼭지"는 앱의 구역처럼 제목 줄 + 굵은 먹 선으로 열고,
     * 차례가 옮겨 오는 자리라 id를 달고,
     * 차례로 옮긴 뒤 포커스를 받는다(tabIndex -1, 키보드로 이어 읽는 자리가 그 꼭지가 된다)
     */
    h1: ({ node, children }) => <SectionHeading node={node} sections={sections}>{children}</SectionHeading>,
    h2: ({ node, children }) => <SectionHeading node={node} sections={sections}>{children}</SectionHeading>,
    h3: ({ children }) => <h4 className={styles.topic}>{children}</h4>,
    h4: ({ children }) => <h5 className={styles.term}>{children}</h5>,
    h5: ({ children }) => <h6 className={styles.term}>{children}</h6>,
    h6: ({ children }) => <h6 className={styles.term}>{children}</h6>,
    // 그림만 있는 문단은 그림 자리, 코드 한 조각뿐이면 식(샤프 지수 = …), 굵은 글 한 줄뿐이면 아래를 여는 머리말(Q. …·매수 조건)이다
    p: ({ node, children }) => {
      const only = onlyChildTag(node)
      if (only === 'img') return <figure className={styles.figure}>{children}</figure>
      if (only === 'code') return <p className={styles.formula}>{children}</p>
      if (only === 'strong') return <p className={styles.lead}>{children}</p>
      return <p>{children}</p>
    },
    img: ({ src, alt }) => {
      if (typeof src !== 'string') return null
      const size = GUIDE_IMAGE_SIZES[src]
      return <img src={src} alt={alt ?? ''} width={size?.width} height={size?.height} loading="lazy" decoding="async" />
    },
    // 앱 안 주소는 라우터 링크, 바깥은 http·https만 새 탭으로
    a: ({ href, children }) => {
      if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) return <Link to={href}>{children}</Link>
      const link = safeLink(href)
      if (link === '') return <>{children}</>
      return (
        <a href={link} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    },
    // 좁은 화면에서 표가 넘치면 표만 옆으로 민다(화면 전체가 흔들리지 않게)
    table: ({ children }) => (
      <div className={styles.tableWrap}>
        <table>{children}</table>
      </div>
    ),
  }
}

function SectionHeading({ node, sections, children }: { node: TreeNode | undefined; sections: GuideSectionLink[]; children: ReactNode }) {
  const text = plainText(textOf(node))
  const id = sections.find((section) => section.title === text)?.id
  return (
    <div className={styles.sectionHead}>
      <h3 id={id} tabIndex={id === undefined ? undefined : -1} className={styles.section}>
        {children}
      </h3>
    </div>
  )
}

const REMARK_PLUGINS = [remarkGfm, remarkLooseStrong]

interface Props {
  body: string
  sections: GuideSectionLink[]
}

/**
 * 사용설명서 한 장의 본문(마크다운 — 표·굵게·인용·그림). AI 답변과 같은 렌더러(react-markdown + remark-gfm)라 묶음을 같이 쓴다.
 * 글 속 HTML은 그리지 않는다(rehype-raw를 쓰지 않는다). 주소가 바뀌어도(차례의 장 고르기 전) 같은 글이면 다시 읽지 않는다
 */
function GuideArticle({ body, sections }: Props) {
  const components = useMemo(() => makeComponents(sections), [sections])
  return (
    <div className={styles.body}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  )
}

export default memo(GuideArticle)
