/*
 * 사용설명서 글(src/content/guide/*.md) 읽기. 글은 사용자가 노션에 쓴 것을 마크다운으로 내보내 그대로 옮긴다(2026-11-03).
 * 글 맨 앞의 "# 제목"은 화면이 구역 제목 줄에 따로 그리고, "## 꼭지"는 차례에 건다.
 */

export interface GuideSectionLink {
  /** 본문 꼭지 제목의 id — 차례가 이 자리로 옮긴다 */
  id: string
  title: string
}

export interface GuideDocument {
  /** 맨 앞 "# 제목". 없으면 null(화면이 장 이름을 쓴다) */
  title: string | null
  /** 제목을 뗀 본문 */
  body: string
  sections: GuideSectionLink[]
}

/** 마크다운 글자 꾸밈(굵게·기울임·코드·링크)을 걷은 글. 차례와 본문 제목이 같은 글인지 견줄 때 쓴다 */
export function plainText(inline: string): string {
  return inline
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 장 하나를 읽는다. 꼭지 id는 장 id + 순서(`backtest-2`)다 — 글이 바뀌어도 주소 모양이 같다.
 * 코드 블록 안의 "#"는 제목이 아니라 건너뛴다.
 *
 * 본문 제목은 단계를 건너뛰지 않게 다시 매긴다 — 노션 글에 "## 1.1 주비 소개" 바로 아래 "#### 주비란?"이 있다(1장).
 * 그대로 그리면 h3 다음이 h5라 화면 읽기 프로그램의 제목 목록이 비고, 글자도 한 단계 작게 보인다.
 * 제목마다 원래 단계가 더 얕은 가장 가까운 앞 제목의 한 단계 아래로 둔다(형제끼리는 같은 단계, 본문의 #·##는 꼭지).
 */
export function readGuideDocument(chapterId: string, markdown: string): GuideDocument {
  const titleMatch = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(markdown)
  const title = titleMatch === null ? null : plainText(titleMatch[1])
  const source = titleMatch === null ? markdown : markdown.slice(titleMatch[0].length)

  const sections: GuideSectionLink[] = []
  const parents: { level: number; depth: number }[] = []
  let fenced = false
  const lines = source.split(/\r?\n/).map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const heading = fenced ? null : /^(#{1,6})([ \t]+.*)$/.exec(line)
    if (heading === null) return line
    const level = heading[1].length
    while (parents.length > 0 && parents[parents.length - 1].level >= level) parents.pop()
    const depth = parents.length === 0 ? 2 : Math.min(parents[parents.length - 1].depth + 1, 6)
    parents.push({ level, depth })
    if (depth === 2) sections.push({ id: `${chapterId}-${sections.length + 1}`, title: plainText(heading[2].replace(/[ \t]+#*[ \t]*$/, '')) })
    return '#'.repeat(depth) + heading[2]
  })
  return { title, body: lines.join('\n'), sections }
}

/** 글 나무(mdast)에서 쓰는 만큼만 */
interface TextTreeNode {
  type: string
  value?: string
  children?: TextTreeNode[]
}

/**
 * 마크다운이 굵게로 못 읽고 글자로 남긴 `**…**`를 굵게로 바꾸는 remark 플러그인.
 * 마크다운 규칙은 닫는 `**` 앞이 기호(%·) 등)이고 바로 뒤가 글자면 닫지 않는다 — "최대낙폭이 **-18.40%**로"(4장)가 별표째 보였다.
 * 노션은 굵게 보여 주니 그대로 옮기려면 맞춰야 한다. 한 글자 조각 안에 갇힌 `**…**`만 바꾼다(안에 다른 꾸밈이 있으면 그대로 둔다).
 */
export function remarkLooseStrong() {
  const visit = (node: TextTreeNode) => {
    if (node.children === undefined) return
    node.children = node.children.flatMap((child): TextTreeNode[] => {
      if (child.type !== 'text' || child.value === undefined || !child.value.includes('**')) {
        visit(child)
        return [child]
      }
      const parts: TextTreeNode[] = []
      let rest = child.value
      for (let match = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/.exec(rest); match !== null; match = /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*/.exec(rest)) {
        if (match.index > 0) parts.push({ type: 'text', value: rest.slice(0, match.index) })
        parts.push({ type: 'strong', children: [{ type: 'text', value: match[1] }] })
        rest = rest.slice(match.index + match[0].length)
      }
      if (rest !== '') parts.push({ type: 'text', value: rest })
      return parts
    })
  }
  return (tree: TextTreeNode) => visit(tree)
}
