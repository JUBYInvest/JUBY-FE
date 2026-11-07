// 판정용 가짜 /api. 스웨거(2026-10-29 GET /v3/api-docs)와 백엔드 소스에서 옮긴 *Response 모양대로 짓는다. 값은 실제와 다르다 —
// 화면 동작 판정에만 쓴다. 같은 출처의 /api/ 는 전부 지어 주고, 백엔드 호스트(api.juby.store)로 가는 요청은 막는다.
// 2026-10-30의 mock(judge2)과 10-31의 덧판(judge3)을 2026-10-31에 하나로 합쳤다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const wrap = (code, result) => JSON.stringify({ isSuccess: true, code, message: 'ok', result })
export const fail = (code = 'COMMON500_1', message = '서버 문제입니다.') => JSON.stringify({ isSuccess: false, code, message, result: null })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 판정의 기준 시각 — 2026-10-29(목) 11:00 KST = 02:00 UTC. 평일 장중이라 상세가 기다리지 않는다 */
export const THU_11 = Date.UTC(2026, 9, 29, 2, 0, 0)

/**
 * 백엔드 JwtUtil 모양의 가짜 access token(서명은 지은 것). subject가 회원 번호다 — 앱이 '최근 본 백테스트'의 주인을 이걸로 가른다(utils/auth getAccountId).
 * 2026-10-31까지는 'judge-token' 한 글자였다.
 */
export function tokenFor(userId = 1, name = '허광엽') {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: String(userId), typ: 'access', role: 'ROLE_USER', name, iat: 1793000000, exp: 1893456000 })}.judge-signature`
}

const ROWS = [
  ['005930', '삼성전자', 71000, 1.2], ['000660', 'SK하이닉스', 1500000, 0.5], ['005935', '삼성전자우', 60000, 0.9],
  ['012450', '한화에어로스페이스', 900000, 2.1], ['207940', '삼성바이오로직스', 1200000, -3.4], ['009150', '삼성전기', 150000, 0.1],
  ['006400', '삼성SDI', 300000, -1.0], ['028260', '삼성물산', 140000, 0.0], ['034730', 'SK', 160000, 0.3],
  ['096770', 'SK이노베이션', 110000, -0.7], ['028050', '삼성E&A', 25000, 1.5], ['032830', '삼성생명', 90000, 0.2],
  ['018260', '삼성에스디에스', 160000, 0.4],
]
export const STOCKS = {
  baseDate: '2026-10-28',
  stockList: ROWS.map(([stockCode, stockName, closePrice, fluctuate], i) => ({
    stockCode, stockName, closePrice, fluctuate, tradingValue: (ROWS.length - i) * 1e11, isLiked: i === 0,
  })),
}
// 지수 응답(GET /api/market-indices의 indices). 값은 지은 것이다
const idx = (code, name, currentIndex, changeRate) => ({ code, name, currentIndex, changeRate, accTradingValue: 1e13, realtime: false })
export const INDICES = {
  ok: [idx('0001', '코스피', 2612.43, 0.47), idx('1001', '코스닥', 745.1, -0.43)],
  strings: [idx('0001', '코스피', '2612.43', '0.47'), idx('1001', '코스닥', '745.10', '-0.43')],
  flat: [idx('0001', '코스피', 2600, 0), idx('1001', '코스닥', 745.1, null)],
  partial: [idx('0001', '', 2612.43, 0.47), null, idx('1001', '코스닥', 'abc', -0.43), idx('2001', '코스피200', 350.25, 0.43)],
}
/** 실시간 스트림 한 번분 SSE 본문. batch = { prices?: PriceEvent[], indices?: IndexEvent[], raw?: 덧붙일 글 } */
export function sseBody(batch) {
  const parts = [': 연결\n\n']
  if (batch.prices) parts.push(`event: prices\ndata: ${JSON.stringify(batch.prices)}\n\n`)
  if (batch.indices) parts.push(`event: indices\ndata: ${JSON.stringify(batch.indices)}\n\n`)
  if (batch.raw) parts.push(batch.raw)
  return parts.join('')
}
/*
 * 커뮤니티 가짜 저장소(mock() 한 번마다 새로). 글 25개(종목 넷 + 종목 없는 글), 시각은 기준 시각에서 거슬러 센다.
 * 3번 글은 내 글(닉네임이 있을 때), 1번 글에 댓글 22개(두 쪽)
 */
const COMMUNITY_STOCKS = [['005930', '삼성전자', 1.2], ['000660', 'SK하이닉스', 0.5], ['207940', '삼성바이오로직스', -3.4], ['012450', '한화에어로스페이스', null]]
function communityStore(now, nickname) {
  const posts = Array.from({ length: 25 }, (_, i) => {
    const id = 25 - i
    const stock = id % 5 === 0 ? null : COMMUNITY_STOCKS[id % 4]
    return {
      postId: id, stockCode: stock?.[0] ?? null, stockName: stock?.[1] ?? null, changeRate: stock?.[2] ?? null,
      title: `커뮤니티 글 ${id}`, content: `커뮤니티 글 ${id}의 본문입니다.\n두 번째 줄입니다.`,
      writerNickname: id === 3 && nickname !== null ? nickname : `회원${id}`, likeCount: (id * 7) % 11, commentCount: id === 1 ? 22 : id % 3,
      likedBy: new Set(), isEdited: id === 2, createdAt: now - i * 37 * 60_000, deleted: false,
    }
  })
  const comments = Array.from({ length: 22 }, (_, i) => ({
    commentId: i + 1, postId: 1, content: `댓글 ${i + 1}`, writerNickname: i === 0 && nickname !== null ? nickname : `회원${i + 30}`,
    likeCount: i % 4, likedBy: new Set(), isEdited: false, createdAt: now - (60 - i) * 60_000, deleted: false,
  }))
  return { posts, comments, nickname, nextPost: 26, nextComment: 23 }
}

export const LEADING = {
  strategyName: 'SMA 이동평균선 전략', period: 'ONE_YEAR', periodLabel: '1년',
  startDate: '2025-10-28', endDate: '2026-10-28', updatedAt: '2026-10-29T04:00:03',
  leadingStocks: [
    { stockCode: '000660', theme: 'TECH', themeLabel: '기술주', stockName: 'SK하이닉스', returnPercentage: 12.5, tradeCount: 3 },
    { stockCode: '012450', theme: 'DEFENSE', themeLabel: '방산주', stockName: '한화에어로스페이스', returnPercentage: 4.1, tradeCount: 2 },
    { stockCode: '207940', theme: 'BIO', themeLabel: '바이오주', stockName: '삼성바이오로직스', returnPercentage: -8.25, tradeCount: 2 },
  ],
}
/** 고정 목록(src/api/home.ts FALLBACK)과 다른 대장주 셋 — 첫 방문에 카드 그래프를 두 벌 묻던 결함(C2)을 재현한다 */
export const LEADING_ALT = {
  ...LEADING,
  leadingStocks: [
    { stockCode: '005930', theme: 'TECH', themeLabel: '기술주', stockName: '삼성전자', returnPercentage: 3.2, tradeCount: 2 },
    { stockCode: '006400', theme: 'DEFENSE', themeLabel: '방산주', stockName: '삼성SDI', returnPercentage: 1.1, tradeCount: 1 },
    { stockCode: '034730', theme: 'BIO', themeLabel: '바이오주', stockName: 'SK', returnPercentage: -2.0, tradeCount: 3 },
  ],
}
// 2026-10-28(수)에서 끝나는 평일 일봉. 마지막 종가가 시세표 종가(STOCKS)와 같고, 거슬러 올라가며 하루 ±1.5% 안에서 움직인다.
// (2026-10-29까지는 종목코드로 지은 19,3xx대라 현재가 71,500원과 가격대가 달랐다 — UI 리디자인 지시서 0절)
function tickOf(price) {
  return price >= 500000 ? 1000 : price >= 200000 ? 500 : price >= 50000 ? 100 : price >= 20000 ? 50 : 10
}
const roundTick = (price) => Math.round(price / tickOf(price)) * tickOf(price)
export function lastClose(code) {
  return ROWS.find((r) => r[0] === code)?.[2] ?? 10000 + Number(code.slice(-3)) * 10
}
/** 현재가: 마지막 종가에서 +0.7%(호가 단위로 맞춤). 삼성전자는 71,000 → 71,500 */
export function currentOf(code) {
  const current = roundTick(lastClose(code) * 1.007)
  return { currentPrice: current, comparePrev: Math.round(((current - lastClose(code)) / lastClose(code)) * 10000) / 100 }
}
export function candles(code) {
  const days = []
  const end = Date.UTC(2026, 9, 28)
  for (let i = 420; i >= 0; i--) {
    const d = new Date(end - i * 86400000)
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
    days.push(d.toISOString().slice(0, 10))
  }
  let seed = (Number(code) % 9973) + 17
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const closes = new Array(days.length)
  closes[days.length - 1] = lastClose(code)
  for (let k = days.length - 1; k > 0; k--) closes[k - 1] = closes[k] / (1 + (rand() - 0.5) * 0.03)
  const baseVolume = 1e12 / lastClose(code)
  return days.map((date, k) => {
    const close = roundTick(closes[k])
    const open = roundTick(k === 0 ? closes[k] : closes[k - 1] * (1 + (rand() - 0.5) * 0.008))
    const high = roundTick(Math.max(open, close) * (1 + rand() * 0.008))
    const low = roundTick(Math.min(open, close) * (1 - rand() * 0.008))
    return { date, openPrice: open, highPrice: high, lowPrice: low, closePrice: close, volume: Math.round(baseVolume * (0.6 + rand() * 0.8)) }
  })
}
function search(keyword) {
  const k = keyword.trim().toLowerCase()
  if (k === '') return []
  return ROWS.filter(([, name]) => name.toLowerCase().includes(k)).map(([stockCode, stockName]) => ({ stockCode, stockName }))
}
const NEWS_HOSTS = ['news.example.com', 'biz.example.co.kr', 'market.example.kr']
const NEWS_SUMMARY = [
  '기사 요약이 들어가는 자리입니다. 실제 응답의 요약은 두세 문장으로 길게 오기도 해서, 카드에서는 두 줄까지만 보여 주고 나머지는 말줄임표로 자릅니다. 원문은 제목을 눌러 새 창에서 읽습니다.',
  '짧은 요약입니다.',
  '요약이 한 줄을 조금 넘는 경우입니다. 줄바꿈 위치와 글줄 길이를 보려고 넣은 예시 문장입니다.',
]
export const NEWS = (code) => ({ stockCode: code, stockName: ROWS.find((r) => r[0] === code)?.[1] ?? code, sort: 'LATEST', page: 0, totalCount: 12,
  newsList: Array.from({ length: 10 }, (_, i) => ({ timeAgo: i === 0 ? '3시간 전' : `${i}일 전`, publishedAt: '2026-10-27T10:00:00', title: `관련 기사 ${i + 1}`,
    description: NEWS_SUMMARY[i % NEWS_SUMMARY.length], originalLink: `https://${NEWS_HOSTS[i % NEWS_HOSTS.length]}/${code}/${i}` })) })
