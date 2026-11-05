/*
 * 홈 전체 채팅의 예시 대화. 채팅 서버가 없어 지어낸 말이다 — 화면은 "예시"라고 밝힌다.
 * 투자를 권하거나 수익을 말하지 않는 잡담·질문·서비스 쓰는 법으로만 짓는다. 서버가 생기면 이 파일을 지운다(src/api/chat.ts)
 */

interface ChatPreviewMessage {
  author: string
  text: string
  /** 몇 분 전 말인가 — 화면이 지금 시각에서 뺀다 */
  minutesAgo: number
}

/** 처음 보이는 대화(오래된 말이 앞) */
export const CHAT_PREVIEW_HISTORY: ChatPreviewMessage[] = [
  { author: '반도체관심', text: '오늘 장 시작하자마자 거래대금 순위가 확 바뀌네요', minutesAgo: 34 },
  { author: '주린이공부중', text: '거래대금 순위는 홈 시세표 옆 탭에서 보는 거 맞죠?', minutesAgo: 31 },
  { author: '반도체관심', text: '네 "실시간 거래대금 순위" 탭이요', minutesAgo: 30 },
  { author: '차트독학', text: '백테스트 처음 돌려 봤는데 MDD가 생각보다 크게 나와서 놀랐어요', minutesAgo: 22 },
  { author: '처음이에요', text: 'MDD가 최대 낙폭 맞나요?', minutesAgo: 21 },
  { author: '차트독학', text: '맞아요. 사용설명서 3장에 표로 정리돼 있어요', minutesAgo: 20 },
  { author: '느긋한거북', text: 'AI한테 종목 이름 줄여서 물어봐도 알아듣네요 ㅎㅎ', minutesAgo: 12 },
  { author: '월급쟁이투자', text: '점심시간에 잠깐 들어왔어요. 다들 좋은 하루 보내세요', minutesAgo: 6 },
  { author: '주린이공부중', text: '투자성향 테스트 다시 해 봤는데 결과가 그대로네요', minutesAgo: 2 },
]

/** 보고 있는 동안 띄엄띄엄 들어오는 예시 말 */
export const CHAT_PREVIEW_LIVE: string[][] = [
  ['처음이에요', '관심종목 하트 누르면 관심종목 화면에 모이는 거 오늘 알았어요'],
  ['반도체관심', '지수 띠가 실시간으로 움직이니까 보는 재미가 있네요'],
  ['느긋한거북', '커뮤니티에 백테스트 점수 보는 법 글 올라왔던데 도움 많이 됐어요'],
  ['차트독학', '이동평균 교차 전략은 기간을 6개월 이상으로만 고를 수 있더라고요'],
]
