/*
 * 커뮤니티 예시 글. 커뮤니티 백엔드가 아직 없어 지어낸 글이다 — 화면은 "예시"라고 밝힌다.
 * 글은 투자를 권하거나 수익을 말하지 않는 질문·감상·서비스 쓰는 법으로만 짓는다. 사진은 이 앱 사용설명서 그림을 쓴다.
 *
 * 서버가 생기면 처음 목록은 REST, 새 글·공감 수는 웹소켓으로 받는다(src/api/community.ts — 주소를 넣으면 이 파일 대신 그쪽을 쓴다).
 * 그때 이 파일을 지운다.
 */

/** 예시 글 하나. 시각은 "몇 분 전"으로 적고 화면이 지금 시각에서 뺀다 */
export interface CommunityPreviewPost {
  id: number
  author: string
  /** 이야기하는 종목. 없으면 null */
  stock: { code: string; name: string } | null
  title: string
  text: string
  /** 붙인 사진(public 아래 주소). 없으면 생략 */
  images?: string[]
  minutesAgo: number
  likes: number
  comments: number
}

const SAMSUNG = { code: '005930', name: '삼성전자' }
const HYNIX = { code: '000660', name: 'SK하이닉스' }
const HANWHA = { code: '012450', name: '한화에어로스페이스' }
const BIO = { code: '207940', name: '삼성바이오로직스' }

/** 처음 열 때 보이는 글. 순서는 상관없다 — 화면이 최신순·공감순으로 다시 세운다 */
export const COMMUNITY_PREVIEW_POSTS: CommunityPreviewPost[] = [
  { id: 1, author: '월급쟁이투자', stock: null, title: '투자성향 테스트 다들 뭐 나오셨어요?', text: '투자성향 테스트 해 봤는데 위험중립형 나왔어요. 다들 뭐 나오셨어요?', minutesAgo: 64, likes: 12, comments: 9 },
  { id: 2, author: '주린이공부중', stock: null, title: '안정추구형 나왔어요', text: '저는 안정추구형이요. 10문항이라 금방 끝나더라고요. 결과 화면에서 바로 백테스트로 넘어가는 게 편했어요.', minutesAgo: 61, likes: 4, comments: 2 },
  { id: 3, author: '반도체관심', stock: HYNIX, title: '1년 그래프로 보니 흐름이 보여요', text: '홈 대표 종목 카드의 1년 그래프로 보니 생각보다 많이 내렸네요. 기간을 1년으로 두니 흐름이 한눈에 보여요.', minutesAgo: 35, likes: 7, comments: 3 },
  { id: 4, author: '처음이에요', stock: null, title: 'MDD가 뭔가요?', text: '백테스트 결과에 나오는 MDD가 뭔가요? 숫자가 클수록 좋은 건지 나쁜 건지 헷갈려요.', minutesAgo: 22, likes: 15, comments: 6 },
  { id: 5, author: '차트독학', stock: null, title: 'MDD는 최대 낙폭이에요', text: '최대 낙폭이요. 그 기간에 가장 높았던 때에서 가장 많이 내려간 비율이라 작을수록 덜 흔들린 거예요. 사용설명서 3장에 표로 정리돼 있어요.', minutesAgo: 20, likes: 21, comments: 2 },
  { id: 6, author: '주린이공부중', stock: SAMSUNG, title: '백테스트 점수 보는 법', text: '백테스트 처음 돌려 봤어요. 점수 보는 법 알려 주실 분 있나요?', minutesAgo: 12, likes: 5, comments: 4 },
  { id: 7, author: '반도체관심', stock: HANWHA, title: '거래량 막대 색이 궁금해요', text: '차트 아래 거래량 막대는 어떻게 읽나요? 빨간 막대와 파란 막대가 섞여 있어요.', minutesAgo: 4, likes: 3, comments: 1 },
  { id: 8, author: '느긋한거북', stock: BIO, title: 'AI 주가분석 써 봤어요', text: 'AI 주가분석에 "왜 내렸어?"라고 물어보니 최근 뉴스를 묶어서 설명해 주네요. 출처 링크가 같이 나오는 게 좋았어요.', minutesAgo: 95, likes: 9, comments: 5 },
  { id: 9, author: '차트독학', stock: SAMSUNG, title: '전략마다 적합도가 다르네요', text: '같은 종목도 전략을 바꾸면 적합도가 꽤 달라지네요. 기간도 3개월이랑 1년이 다르게 나와요. 사용설명서 3장 이동평균 교차 그림을 보고 나니 왜 그런지 알겠어요.', minutesAgo: 130, likes: 18, comments: 7, images: ['/guide/backtest/ma-cross.webp'] },
  { id: 10, author: '처음이에요', stock: null, title: '관심종목 한꺼번에 보는 법', text: '관심종목 하트 눌러 두면 관심종목 화면에서 한꺼번에 볼 수 있어요. 오늘 처음 알았네요.', minutesAgo: 180, likes: 6, comments: 0 },
]

/**
 * 웹소켓이 붙기 전, 보고 있는 동안 새 글이 들어오는 모습을 보이려고 차례로 흘려보내는 예시 글(src/api/community.ts의 목업 연결).
 * 이 글들은 들어오는 순간이 "방금"이다(minutesAgo는 쓰지 않는다)
 */
export const COMMUNITY_PREVIEW_LIVE: CommunityPreviewPost[] = [
  { id: 101, author: '느긋한거북', stock: null, title: 'AI 챗봇 질문 사례 따라 하는 중', text: '사용설명서에 AI 챗봇 질문 사례가 정리돼 있어서 따라 해 보는 중이에요.', minutesAgo: 0, likes: 0, comments: 0 },
  { id: 102, author: '월급쟁이투자', stock: HYNIX, title: '관심종목 지도 칸 크기의 뜻', text: '관심종목 지도에서 칸 크기가 거래대금이라는 걸 이제 알았어요.', minutesAgo: 0, likes: 0, comments: 0 },
  { id: 103, author: '주린이공부중', stock: null, title: '성향별 전략 비교해 보려고요', text: '안정추구형은 볼린저 밴드 전략이 기본이네요. 다른 성향 전략도 비교해 보려고요.', minutesAgo: 0, likes: 0, comments: 0 },
]