export const QUESTIONS = { questions: Array.from({ length: 10 }, (_, i) => ({ questionId: i + 1, content: `문항 ${i + 1}. 투자 손실을 어느 정도까지 감수할 수 있나요?`,
  choices: [1, 3, 5, 7, 9].map((score, j) => ({ choiceId: (i + 1) * 10 + j, content: `보기 ${j + 1}`, score })) })) }
const PERSONALITY = { investPersonality: '위험중립형', description: '위험과 수익의 균형을 중시하는 유형입니다.', personalityImg: null }

/** QuantScoringResponse. live면 점수를 달리 주어 어느 길로 왔는지 화면에서 가릴 수 있게 한다. zero면 끝까지 들고 있던 결과(수익률 0, 거래 0회) */
export function scoring(stockCode, investType, live = false, zero = false) {
  return {
    stockCode, investType, finalScore: live ? 66.6 : 40 + investType * 8,
    stable: { mdd: 0.12, volatility: 0.2, dVolatility: 0.1 },
    profit: zero ? { totalReturn: 0, annualReturn: 0, avgTradeReturn: 0 } : { totalReturn: 0.15, annualReturn: 0.2, avgTradeReturn: 0.03 },
    effect: { sharpeRatio: 1.2, sortinoRatio: 1.5, calmarRatio: 1.1 },
    growth: { momentumRatio: 0.05, volGrowthRatio: 0.1, positionCount: zero ? 0 : 4 },
  }
}
const PRESET = (stockCode, investType, period, zero = false) => ({ stockCode, investType, period, startDate: '2025-10-28', endDate: '2026-10-28', updatedAt: '2026-10-29T04:00:03', result: scoring(stockCode, investType, false, zero) })

