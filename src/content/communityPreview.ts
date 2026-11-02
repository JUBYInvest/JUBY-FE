/*
 * 홈 오른쪽 아래 "커뮤니티" 채팅 칸의 예시 대화. 커뮤니티 백엔드가 아직 없어 지어낸 대화다(2026-10-30 사용자 결정 — 목업으로 먼저 보인다.
 * 2026-11-02 사용자 요청 "글 형식이 아니라 채팅 형식"으로 글 목록에서 대화로 바꿨다).
 * 화면은 칸 제목 옆에 "예시", 입력칸에 "준비 중", 칸 아래에 "지금 보이는 대화는 예시"라고 밝힌다.
 * 대화는 투자를 권하거나 수익을 말하지 않는 질문·감상·서비스 쓰는 법으로만 짓는다.
 * 백엔드가 생기면 src/api로 옮기고 이 파일을 지운다.
 */

import type { ChatMessageSource } from '../utils/chat'

/**
 * 오래된 말부터 적는다(채팅은 아래가 최신이다 — 순서가 틀려도 화면이 몇 분 전인지로 다시 세운다).
 * 같은 사람이 같은 분(minutesAgo)에 이어 말하면 화면이 이름·시각을 한 번만 보인다(utils/chat.ts)
 */
export const COMMUNITY_PREVIEW_MESSAGES: ChatMessageSource[] = [
  { id: 1, author: '월급쟁이투자', stock: null, text: '투자성향 테스트 해 봤는데 위험중립형 나왔어요. 다들 뭐 나오셨어요?', minutesAgo: 64 },
  { id: 2, author: '주린이공부중', stock: null, text: '저는 안정추구형이요. 10문항이라 금방 끝나더라고요', minutesAgo: 61 },
  { id: 3, author: '반도체관심', stock: 'SK하이닉스', text: '1년 그래프로 보니 생각보다 많이 내렸네요', minutesAgo: 35 },
  { id: 4, author: '처음이에요', stock: null, text: '백테스트 결과에 나오는 MDD가 뭔가요?', minutesAgo: 22 },
  { id: 5, author: '차트독학', stock: null, text: '최대 낙폭이요. 그 기간에 가장 높았던 때에서 가장 많이 내려간 비율이에요', minutesAgo: 20 },
  { id: 6, author: '처음이에요', stock: null, text: '아하 감사합니다!', minutesAgo: 19 },
  { id: 7, author: '주린이공부중', stock: '삼성전자', text: '백테스트 처음 돌려 봤어요', minutesAgo: 12 },
  { id: 8, author: '주린이공부중', stock: null, text: '점수 보는 법 알려 주실 분 있나요?', minutesAgo: 12 },
  { id: 9, author: '반도체관심', stock: '한화에어로스페이스', text: '차트 아래 거래량 막대는 어떻게 읽나요?', minutesAgo: 4 },
]
