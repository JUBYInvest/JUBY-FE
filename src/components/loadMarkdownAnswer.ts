import PlainAnswer from './PlainAnswer'

/**
 * 답변의 마크다운·수식 렌더러(react-markdown·KaTeX)를 따로 받는다. 압축해도 120KB가 넘어 같이 묶으면 AI 화면 묶음이
 * 30배로 커졌다(2026-09-30, 4KB → 133KB). ChatMessages의 lazy와 AiPage의 미리 받기가 같이 쓴다(한 번만 받는다).
 * 못 받으면 서식 없는 답변(PlainAnswer)으로 대신한다 — 서식이 없어도 답은 읽힌다. 크롬은 한 번 실패한 import를 페이지가
 * 살아 있는 동안 기억하므로, 실패하면 그 탭에서는 끝까지 글자 그대로다.
 */
export const loadMarkdownAnswer = () =>
  import('./MarkdownAnswer').catch((error: unknown) => {
    console.warn('답변 서식 묶음을 받지 못했어요', error)
    return { default: PlainAnswer }
  })