/** 서버가 주는 한국 시각 글자("2026-10-29T11:00:00") */
const kstIso = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 19) + '.123456'
const ymd = (ms) => { const d = new Date(ms + 9 * 3600_000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}` }

/** 휴장일 응답: 기준일부터 28일. 주말은 N, holidays(YYYYMMDD[])도 N */
export function holidays(basedate, closedDays = []) {
  const y = Number(basedate.slice(0, 4)), m = Number(basedate.slice(4, 6)) - 1, d = Number(basedate.slice(6, 8))
  const start = Date.UTC(y, m, d)
  return Array.from({ length: 28 }, (_, i) => {
    const date = new Date(start + i * 86400_000)
    const bass_dt = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
    return { bass_dt, wday_dvsn_cd: String(date.getUTCDay() + 1), bzdy_yn: weekend ? 'N' : 'Y', tr_day_yn: 'Y', opnd_yn: weekend || closedDays.includes(bass_dt) ? 'N' : 'Y', sttl_day_yn: 'Y' }
  })
}

/** 거래대금 순위 30줄. 앞 열은 홈 목록에 있는 이름(상세로 이어진다), 뒤는 목록에 없는 이름 */
export function volumeRank() {
  const names = [...STOCKS.stockList.map((s) => s.stockName), '없는종목A', '없는종목B', ' SK 하이닉스 ']
  return Array.from({ length: 30 }, (_, i) => ({
    hts_kor_isnm: names[i % names.length], mksc_shrn_iscd: undefined, data_rank: String(i + 1),
    stck_prpr: String(71500 - i * 100), prdy_vrss: '500', prdy_vrss_sign: '2', prdy_ctrt: '0.70',
    acml_vol: String(1000000 - i * 1000), avrg_tr_pbmn: String(123456789000 - i * 1e9), vol_tnrt: '1.2',
  }))
}

/** 증권사 기간별 시세(최근 날부터, 문자열). 0원 봉 하나, 겹친 날짜 하나를 섞는다 */
export function periodPrices(stockCode, endMs, count = 100) {
  const rows = []
  let price = 70000 + (Number(stockCode) % 1000)
  for (let i = 0, days = 0; i < count; days++) {
    const date = new Date(endMs - days * 86400_000 + 9 * 3600_000)
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue
    const d = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
    const close = Math.round(price / 100) * 100
    rows.push({ stck_bsop_date: d, stck_clpr: String(close), stck_oprc: String(close + 200), stck_hgpr: String(close + 500), stck_lwpr: String(close - 400), acml_vol: String(100000 + i) })
    price *= 1 + ((i % 7) - 3) * 0.004
    i++
  }
  rows.splice(3, 0, { ...rows[3], stck_clpr: '0', stck_oprc: '0', stck_hgpr: '0', stck_lwpr: '0' }) // 거래 정지일
  rows.splice(10, 0, { ...rows[10] }) // 겹친 날짜
  return rows
}

const PUB = ['Wed, 29 Oct 2026 10:00:00 +0900', 'Tue, 28 Oct 2026 18:30:00 +0900', 'Mon, 20 Oct 2026 09:00:00 +0900', 'x']
export function naverNews(query) {
  return { lastBuildDate: 'Thu, 29 Oct 2026 11:00:00 +0900', total: 1234, start: 1, display: 20,
    items: Array.from({ length: 20 }, (_, i) => ({
      title: `<b>${query}</b> 관련 네이버 기사 ${i + 1} &amp; 요약`, originallink: `https://naver.example.com/${encodeURIComponent(query)}/${i % 18}`,
      link: `https://n.news.naver.com/x/${i}`, description: `기사 ${i + 1}의 요약입니다. <b>${query}</b>`, pubDate: PUB[i % PUB.length],
    })) }
}
export function vectorHits(question) {
  return [1, 2, 3].map((i) => ({ id: `id-${i}`, score: 0.9 - i * 0.1, title: `"${question}"에 가까운 기사 ${i}`, description: '요약', originalLink: `https://hit.example.com/${i}`, pubDate: 'Mon, 11 Aug 2026 14:32:00 +0900' }))
}

/** AI 답(마크다운 표 + 수식). 판정은 '요약입니다.'로 답 말풍선을 센다 */
export const ANSWER = `**삼성전자** 요약입니다.\n\n| 항목 | 값 |\n|---|---|\n| 종가 | 71,000원 |\n\n수익률은 $$r = \\frac{P_1 - P_0}{P_0}$$ 로 계산합니다.`
/** 처음부터 있는 대화방. rooms 옵션으로 더 줄 수 있다 */
export const ROOM_1 = { title: '삼성전자 주가 어때?', messages: [
  { messageId: 1, role: 'USER', content: '삼성전자 주가 어때?', createdAt: '2026-10-28T10:00:00' },
  { messageId: 2, role: 'ASSISTANT', content: '**삼성전자**는 최근 한 달 동안 완만히 올랐어요.\n\n| 항목 | 값 |\n|---|---|\n| 종가 | 71,000원 |', createdAt: '2026-10-28T10:00:05' },
] }

/**
 * 돌려주는 배열에 /api 요청을 "METHOD path?query"로 적는다(백엔드 호스트로 나가려다 막힌 것은 "BLOCKED path"). log.asks에 AI 질문 본문을 모은다.
 *
 * opts — 시각·시세표·대장주
 *   now: 기준 시각(ms, 기본 THU_11) — 휴장일·기간별 시세 날짜를 이 시각에 맞춘다
 *   stocksBaseDate: 시세표 기준일(기본 '2026-10-28', null이면 비워 준다), stocksDelay(ms)
 *   leading: 'ok' | 'alt'(고정 목록과 다른 대장주 셋)
 *   indices: 지수 API(GET /api/market-indices) — 'ok'(기본) | 'strings' | 'flat' | 'partial' | 'malformed' | '500' | (n번째 요청) => 그중 하나
 *   stream: 실시간 스트림(GET /api/stream/prices) 연결마다 보낼 묶음 배열(sseBody). n번째 연결이 n번째 묶음을 받고 끝난다(앱이 1초 뒤 다시 붙는다).
 *     묶음이 다 떨어지면(기본은 처음부터) 연결을 열어 둔 채 아무것도 보내지 않는다 — 장중에 값이 안 바뀌는 때와 같다
 *   streamStatus: 스트림을 그 상태로 거절(예: 500)
 *   stocksRealtime: true면 시세표 행이 장중 현재가(realtime)이고 asOf가 붙는다
 * opts — 커뮤니티(/api/community/**, 메모리 저장소 communityStore)
 *   nickname: 내 닉네임(기본 '느긋한거북', null이면 아직 없음 — 글·댓글 쓰기가 403 COMMUNITY403_1), takenNicknames: 이미 쓰는 닉네임 배열
 *   communityStatus: 목록·카드를 그 상태로 실패(예: 500), communityEmpty: true면 글이 하나도 없다
 *   communityReadStatus: 커뮤니티 GET을 모두 그 상태로 실패(쓰기는 된다) — 2026-11-06 운영이 그랬다(없는 글 번호까지 500)
 * opts — 종목 상세·증권사
 *   detailDelay(ms), detailStatus: 상세를 그 상태로 실패(예: 500)
 *   holiday: 'ok'(기본) | '500' | '401' | 'empty', holidayClosed: YYYYMMDD[](공휴일)
 *   rank: 'ok' | '500' | 'empty' | 'malformed', rankDelay(ms)  — 거래대금 순위
 *   backup: 'ok' | '500' | 'empty', backupDelay(ms)  — 기간별 시세(임시 차트)
 *   naver: 'ok' | '429' | '500' | 'malformed', naverDelay(ms)  — 네이버 뉴스
 *   vector: 'ok' | '500' | 'empty', vectorDelay(ms)  — 질문으로 찾기
 * opts — 회원
 *   personality: 'found'(기본) | 'none'(404 MEMBER404_2) | 'error'(500), personalityDelay(ms)
 *   likeList: 'ok' | '500' | '401'(만료된 토큰처럼 — 재발급은 api.juby.store라 막힌다) | (n번째 요청) => 그중 하나, likeListDelay(ms)
 *   likeWrite: 'ok' | '500', likeWriteDelay(ms)
 * opts — 백테스트
 *   optionsPeriods(investType): 프리셋 기간 목록(기본 1·3·6개월·1년), optionsStatus: 401 | 500(기간 목록 실패), optionsDelay(ms)
 *   presetMissing(stockCode, investType, period) → true면 그 프리셋은 BACKTEST404_5, presetDelay(ms)
 *   zeroReturns: true면 프리셋의 수익률·연평균이 0이고 거래 0회
 *   run(stockCode, investType, period) → 'ok' | 'BACKTEST404_6' | 'BACKTEST404_4' | '500'(즉석 실행)
 * opts — AI
 *   rooms: 처음부터 있는 방 수(기본 1 — ROOM_1. 2 이상이면 '둘째 방'…을 더 둔다)
 *   sessionsDelay(ms), sessionsStatus: 500(목록 실패)
 *   sessionDetailStatus: 404(CHAT404_1) | 403(CHAT403_1) | 500 — 방 상세 실패, sessionDetailDelay(ms)
 *   askDelay(ms, 기본 300), askStatus: 'ok' | 'MEMBER404_2' | 'CHAT409_1' | '500' | 'empty'(답이 빈 글) | (n번째 질문) => 그중 하나
 *   createStatus: 500(방 만들기 실패), renameStatus: 500 | 404, deleteStatus: 500 | 404
 */
