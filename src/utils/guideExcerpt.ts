import backtestChapter from '../content/guide/backtest.md?raw'

/*
 * 백테스트 화면 오른쪽 날개 도움말이 사용설명서 3장(src/content/guide/backtest.md)에서 그대로 떼어 오는 글.
 * 글은 사용자가 노션에서 쓴 것이라 고치지 않고 줄 단위로 옮긴다.
 * 굵게(**)는 남겨 두고 그리는 쪽이 나눈다. 글이 바뀌어 찾는 줄이 없으면 그 조각만 빈다(던지지 않는다).
 */

const LINES = backtestChapter.split('\n')

/** "## " 꼭지 순서대로의 사용설명서 주소 조각 — 사용설명서 화면의 꼭지 id(`backtest-2`, utils/guideMarkdown)와 같은 규칙 */
const SECTIONS = LINES.filter((line) => /^## /.test(line)).map((line, index) => ({ title: line.slice(3).trim(), anchor: `backtest-${index + 1}` }))

function anchorOf(keyword: string): string | null {
  return SECTIONS.find((section) => section.title.includes(keyword))?.anchor ?? null
}

/** 제목 줄(정규식)부터 다음 같은·윗단계 제목 전까지의 줄 */
function block(heading: RegExp, depth: number): string[] {
  const start = LINES.findIndex((line) => heading.test(line))
  if (start === -1) return []
  const stop = LINES.findIndex((line, index) => index > start && new RegExp(`^#{1,${depth}} `).test(line))
  return LINES.slice(start + 1, stop === -1 ? undefined : stop)
}

interface StrategyExcerpt {
  /** "**아이디어** — …" 줄 */
  idea: string | null
  /** "**특징** — …" 줄 */
  trait: string | null
  /** 사용설명서 그 꼭지 주소 조각 */
  anchor: string | null
}

/** 전략 이름(utils/backtest INVEST_TYPES의 strategyName)으로 3장 1절의 그 전략 소제목 아래 아이디어·특징 줄 */
export function strategyExcerpt(strategyName: string): StrategyExcerpt {
  const escaped = strategyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 소제목은 "### 🔥 돌파 전략"처럼 앞에 그림 글자 하나 — 이름 전체가 같아야 한다("돌파 전략"이 "볼린저 밴드 돌파 전략"에 걸리지 않게)
  const lines = block(new RegExp(`^### (?:\\S+\\s+)?${escaped}\\s*$`), 3)
  const find = (label: string) => lines.find((line) => line.startsWith(`**${label}**`))?.trim() ?? null
  return { idea: find('아이디어'), trait: find('특징'), anchor: anchorOf('매매 규칙') }
}

/** 3장 "결과는 이 순서로 확인하세요"의 번호 목록 줄(번호는 뗀다) */
export function resultSteps(): { items: string[]; anchor: string | null } {
  const items = block(/^## .*결과는 이 순서로/, 2)
    .map((line) => /^\d+\.\s+(.*)$/.exec(line.trim())?.[1] ?? null)
    .filter((item): item is string => item !== null)
  return { items, anchor: anchorOf('결과는 이 순서로') }
}

/** 3장 자주 묻는 질문 중 질문 글자를 품은 것의 첫 답 문단 */
export function faqAnswer(keyword: string): { question: string; answer: string; anchor: string | null } | null {
  const lines = block(/^## .*자주 묻는 질문/, 2)
  const at = lines.findIndex((line) => line.startsWith('**Q.') && line.includes(keyword))
  if (at === -1) return null
  const answer = lines.slice(at + 1).find((line) => line.trim() !== '')
  if (answer === undefined || answer.startsWith('**Q.')) return null
  return { question: lines[at].replace(/\*\*/g, '').trim(), answer: answer.trim(), anchor: anchorOf('자주 묻는 질문') }
}

/** "**굵게**"가 섞인 한 줄을 [글, 굵은가] 조각으로 */
export function splitBold(line: string): { text: string; bold: boolean }[] {
  return line
    .split('**')
    .map((text, index) => ({ text, bold: index % 2 === 1 }))
    .filter((part) => part.text !== '')
}
