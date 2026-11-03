/*
 * 홈 오른쪽 위 "사용설명서" 칸의 글. 사용자가 고치는 글이라 여기 한 곳에만 둔다(2026-10-30 사용자 결정 — "그대로 쓰되 수정하기 용이하게").
 * 2026-11-03 사용자 "메인 홈화면 오른쪽 상단의 사용설명서도 간단하게 정리해서 반영해줘" — 사용설명서 네 장을 한 줄씩 줄여 그 장으로 잇는다.
 * 제목·주소는 사용설명서 장(src/content/guide/index.ts)과 같게 둔다 — 홈이 그 파일을 불러오면 네 장 글이 첫 묶음에 딸려 와서 따로 적는다
 * (어긋나면 judge/guide.mjs U11이 잡는다). 설명 줄은 장의 꼭지에서 줄였다.
 * 단계를 더하거나 빼도 화면이 알아서 번호를 매긴다. `to`가 있으면 그 화면으로 가는 링크, 없으면 글만 보인다.
 */

interface HomeGuideStep {
  title: string
  description: string
  to?: string
}

export const HOME_GUIDE_INTRO = '처음이라면 이 순서로 읽어 보세요'

export const HOME_GUIDE_STEPS: HomeGuideStep[] = [
  { title: 'JUBY 소개', description: '주비가 하는 일과 시작하는 순서', to: '/guide' },
  { title: '투자성향', description: '10문항 테스트와 성향별 추천 전략', to: '/guide/personality' },
  { title: '주식 백테스트', description: '5가지 전략과 결과 지표 읽는 법', to: '/guide/backtest' },
  { title: 'AI 투자 챗봇', description: '챗봇 이용법과 질문 사례 9가지', to: '/guide/ai' },
]