/*
 * 바깥 글꼴(index.html의 Pretendard CDN·Google Fonts)은 처음 한 번만 받아 judge/.cache/fonts에 담고 다음부터 거기서 준다(2026-11-03).
 * 글꼴 CSS가 첫 그림을 막아 domcontentloaded가 CDN 응답을 기다린다 — 평소 0.3초가 CDN이 늦은 회차엔 1.4초였고, 더 늦으면 4~5초짜리
 * page.goto 시간 초과로 판정이 띄엄띄엄 멈췄다(ui·backtest·feature·market, 같은 빌드를 다시 돌리면 통과). 판정이 바깥 망 사정에 기대지 않게 한다.
 * 받는 건 Node fetch다 — 가로챈 요청 안의 route.fetch()는 다른 가로채기를 건너뛰어 쓰지 않는다(CLAUDE.md). 공개 글꼴뿐이고 저장소에는 올리지 않는다(.gitignore).
 * Google Fonts CSS는 브라우저(user-agent)마다 달라 그것까지 열쇠에 넣는다. 못 받으면 예전처럼 망으로 보낸다
 */
const FONT_HOSTS = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'])
const FONT_CACHE = fileURLToPath(new URL('./.cache/fonts/', import.meta.url))
const fontLoads = new Map()
async function serveFont(route) {
  const req = route.request()
  const ua = req.headers()['user-agent'] ?? ''
  const key = createHash('sha1').update(`${req.url()}\n${ua}`).digest('hex')
  const bodyPath = `${FONT_CACHE}${key}.bin`
  const metaPath = `${FONT_CACHE}${key}.json`
  if (!existsSync(metaPath)) {
    if (!fontLoads.has(key)) {
      fontLoads.set(key, (async () => {
        const res = await fetch(req.url(), { headers: { 'user-agent': ua } })
        if (!res.ok) throw new Error(`글꼴 ${res.status} ${req.url()}`)
        mkdirSync(FONT_CACHE, { recursive: true })
        writeFileSync(`${bodyPath}.tmp`, Buffer.from(await res.arrayBuffer()))
        renameSync(`${bodyPath}.tmp`, bodyPath)
        writeFileSync(`${metaPath}.tmp`, JSON.stringify({ contentType: res.headers.get('content-type') }))
        renameSync(`${metaPath}.tmp`, metaPath)
      })().catch(() => {}).finally(() => fontLoads.delete(key)))
    }
    await fontLoads.get(key)
    if (!existsSync(metaPath)) return route.continue().catch(() => {})
  }
  const { contentType } = JSON.parse(readFileSync(metaPath, 'utf8'))
  return route.fulfill({
    status: 200,
    headers: { 'content-type': contentType ?? 'application/octet-stream', 'access-control-allow-origin': '*' },
    body: readFileSync(bodyPath),
  }).catch(() => {})
}

/*
 * 홈 전체 채팅 가짜 저장소 — 지난 대화 chatHistory개(기본 60, id 1~N, 앞 열 개는 전날), 몇 개는 내 닉네임 말.
 * 서버처럼 GET은 오래된 순, 커서는 그 쪽 첫 말의 id다
 */
const CHAT_LINES = ['오늘 반도체가 좀 쉬어 가네요', '배당 기준일 언제인지 아시는 분?', '백테스트 돌려 보니 이동평균이 생각보다 괜찮았어요', '장 마감 전에 거래대금이 몰리네요',
  'MDD 보는 법 사용설명서에 잘 나와 있어요', '저는 RSI 전략으로 1년 돌려 봤어요', '오늘 코스닥 많이 빠졌네요', '안녕하세요 처음 왔어요', '차트 공부 중인데 볼린저 밴드 어렵네요', '좋은 하루 보내세요']
const CHAT_AUTHORS = ['차트독학', '주린이공부중', '배당모으기', '장기투자러', '느긋한거북']
function chatStore(now, count) {
  const messages = Array.from({ length: count }, (_, i) => {
    const id = i + 1
    const at = id <= 10 ? now - 26 * 3600_000 + id * 60_000 : now - (count - id + 1) * 4 * 60_000
    return { messageId: id, writerNickname: CHAT_AUTHORS[i % CHAT_AUTHORS.length], content: CHAT_LINES[i % CHAT_LINES.length], at }
  })
  return { messages, nextId: count + 1 }
}
/** 서버처럼 한국 시각(시간대 없음) 글자 */
const kstText = (ms) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 19)
const chatRow = (m) => ({ messageId: m.messageId, writerNickname: m.writerNickname, content: m.content, createdAt: kstText(m.at) })

/** 가짜 STOMP 프레임 */
function stompFrame(command, headers, body = '') {
  return `${command}\n${Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${body}\0`
}
function parseStomp(raw) {
  const text = raw.replace(/^(\r?\n)+/, '')
  if (text === '') return null
  const split = text.indexOf('\n\n')
  const head = split === -1 ? text : text.slice(0, split)
  const lines = head.split('\n')
  const headers = {}
  for (const line of lines.slice(1)) { const c = line.indexOf(':'); if (c > 0 && !(line.slice(0, c) in headers)) headers[line.slice(0, c)] = line.slice(c + 1) }
  return { command: lines[0], headers, body: split === -1 ? '' : text.slice(split + 2) }
}

