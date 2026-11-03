/*
 * 홈 오른쪽 위 "사용설명서" 칸의 글. 사용자가 고치는 글이라 여기 한 곳에만 둔다(2026-10-30 사용자 결정 — "그대로 쓰되 수정하기 용이하게").
 * 단계를 더하거나 빼도 화면이 알아서 번호를 매긴다. `to`가 있으면 그 화면으로 가는 링크, 없으면 글만 보인다
 * (홈에서는 홈('/')으로 가는 링크를 글로만 둔다 — 같은 화면이다).
 * 사용설명서 화면(/guide)의 글은 src/content/guide/에 따로 있다(2026-11-03까지는 그 화면 오른쪽에도 이 단계가 보였다).
 */

interface HomeGuideStep {
  title: string
  description: string
  to?: string
}

export const HOME_GUIDE_INTRO = '처음이라면 이 순서로 써 보세요'

export const HOME_GUIDE_STEPS: HomeGuideStep[] = [
  { title: '투자성향 테스트', description: '10문항으로 나에게 맞는 전략을 골라 드려요', to: '/personality-test' },
  { title: '종목 찾기', description: '홈에서 검색하거나 시세표의 종목을 눌러 보세요', to: '/' },
  { title: '주식 백테스트', description: '전략을 과거 주가에 적용해 점수로 봐요', to: '/backtest' },
  { title: 'AI에게 물어보기', description: '궁금한 종목을 말로 물어보세요', to: '/ai' },
]
