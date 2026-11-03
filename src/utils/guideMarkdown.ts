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
 * 코드 블록 안의 "## "는 제목이 아니라 건너뛴다.
 */
export function readGuideDocument(chapterId: string, markdown: string): GuideDocument {
  const titleMatch = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(markdown)
  const title = titleMatch === null ? null : plainText(titleMatch[1])
  const body = titleMatch === null ? markdown : markdown.slice(titleMatch[0].length)

  const sections: GuideSectionLink[] = []
  let fenced = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    const heading = fenced ? null : /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line)
    if (heading !== null) sections.push({ id: `${chapterId}-${sections.length + 1}`, title: plainText(heading[1]) })
  }
  return { title, body, sections }
}