export async function mock(context, opts = {}) {
  const { presetMissing = () => false, run = () => 'ok', askDelay = 300, askStatus = 'ok', createStatus = null, renameStatus = null, deleteStatus = null } = opts
  const { personality = 'found', personalityDelay = 0, likeList = 'ok', likeListDelay = 0, likeWrite = 'ok', likeWriteDelay = 0 } = opts
  const { sessionsDelay = 0, sessionsStatus = null, sessionDetailStatus = null, sessionDetailDelay = 0, detailDelay = 0 } = opts
  const { optionsPeriods = () => ['ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'], optionsStatus = null, optionsDelay = 0, presetDelay = 0, zeroReturns = false } = opts
  const { holiday = 'ok', holidayClosed = [], rank = 'ok', rankDelay = 0, backup = 'ok', backupDelay = 0, naver = 'ok', naverDelay = 0, vector = 'ok', vectorDelay = 0 } = opts
  const { leading = 'ok', stocksBaseDate = '2026-10-28', stocksDelay = 0 } = opts
  const now = opts.now ?? THU_11
  const log = []
  log.asks = []
  let likeListCount = 0
  let indicesCount = 0
  let streamCount = 0
  const store = communityStore(now, opts.nickname === undefined ? '느긋한거북' : opts.nickname)
  if (opts.communityEmpty) store.posts.length = 0
  const chat = chatStore(now, opts.chatHistory ?? 60)
  /*
   * 채팅 웹소켓(wss://api.juby.store/ws/live-chat)을 가로채는 가짜 STOMP 서버 — 실서버로 나가지 않는다.
   * log.chat: connects(CONNECT마다 Authorization 값 또는 null), sends(보낸 글), push(이름, 글) = 다른 사람 말을 모두에게, drop() = 서버가 연결을 끊는다.
   * opts.chatConnect(n, auth) → 에러 코드면 그 CONNECT를 ERROR 프레임으로 거절, opts.chatSendError(글, n) → 코드면 /user/queue/errors로 실패,
   * opts.chatDown이면 웹소켓이 열리자마자 닫힌다
   */
  const sockets = new Set()
  const broadcast = (row) => {
    for (const s of sockets) if (s.subs['/topic/live-chat']) s.ws.send(stompFrame('MESSAGE', { destination: '/topic/live-chat', subscription: s.subs['/topic/live-chat'], 'message-id': `m-${row.messageId}`, 'content-type': 'application/json' }, JSON.stringify(row)))
  }
  // 판정 시계(now)에 맞춘 지금 — 브라우저 시계도 now에 못박혀 있다(seedLogin)
  const startedAt = Date.now()
  const addChat = (author, content) => {
    const m = { messageId: chat.nextId++, writerNickname: author, content, at: now + (Date.now() - startedAt) }
    chat.messages.push(m)
    return chatRow(m)
  }
  log.chat = {
    connects: [], sends: [],
    push: (author, content) => broadcast(addChat(author, content)),
    drop: () => { for (const s of [...sockets]) s.ws.close() },
  }
  await context.routeWebSocket(/\/ws\/live-chat/, (ws) => {
    if (opts.chatDown) { log.push('WS DOWN'); ws.close(); return }
    const state = { ws, subs: {} }
    sockets.add(state)
    ws.onClose(() => sockets.delete(state))
    ws.onMessage((data) => {
      for (const raw of String(data).split('\0')) {
        const frame = parseStomp(raw)
        if (frame === null) continue
        if (frame.command === 'CONNECT') {
          const auth = frame.headers.Authorization ?? null
          log.chat.connects.push(auth)
          log.push(`WS CONNECT${auth ? ' auth' : ''}`)
          const code = opts.chatConnect?.(log.chat.connects.length, auth) ?? null
          if (code) { ws.send(stompFrame('ERROR', { message: code, 'content-type': 'application/json' }, JSON.stringify({ isSuccess: false, code, message: '토큰', result: null }))); ws.close(); return }
          ws.send(stompFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }))
        } else if (frame.command === 'SUBSCRIBE') {
          state.subs[frame.headers.destination] = frame.headers.id
        } else if (frame.command === 'SEND') {
          let content = ''
          try { content = JSON.parse(frame.body).content } catch { /* 형식 틀림 */ }
          log.chat.sends.push(content)
          const code = opts.chatSendError?.(content, log.chat.sends.length) ?? (store.nickname === null ? 'LIVECHAT403_1' : null)
          if (code) {
            const sub = state.subs['/user/queue/errors']
            if (sub) ws.send(stompFrame('MESSAGE', { destination: '/user/queue/errors', subscription: sub, 'message-id': `e-${log.chat.sends.length}`, 'content-type': 'application/json' }, JSON.stringify({ isSuccess: false, code, message: '실패', result: null })))
          } else {
            broadcast(addChat(store.nickname, content))
          }
        }
      }
    })
  })
  let askCount = 0
  // 방 목록은 서버처럼 최근 대화 순(updatedAt 내림차순)이다 — 질문·이름 바꾸기·만들기가 updatedAt을 지금으로 적는다
  const rooms = new Map([[1, { title: ROOM_1.title, updatedAt: '2026-10-28T10:00:05', messages: ROOM_1.messages.map((m) => ({ ...m })) }]])
  for (let id = 2; id <= (opts.rooms ?? 1); id++) {
    rooms.set(id, { title: `${id}번째 방`, updatedAt: `2026-10-${String(27 - id).padStart(2, '0')}T10:00:05`, messages: [
      { messageId: 1, role: 'USER', content: `${id}번째 방의 질문`, createdAt: '2026-10-27T10:00:00' },
      { messageId: 2, role: 'ASSISTANT', content: `${id}번째 방의 답입니다.`, createdAt: '2026-10-27T10:00:05' },
    ] })
  }
  let nextRoom = rooms.size + 1
  await context.route(() => true, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.hostname === 'api.juby.store' && url.pathname === '/api/auth/reissue' && opts.reissue === 'ok') {
      log.push('POST /api/auth/reissue')
      const origin = req.headers()['origin'] ?? '*'
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
        body: JSON.stringify({ isSuccess: true, code: 'AUTH200_2', message: 'ok', result: { accessToken: 'renewed-token' } }) })
    }
    if (url.hostname === 'api.juby.store') { log.push('BLOCKED ' + url.pathname); return route.abort() }
    if (FONT_HOSTS.has(url.hostname)) return serveFont(route)
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const m = req.method(), p = url.pathname, q = url.searchParams
    log.push(`${m} ${p}${url.search}`)
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body }).catch(() => {})
    // 실서버처럼 공개는 /api/stocks/**·지수·실시간 스트림·재발급뿐이다(JUBY-BE dc44e2b). 토큰 없이 그 밖을 부르면 401
    const authed = /^Bearer \S+/.test(req.headers()['authorization'] ?? '')
    // 커뮤니티는 GET이 공개(댓글 목록만 로그인) — 백엔드 SecurityConfig와 같다
    const communityPublic = m === 'GET' && p.startsWith('/api/community/') && !/\/comments$/.test(p)
    const marketPublic = p.startsWith('/api/stocks') || p === '/api/market-indices' || p.startsWith('/api/stream/') || p === '/api/live-chat/messages'
    if (!authed && !marketPublic && p !== '/api/auth/reissue' && !communityPublic) return json(fail('COMMON401_1', '인증이 필요합니다.'), 401)
    if (p.startsWith('/api/community/') || p.startsWith('/api/members/nickname') || p === '/api/members/me/nickname') return communityRoute({ m, p, q, req, authed, json, store, now, opts })
    let mm
    if (p === '/api/live-chat/messages' && m === 'GET') {
      await sleep(opts.chatHistoryDelay ?? 0)
      if (opts.chatHistoryStatus) return json(fail('COMMON500_1', '서버'), opts.chatHistoryStatus)
      const size = Number(q.get('size') ?? 50), cursor = q.has('cursor') ? Number(q.get('cursor')) : Infinity
      const older = chat.messages.filter((x) => x.messageId < cursor)
      const page = older.slice(-size)
      const hasNext = older.length > size
      return json(wrap('LIVECHAT200_1', { messages: page.map(chatRow), nextCursor: hasNext ? page[0].messageId : null, hasNext }))
    }
    if (p === '/api/stocks') {
      await sleep(stocksDelay)
      // 실서버처럼 비로그인에는 isLiked를 주지 않는다
      const live = opts.stocksRealtime === true
      return json(wrap('STOCK200_2', { baseDate: stocksBaseDate, ...(live ? { asOf: kstIso(now) } : {}), stockList: STOCKS.stockList.map((row) => ({ ...row, isLiked: authed && row.isLiked, realtime: live })) }))
    }
    if (p === '/api/market-indices') {
      indicesCount += 1
      const v = typeof opts.indices === 'function' ? opts.indices(indicesCount) : (opts.indices ?? 'ok')
      if (v === '500') return json(fail(), 500)
      if (v === 'malformed') return json(wrap('MARKET_INDEX200_1', { list: [] }))
      return json(wrap('MARKET_INDEX200_1', { asOf: kstIso(now), indices: INDICES[v] }))
    }
    if (p === '/api/stream/prices') {
      streamCount += 1
      if (opts.streamStatus) return json(fail(), opts.streamStatus)
      const batch = opts.stream?.[streamCount - 1]
      if (batch === undefined) return new Promise(() => {})
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(batch) }).catch(() => {})
    }
    if (p === '/api/stocks/leading-stocks') return json(wrap('STOCK200_5', leading === 'alt' ? LEADING_ALT : LEADING))

    if (p === '/api/stocks/search') return json(wrap('STOCK200_4', search(q.get('keyword') ?? '')))
    if ((mm = p.match(/^\/api\/stocks\/(\d{6})\/news$/))) return json(wrap('STOCK200_3', NEWS(mm[1])))
    if ((mm = p.match(/^\/api\/stocks\/(\d{6})$/))) {
      await sleep(detailDelay)
      if (mm[1] === '999999') return json(fail('STOCK404_1', '없는 종목'), 404)
      if (opts.detailStatus) return json(fail('COMMON400_1', '잘못된 요청'), opts.detailStatus)
      return json(wrap('STOCK200_1', { stockCode: mm[1], stockName: ROWS.find((r) => r[0] === mm[1])?.[1] ?? mm[1], ...currentOf(mm[1]), period: q.get('period'), dailyPrices: candles(mm[1]) }))
    }
    if ((mm = p.match(/^\/api\/market\/(\d{6})\/price$/))) return json(wrap('MARKET200_1', { stck_prpr: '71500' }))
    if (p === '/api/market/holiday') {
      if (holiday === '500') return json(fail(), 500)
      if (holiday === '401') return json(fail('AUTH401_1', '만료'), 401)
      if (holiday === 'empty') return json(wrap('MARKET200_1', []))
      return json(wrap('MARKET200_1', holidays(q.get('basedate') ?? ymd(now), holidayClosed)))
    }
    if (p === '/api/market/volume-rank') {
      await sleep(rankDelay)
      if (rank === '500') return json(fail(), 500)
      if (rank === 'empty') return json(wrap('MARKET200_2', []))
      if (rank === 'malformed') return json(wrap('MARKET200_2', { nope: 1 }))
      return json(wrap('MARKET200_2', volumeRank()))
    }
    if ((mm = p.match(/^\/api\/market\/(\d{6})\/daily_itemchartprice$/))) {
      await sleep(backupDelay)
      if (backup === '500') return json(fail(), 500)
      if (backup === 'empty') return json(wrap('MARKET200_3', []))
      return json(wrap('MARKET200_3', periodPrices(mm[1], now)))
    }
    if (p === '/api/news') {
      await sleep(naverDelay)
      if (naver === '429') return json(fail('NEWS429_1', '요청이 많습니다'), 429)
      if (naver === '500') return json(fail(), 500)
      if (naver === 'malformed') return json(wrap('NEWS200_1', { items: null }))
      return json(wrap('NEWS200_1', naverNews(q.get('query') ?? '')))
    }
    if (p === '/api/vectordb/search') {
      await sleep(vectorDelay)
      if (vector === '500') return json(fail(), 500)
      if (vector === 'empty') return json(wrap('VDB200_1', []))
      return json(wrap('VDB200_1', vectorHits(q.get('question') ?? '')))
    }
    if (p === '/api/auth/logout') return json(wrap('AUTH200_2', null))
    if (p === '/api/auth/reissue') return json(fail('AUTH401_4', 'RT 없음'), 401)
    if (p === '/api/members/me' && m === 'GET') return json(wrap('MEMBER200_1', { name: '허광엽', nickname: store.nickname, email: 'test@juby.store', birth: '2002-05-07', socialType: 'GOOGLE', onboarded: true }))
    if (p === '/api/members/me' && m === 'PATCH') return json(wrap('MEMBER200_2', { modifiedDate: '2026-10-29T10:00:00' }))
    if (p === '/api/members/me' && m === 'DELETE') return json(wrap('MEMBER200_5', null))
    if (p === '/api/members/me/personality') {
      await sleep(personalityDelay)
      if (personality === 'none') return json(fail('MEMBER404_2', '성향 없음'), 404)
      if (personality === 'error') return json(fail(), 500)
      return json(wrap('MEMBER200_3', PERSONALITY))
    }
    if (p === '/api/members/me/like-stocks' && m === 'GET') {
      await sleep(likeListDelay)
      likeListCount += 1
      const likeVerdict = typeof likeList === 'function' ? likeList(likeListCount) : likeList
      if (likeVerdict === '500') return json(fail(), 500)
      if (likeVerdict === '401') return json(fail('AUTH401_1', '만료된 토큰'), 401)
      return json(wrap('MEMBER200_4', { baseDate: '2026-10-28', totalCount: 2, likeStockList: [
      { stockCode: '005930', stockName: '삼성전자', closePrice: 71000, fluctuate: 1.2, tradingValue: 1.3e12, likedAt: '2026-10-20T10:00:00' },
      { stockCode: '000660', stockName: 'SK하이닉스', closePrice: 1500000, fluctuate: -0.5, tradingValue: 1.2e12, likedAt: '2026-10-21T10:00:00' } ] }))
    }
    if (p.startsWith('/api/members/me/like-stocks') && m !== 'GET') {
      await sleep(likeWriteDelay)
      if (likeWrite === '500') return json(fail(), 500)
    }
    if (p === '/api/members/me/like-stocks' && m === 'POST') return json(wrap('MEMBER200_6', { stockCode: req.postDataJSON().stockCode, stockName: 'x', liked: true }))
    if (p.startsWith('/api/members/me/like-stocks/') && m === 'DELETE') return json(wrap('MEMBER200_7', null))
    if (p === '/api/personality-tests' && m === 'GET') return json(wrap('PT200_1', QUESTIONS))
    if (p === '/api/personality-tests' && m === 'POST') return json(wrap('PT200_2', { memberId: 1, memberName: '허광엽', personalityId: 3, personalityName: '위험중립형', description: PERSONALITY.description, url: '' }))
    if (p === '/api/backtest/preset/options') {
      await sleep(optionsDelay)
      if (optionsStatus === 401) return json(fail('AUTH401_1', '만료된 토큰'), 401)
      if (optionsStatus === 500) return json(fail(), 500)
      return json(wrap('BT200_2', [1, 2, 3, 4, 5].map((t) => ({ investType: t, periods: optionsPeriods(t).map((period) => ({ period, label: period })) }))))
    }
    if (p === '/api/backtest/preset') {
      await sleep(presetDelay)
      const [code, type, period] = [q.get('stockCode'), Number(q.get('investType')), q.get('period')]
      if (presetMissing(code, type, period)) return json(fail('BACKTEST404_5', '아직 계산되지 않은 프리셋입니다.'), 404)
      return json(wrap('BT200_1', PRESET(code, type, period, zeroReturns)))
    }
    if (p === '/api/backtest/run') {
      const [code, type, period] = [q.get('stockCode'), Number(q.get('investType')), q.get('period')]
      const verdict = run(code, type, period)
      if (verdict === 'ok') return json(wrap('BT200_3', scoring(code, type, true)))
      if (verdict === '500') return json(fail(), 500)
      return json(fail(verdict, '일봉 데이터가 부족합니다.'), 404)
    }
    if (p === '/api/chat-sessions' && m === 'GET') {
      await sleep(sessionsDelay)
      if (sessionsStatus === 500) return json(fail(), 500)
      return json(wrap('CHAT200_2', [...rooms.entries()].sort((a, b) => (a[1].updatedAt < b[1].updatedAt ? 1 : -1)).map(([id, r]) => ({ chatSessionId: id, title: r.title, updatedAt: r.updatedAt }))))
    }
    if (p === '/api/chat-sessions' && m === 'POST') {
      if (createStatus === 500) return json(fail(), 500)
      const id = nextRoom++; rooms.set(id, { title: '새 대화', updatedAt: new Date().toISOString(), messages: [] })
      return json(wrap('CHAT201_1', { chatSessionId: id, title: '새 대화', updatedAt: rooms.get(id).updatedAt }), 201)
    }
    if ((mm = p.match(/^\/api\/chat-sessions\/(\d+)$/))) {
      const id = Number(mm[1]), r = rooms.get(id)
      if (m === 'GET') {
        await sleep(sessionDetailDelay)
        if (sessionDetailStatus === 404) return json(fail('CHAT404_1', '없는 방'), 404)
        if (sessionDetailStatus === 403) return json(fail('CHAT403_1', '남의 방'), 403)
        if (sessionDetailStatus === 500) return json(fail(), 500)
      }
      if (m === 'DELETE' && deleteStatus !== null) return json(deleteStatus === 404 ? fail('CHAT404_1', '없는 방') : fail(), deleteStatus)
      if (m === 'PATCH' && renameStatus !== null) return json(renameStatus === 404 ? fail('CHAT404_1', '없는 방') : fail(), renameStatus)
      if (!r) return json(fail('CHAT404_1', '없는 방'), 404)
      if (m === 'GET') return json(wrap('CHAT200_3', { chatSessionId: id, title: r.title, createdAt: '2026-10-28T10:00:00', messages: r.messages }))
      if (m === 'DELETE') { rooms.delete(id); return json(wrap('CHAT200_5', null)) }
      if (m === 'PATCH') { r.title = req.postDataJSON().title; r.updatedAt = new Date().toISOString(); return json(wrap('CHAT200_4', { chatSessionId: id, title: r.title, updatedAt: r.updatedAt })) }
    }
    if (p === '/api/open-ai/ask') {
      const b = req.postDataJSON(); const r = rooms.get(b.chatSessionId)
      log.asks.push(b)
      askCount += 1
      const verdict = typeof askStatus === 'function' ? askStatus(askCount) : askStatus
      if (!r) return json(fail('CHAT404_1', '없는 방'), 404)
      if (verdict === 'MEMBER404_2') return json(fail('MEMBER404_2', '성향 없음'), 404)
      if (verdict === 'CHAT409_1') return json(fail('CHAT409_1', '앞 답을 만드는 중'), 409)
      if (r.title === '새 대화') r.title = b.question.slice(0, 30)
      r.updatedAt = new Date().toISOString()
      await sleep(askDelay)
      if (verdict === '500') { r.messages.push({ messageId: r.messages.length + 1, role: 'USER', content: b.question, createdAt: new Date().toISOString() }); return json(fail(), 500) }
      const answer = verdict === 'empty' ? '' : ANSWER
      r.messages.push({ messageId: r.messages.length + 1, role: 'USER', content: b.question, createdAt: new Date().toISOString() }, { messageId: r.messages.length + 2, role: 'ASSISTANT', content: answer, createdAt: new Date().toISOString() })
      return json(wrap('OPENAI200_1', { answer, chatSessionId: b.chatSessionId, messageId: 1 }))
    }
    return json(fail('COMMON404_1', '없는 API'), 404)
  })
  return log
}

