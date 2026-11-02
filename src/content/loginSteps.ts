/*
 * 로그인 화면 아래 "로그인하면 이렇게 시작해요" 세 칸의 글(2026-11-02). 사용자가 고치기 쉽게 여기 한 곳에만 둔다(홈 사용설명서 칸과 같은 규칙).
 * 정말 차례가 있다 — 첫 로그인 회원은 성향테스트부터 하고(OAuthCallbackPage), 백테스트는 그 성향에 맞는 전략을 미리 고르고,
 * AI는 그 성향을 알고 답한다. 화면이 번호를 매긴다. 세 칸 가운데 칸 폭이 단추 줄과 같아 셋일 때 가장 반듯하다.
 */

interface LoginStep {
  title: string
  description: string
}

export const LOGIN_STEPS: LoginStep[] = [
  { title: '투자성향 테스트', description: '처음 로그인하면 10문항으로 내 성향부터 찾아요' },
  { title: '주식 백테스트', description: '성향에 맞는 전략을 지난 주가에 적용해 점수로 봐요' },
  { title: 'AI 주가분석', description: '궁금한 종목을 AI에게 말로 물어봐요' },
]