/**
 * 로그인한 것처럼: 가짜 access token을 심고 시계를 at(기본 2026-10-29(목) 11:00 KST)으로 못박는다.
 * 같은 탭에서는 한 번만 심는다(sessionStorage 표시) — 판정이 토큰을 지운 뒤 새로고침해도 다시 심지 않는다.
 * seed로 localStorage에 다른 값도 넣을 수 있다.
 */
function communityRoute({ m, p, q, req, authed, json, store, now, opts }) {
  const me = authed ? store.nickname : null
  const live = () => store.posts.filter((post) => !post.deleted)
  const summary = (post) => ({
    postId: post.postId, stockCode: post.stockCode, stockName: post.stockName, changeRate: post.changeRate, title: post.title,
    preview: post.content.length > 100 ? post.content.slice(0, 100) + '...' : post.content, writerNickname: post.writerNickname,
    likeCount: post.likeCount, commentCount: post.commentCount, likedByMe: authed && post.likedBy.has('me'), isMine: me !== null && post.writerNickname === me,
    isEdited: post.isEdited, createdAt: kstIso(post.createdAt),
  })
  const detail = (post) => { const { preview, changeRate, ...rest } = summary(post); void preview; void changeRate; return { ...rest, content: post.content, updatedAt: kstIso(post.createdAt) } }
  const comment = (c) => ({ commentId: c.commentId, postId: c.postId, content: c.content, writerNickname: c.writerNickname, likeCount: c.likeCount,
    likedByMe: authed && c.likedBy.has('me'), isMine: me !== null && c.writerNickname === me, isEdited: c.isEdited, createdAt: kstIso(c.createdAt), updatedAt: kstIso(c.createdAt) })
  const body = () => { try { return JSON.parse(req.postData() ?? '{}') ?? {} } catch { return {} } }
  const size = Number(q.get('size') ?? 20)
  const stockCode = q.get('stockCode')
  let mm
  if (opts.communityReadStatus && m === 'GET' && p.startsWith('/api/community/')) return json(fail(), opts.communityReadStatus)
  if (opts.communityStatus && m === 'GET' && (p === '/api/community/stocks' || p.startsWith('/api/community/posts') && !/\d+$/.test(p))) return json(fail(), opts.communityStatus)
  if (p === '/api/community/stocks') {
    const counts = new Map()
    for (const post of live()) if (post.stockCode !== null) counts.set(post.stockCode, (counts.get(post.stockCode) ?? 0) + 1)
    const stocks = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([code, postCount]) => { const s = COMMUNITY_STOCKS.find((x) => x[0] === code); return { stockCode: code, stockName: s[1], postCount, changeRate: s[2] } })
    return json(wrap('COMMUNITY200_11', { totalPostCount: live().length, stocks, priceAsOf: kstIso(now - 3 * 60_000) }))
  }
  if (p === '/api/community/posts' && m === 'GET') {
    const cursor = q.has('cursor') ? Number(q.get('cursor')) : Infinity
    const list = live().filter((post) => (stockCode === null || post.stockCode === stockCode) && post.postId < cursor).sort((a, b) => b.postId - a.postId)
    const page = list.slice(0, size)
    const hasNext = list.length > size
    return json(wrap('COMMUNITY200_1', { posts: page.map(summary), nextCursor: hasNext ? page.at(-1).postId : null, hasNext }))
  }
  if (p === '/api/community/posts/popular') {
    if (q.has('cursorLikeCount') !== q.has('cursorId')) return json(fail('COMMUNITY400_1', '커서'), 400)
    const weekStart = now - 3 * 24 * 3600_000
    let list = live().filter((post) => (stockCode === null || post.stockCode === stockCode) && post.createdAt >= weekStart).sort((a, b) => b.likeCount - a.likeCount || b.postId - a.postId)
    if (q.has('cursorId')) { const lc = Number(q.get('cursorLikeCount')), id = Number(q.get('cursorId')); list = list.filter((post) => post.likeCount < lc || (post.likeCount === lc && post.postId < id)) }
    const page = list.slice(0, size)
    const hasNext = list.length > size
    return json(wrap('COMMUNITY200_10', { posts: page.map(summary), nextCursorLikeCount: hasNext ? page.at(-1).likeCount : null, nextCursorId: hasNext ? page.at(-1).postId : null, hasNext }))
  }
  if (p === '/api/community/posts' && m === 'POST') {
    if (store.nickname === null) return json(fail('COMMUNITY403_1', '닉네임'), 403)
    const b = body()
    if ('stockCode' in b && (b.stockCode === '' || (b.stockCode !== null && !/^\d{6}$/.test(b.stockCode)))) return json(fail('COMMON400_1', '형식'), 400)
    const stock = COMMUNITY_STOCKS.find((x) => x[0] === b.stockCode) ?? null
    if (b.stockCode && stock === null) return json(fail('STOCK404_1', '없는 종목'), 404)
    const post = { postId: store.nextPost++, stockCode: stock?.[0] ?? null, stockName: stock?.[1] ?? null, changeRate: stock?.[2] ?? null, title: b.title, content: b.content,
      writerNickname: store.nickname, likeCount: 0, commentCount: 0, likedBy: new Set(), isEdited: false, createdAt: now, deleted: false }
    store.posts.unshift(post)
    return json(wrap('COMMUNITY201_1', detail(post)))
  }
  if ((mm = p.match(/^\/api\/community\/posts\/(\d+)$/))) {
    const post = live().find((x) => x.postId === Number(mm[1]))
    if (!post) return json(fail('COMMUNITY404_1', '없는 글'), 404)
    if (m === 'GET') return json(wrap('COMMUNITY200_2', detail(post)))
    if (post.writerNickname !== me) return json(fail('COMMUNITY403_2', '남의 글'), 403)
    if (m === 'PATCH') { const b = body(); Object.assign(post, { title: b.title, content: b.content, isEdited: true }); return json(wrap('COMMUNITY200_3', detail(post))) }
    if (m === 'DELETE') { post.deleted = true; return json(wrap('COMMUNITY200_4', null)) }
  }
  if ((mm = p.match(/^\/api\/community\/posts\/(\d+)\/likes$/))) {
    const post = live().find((x) => x.postId === Number(mm[1]))
    if (!post) return json(fail('COMMUNITY404_1', '없는 글'), 404)
    const liked = !post.likedBy.has('me')
    if (liked) post.likedBy.add('me'); else post.likedBy.delete('me')
    post.likeCount += liked ? 1 : -1
    return json(wrap('COMMUNITY200_5', { postId: post.postId, liked, likeCount: post.likeCount }))
  }
  if ((mm = p.match(/^\/api\/community\/posts\/(\d+)\/comments$/))) {
    const post = live().find((x) => x.postId === Number(mm[1]))
    if (!post) return json(fail('COMMUNITY404_1', '없는 글'), 404)
    if (m === 'GET') {
      const cursor = q.has('cursor') ? Number(q.get('cursor')) : 0
      const list = store.comments.filter((c) => !c.deleted && c.postId === post.postId && c.commentId > cursor).sort((a, b) => a.commentId - b.commentId)
      const page = list.slice(0, size)
      const hasNext = list.length > size
      return json(wrap('COMMUNITY200_6', { comments: page.map(comment), nextCursor: hasNext ? page.at(-1).commentId : null, hasNext }))
    }
    if (store.nickname === null) return json(fail('COMMUNITY403_1', '닉네임'), 403)
    const c = { commentId: store.nextComment++, postId: post.postId, content: body().content, writerNickname: store.nickname, likeCount: 0, likedBy: new Set(), isEdited: false, createdAt: now, deleted: false }
    store.comments.push(c)
    post.commentCount += 1
    return json(wrap('COMMUNITY201_2', comment(c)))
  }
  if ((mm = p.match(/^\/api\/community\/comments\/(\d+)(\/likes)?$/))) {
    const c = store.comments.find((x) => !x.deleted && x.commentId === Number(mm[1]))
    if (!c) return json(fail('COMMUNITY404_2', '없는 댓글'), 404)
    if (mm[2]) { const liked = !c.likedBy.has('me'); if (liked) c.likedBy.add('me'); else c.likedBy.delete('me'); c.likeCount += liked ? 1 : -1; return json(wrap('COMMUNITY200_9', { commentId: c.commentId, liked, likeCount: c.likeCount })) }
    if (c.writerNickname !== me) return json(fail('COMMUNITY403_3', '남의 댓글'), 403)
    if (m === 'PATCH') { Object.assign(c, { content: body().content, isEdited: true }); return json(wrap('COMMUNITY200_7', comment(c))) }
    if (m === 'DELETE') { c.deleted = true; const post = store.posts.find((x) => x.postId === c.postId); if (post) post.commentCount -= 1; return json(wrap('COMMUNITY200_8', null)) }
  }
  if (p === '/api/members/nickname/check') {
    const nickname = q.get('nickname') ?? ''
    if (!/^[가-힣a-zA-Z0-9]{2,10}$/.test(nickname)) return json(fail('COMMON400_1', '형식'), 400)
    return json(wrap('MEMBER200_6', { nickname, available: nickname === store.nickname || !(opts.takenNicknames ?? []).includes(nickname) }))
  }
  if (p === '/api/members/me/nickname' && m === 'PATCH') {
    const nickname = body().nickname
    if ((opts.takenNicknames ?? []).includes(nickname)) return json(fail('MEMBER409_2', '중복'), 409)
    store.nickname = nickname
    return json(wrap('MEMBER200_7', { nickname, modifiedAt: kstIso(now) }))
  }
  return json(fail('COMMON404', '없는 경로'), 404)
}

export async function seedLogin(context, loggedIn = true, { at = THU_11, user = 1, seed = null } = {}) {
  await context.addInitScript(({ at, loggedIn, token, seed }) => {
    const offset = at - Date.now(); const realNow = Date.now.bind(Date); Date.now = () => realNow() + offset
    if (sessionStorage.getItem('__seeded') === null) {
      sessionStorage.setItem('__seeded', '1')
      if (loggedIn) { localStorage.setItem('accessToken', token); localStorage.setItem('kisTokenPrimedAt', String(Date.now())) }
      for (const [key, value] of Object.entries(seed ?? {})) localStorage.setItem(key, value)
    }
  }, { at, loggedIn, token: tokenFor(user), seed })
}
