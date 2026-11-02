// 화이트박스 단위 판정 — 저장소의 .ts 원본을 Node가 곧바로 읽는다(register.mjs가 브라우저 전역을 흉내 낸다).
//   cd judge && node --import ./register.mjs unit.test.mjs [--repo DIR]
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const REPO = process.argv.includes('--repo') ? process.argv[process.argv.indexOf('--repo') + 1] : fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const src = (path) => import(`${REPO}/src/${path}`)

// 2026-10-29(목) 11:00 KST = 02:00 UTC
const THU_11 = Date.UTC(2026, 9, 29, 2, 0, 0)
const kst = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h - 9, min)

// textarea 흉내(api/stock stripHtml이 엔티티를 되돌리는 데 쓴다)
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" }
globalThis.document.createElement = () => ({ _v: '', set innerHTML(v) { this._v = v }, get value() { return this._v.replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m]) } })

/* ── utils/date ─────────────────────────────────────────────────────── */
describe('utils/date', async () => {
  const d = await src('utils/date.ts')
  test('toYmd·fromDashedYmd·toDashedYmd', () => {
    assert.equal(d.toYmd(new Date(2026, 7, 5)), '20260805')
    assert.equal(d.toYmd(new Date(Number.NaN)), '')
    assert.equal(d.toYmd('x'), '')
    assert.equal(d.fromDashedYmd('2026-08-05'), '20260805')
    assert.equal(d.fromDashedYmd(null), '')
    assert.equal(d.toDashedYmd('20260805'), '2026-08-05')
    assert.equal(d.toDashedYmd(''), '')
  })
  test('periodStart — 말일 맞춤, 전체는 null, 틀린 날짜는 ""', () => {
    assert.equal(d.periodStart('20260731', 'ONE_MONTH'), '20260630')
    assert.equal(d.periodStart('20280229', 'ONE_YEAR'), '20270228')
    assert.equal(d.periodStart('20261029', 'ONE_WEEK'), '20261022')
    assert.equal(d.periodStart('20260105', 'THREE_MONTH'), '20251005')
    assert.equal(d.periodStart('20261029', 'THREE_YEAR'), '20231029')
    assert.equal(d.periodStart('20261029', 'ALL'), null)
    assert.equal(d.periodStart('', 'ONE_MONTH'), '')
    assert.equal(d.periodStart('2026-10-29', 'ONE_MONTH'), '')
  })
  test('toKoreanDate — 올해는 연도 생략', () => {
    const today = new Date(2026, 9, 29)
    assert.equal(d.toKoreanDate('20261005', today), '10월 5일')
    assert.equal(d.toKoreanDate('20251005', today), '2025년 10월 5일')
    assert.equal(d.toKoreanDate(null, today), '')
    assert.equal(d.toKoreanDate('2026-10-05', today), '')
    assert.equal(d.toKoreanDateWithDay('20261102'), '11월 2일(월)')
  })
  test('toKoreanDateTime·kstNow·weekdayOf·shiftYmd', () => {
    assert.equal(d.toKoreanDateTime(THU_11), '10월 29일 11:00')
    assert.equal(d.toKoreanDateTime(Number.NaN), '')
    assert.deepEqual(d.kstNow(THU_11), { ymd: '20261029', day: 4, minutes: 660 })
    // 자정 직후(KST 00:10)는 UTC 전날 15:10 — 날짜가 KST 기준이어야 한다
    assert.equal(d.kstNow(kst(2026, 10, 30, 0, 10)).ymd, '20261030')
    assert.equal(d.weekdayOf('20261101'), 0)
    assert.equal(Number.isNaN(d.weekdayOf('x')), true)
    assert.equal(d.shiftYmd('20261031', 1), '20261101')
    assert.equal(d.shiftYmd('20260301', -1), '20260228')
    assert.equal(d.shiftYmd('20280301', -1), '20280229')
    assert.equal(d.shiftYmd('20261031', -150), '20260603')
    assert.equal(d.shiftYmd('bad', 1), '')
  })
  test('toKoreanClock — 한국 시각 오전·오후 h:mm', () => {
    assert.equal(d.toKoreanClock(THU_11), '오전 11:00')
    assert.equal(d.toKoreanClock(THU_11 - 64 * 60_000), '오전 9:56')
    assert.equal(d.toKoreanClock(kst(2026, 10, 29, 12, 5)), '오후 12:05')
    assert.equal(d.toKoreanClock(kst(2026, 10, 29, 23, 59)), '오후 11:59')
    assert.equal(d.toKoreanClock(kst(2026, 10, 30, 0, 0)), '오전 12:00')
    assert.equal(d.toKoreanClock(Number.NaN), '')
  })
  test('Date가 담지 못하는 값(1e16)도 던지지 않고 "" — toKoreanClock·toKoreanDateTime·toIsoTime', () => {
    assert.equal(d.toKoreanClock(1e16), '')
    assert.equal(d.toKoreanDateTime(1e16), '')
    assert.equal(d.toIsoTime(THU_11), '2026-10-29T02:00:00.000Z')
    assert.equal(d.toIsoTime(Number.NaN), '')
    assert.equal(d.toIsoTime(1e16), '')
  })
  test('timeAgo', () => {
    const now = THU_11
    assert.equal(d.timeAgo(now - 10_000, now), '방금')
    assert.equal(d.timeAgo(now - 12 * 60_000, now), '12분 전')
    assert.equal(d.timeAgo(now - 3 * 3_600_000, now), '3시간 전')
    assert.equal(d.timeAgo(now - 2 * 86_400_000, now), '2일 전')
    assert.equal(d.timeAgo(now - 7 * 86_400_000, now), '7일 전')
    assert.match(d.timeAgo(now - 8 * 86_400_000, now), /^10월 21일$/)
    assert.equal(d.timeAgo(Number.NaN, now), '')
    assert.equal(d.timeAgo(now + 60_000, now), '방금')
  })
})

/* ── utils/format ───────────────────────────────────────────────────── */
describe('utils/chat — 홈 커뮤니티 말 줄', async () => {
  test('오래된 말이 위, 같은 사람이 같은 분에 이어 말할 때만 묶는다, 첫 글자는 이모지도 온전히', async () => {
    const { toChatRows } = await src('utils/chat.ts')
    const rows = toChatRows([
      { id: 3, author: '가', stock: null, text: 'c', minutesAgo: 2 },
      { id: 1, author: '가', stock: null, text: 'a', minutesAgo: 30 },
      { id: 2, author: '가', stock: '삼성전자', text: 'b', minutesAgo: 30 },
      { id: 4, author: '😀개미', stock: null, text: 'd', minutesAgo: 1 },
    ], THU_11)
    assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4])
    assert.deepEqual(rows.map((r) => r.continued), [false, true, false, false])
    assert.deepEqual(rows.map((r) => r.time), ['오전 10:30', '오전 10:30', '오전 10:58', '오전 10:59'])
    assert.equal(rows[3].initial, '😀')
    assert.equal(rows[1].stock, '삼성전자')
    assert.equal(rows[0].iso, '2026-10-29T01:30:00.000Z')
  })
  test('시각을 지을 수 없는 말도 던지지 않고 시각만 비운다', async () => {
    const { toChatRows } = await src('utils/chat.ts')
    const rows = toChatRows([{ id: 1, author: '가', stock: null, text: 'a', minutesAgo: Number.NaN }], THU_11)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].time, '')
    assert.equal(rows[0].iso, '')
  })
})

describe('utils/format', async () => {
  const f = await src('utils/format.ts')
  test('numberFromText', () => {
    assert.equal(f.numberFromText('0071500'), 71500)
    assert.equal(f.numberFromText('-3.20'), -3.2)
    assert.equal(f.numberFromText(12), 12)
    assert.equal(f.numberFromText(''), null)
    assert.equal(f.numberFromText('  '), null)
    assert.equal(f.numberFromText('abc'), null)
    assert.equal(f.numberFromText(null), null)
    assert.equal(f.numberFromText('1e3'), 1000)
  })
  test('등락률·보합', () => {
    assert.equal(f.isFlatRate(0.004), true)
    assert.equal(f.isFlatRate(-0.004), true)
    assert.equal(f.isFlatRate(0.005), false)
    assert.equal(f.isFlatRate(null), false)
    assert.equal(f.formatChangeRate(1.01), '+1.01%')
    assert.equal(f.formatChangeRate(-2.12), '-2.12%')
    assert.equal(f.formatChangeRate(-0.004), '0.00%')
    assert.equal(f.formatChangeRate(0), '0.00%')
    assert.equal(f.formatChangeRate(undefined), '-')
    assert.equal(f.formatChangeRate(Number.NaN), '-')
  })
  test('가격·거래량·거래대금·지수', () => {
    assert.equal(f.formatPrice(181200), '181,200원')
    assert.equal(f.formatPrice(null), '-')
    assert.equal(f.formatVolume(9999), '9,999주')
    assert.equal(f.formatVolume(12345678), '1,235만주')
    assert.equal(f.formatTradingValue(35_676_835_800), '357억')
    assert.equal(f.formatTradingValue(1_234_567_890_123), '1.2조')
    assert.equal(f.formatTradingValue(12_340_000), '1,234만원')
    assert.equal(f.formatPoint(2612.4), '2,612.40')
    assert.equal(f.formatPointChange(12.31), '+12.31')
    assert.equal(f.formatPointChange(-3.2), '-3.20')
    assert.equal(f.formatPointChange(0.004), '0.00')
    assert.equal(f.formatPointChange(null), '-')
  })
  test('formatBirth', () => {
    assert.equal(f.formatBirth('2002-05-07'), '2002년 05월 07일')
    assert.equal(f.formatBirth('2002-05'), null)
    assert.equal(f.formatBirth(null), null)
  })
})

/* ── utils/backtest ─────────────────────────────────────────────────── */
describe('utils/backtest', async () => {
  const b = await src('utils/backtest.ts')
  test('supportedPeriods — 성향별 최소 기간', () => {
    assert.deepEqual(b.supportedPeriods(1), ['ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'])
    assert.deepEqual(b.supportedPeriods(3), ['SIX_MONTHS', 'ONE_YEAR'])
    assert.deepEqual(b.supportedPeriods(5), ['THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'])
    assert.deepEqual(b.supportedPeriods(9), [])
  })
  test('periodLabel·scoreVerdict 경계·toPercent', () => {
    assert.equal(b.periodLabel('ONE_YEAR'), '1년 (12개월)')
    assert.equal(b.periodLabel('THREE_MONTHS'), '3개월')
    assert.equal(b.periodLabel('NOPE'), '')
    assert.equal(b.scoreVerdict(69.95).tone, 'good')
    assert.equal(b.scoreVerdict(69.94).tone, 'normal')
    assert.equal(b.scoreVerdict(49.95).tone, 'normal')
    assert.equal(b.scoreVerdict(49.94).tone, 'bad')
    assert.equal(b.toPercent(0.1856), '18.56%')
    assert.equal(b.toPercent(null), '-')
    assert.equal(b.toPercent(0), '0.00%')
  })
  test('calculateAxisScores·isHeldToEnd', () => {
    const result = {
      stable: { mdd: 0.05, volatility: 0.4, dVolatility: 0.165 },
      profit: { totalReturn: 0.1, annualReturn: 0.25, avgTradeReturn: null },
      effect: { sharpeRatio: 2, sortinoRatio: 3, calmarRatio: 3 },
      growth: { momentumRatio: 0, volGrowthRatio: 0.5, positionCount: 10 },
    }
    const axes = b.calculateAxisScores(result)
    assert.equal(axes.stable, 62.5) // 100*0.5 + 0*0.25 + 50*0.25
    assert.equal(axes.profit, null) // 하나라도 비면 null
    assert.equal(axes.effect, 100)
    assert.equal(axes.growth, 65) // 50*0.4 + 100*0.3 + 50*0.3
    assert.equal(b.isHeldToEnd({ ...result, growth: { ...result.growth, positionCount: 0 } }), true)
    assert.equal(b.isHeldToEnd({ ...result, stable: { mdd: 0, volatility: 0, dVolatility: 0 }, growth: { ...result.growth, positionCount: 0 } }), false)
    assert.equal(b.isHeldToEnd(result), false)
  })
})

/* ── utils/personality ──────────────────────────────────────────────── */
describe('utils/personality', async () => {
  const p = await src('utils/personality.ts')
  test('scoreToPersonality 경계', () => {
    assert.equal(p.scoreToPersonality(9), null)
    assert.equal(p.scoreToPersonality(10), '안정형')
    assert.equal(p.scoreToPersonality(14), '안정형')
    assert.equal(p.scoreToPersonality(15), '안정추구형')
    assert.equal(p.scoreToPersonality(35), '위험중립형')
    assert.equal(p.scoreToPersonality(55), '적극투자형')
    assert.equal(p.scoreToPersonality(75), '공격투자형')
    assert.equal(p.scoreToPersonality(90), '공격투자형')
    assert.equal(p.scoreToPersonality(91), null)
    assert.equal(p.scoreToPersonality(Number.NaN), null)
  })
  test('normalizeScore — 7문항 예비 문항을 10~90으로', () => {
    const q = Array.from({ length: 7 }, (_, i) => ({ questionId: i, content: '', choices: [1, 3, 5, 7, 9].map((score, j) => ({ choiceId: j, content: '', score })) }))
    assert.equal(p.normalizeScore(7, q), 10)
    assert.equal(p.normalizeScore(63, q), 90)
    assert.equal(p.normalizeScore(35, q), 50)
    assert.equal(p.normalizeScore(5, []), 10)
  })
  test('describePersonality·isPersonalityType', () => {
    assert.equal(p.isPersonalityType('안정형'), true)
    assert.equal(p.isPersonalityType('공격형'), false)
    assert.equal(p.describePersonality('안정형', '  ', ' ').imageUrl, '/personality/stable.svg')
    assert.equal(p.describePersonality('모름', null, null).description, '설명을 불러오지 못했어요.')
    assert.equal(p.describePersonality('모름', null, null).imageUrl, '')
    assert.equal(p.describePersonality('안정형', '서버 글', 'https://x/y.png').description, '서버 글')
  })
})

/* ── utils/treemap ──────────────────────────────────────────────────── */
describe('utils/treemap', async () => {
  const { squarify } = await src('utils/treemap.ts')
  test('넓이 합이 전체와 같고 칸이 밖으로 나가지 않는다', () => {
    const items = [100, 50, 25, 0, null, -3, 10]
    const rects = squarify(items, (v) => v, 400, 300)
    assert.equal(rects.length, items.length)
    const area = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    assert.ok(Math.abs(area - 120_000) < 1e-6, `area=${area}`)
    for (const r of rects) {
      assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.width <= 400 + 1e-6 && r.y + r.height <= 300 + 1e-6, JSON.stringify(r))
      assert.ok(r.width > 0 && r.height > 0)
    }
    // 값 없는 종목도 전체의 4%는 받는다
    const floor = rects.find((r) => r.item === null)
    assert.ok(floor.width * floor.height >= 120_000 * 0.04 * (185 / (185 + 3 * 7.4)) - 1e-6)
  })
  test('빈 목록·0 크기', () => {
    assert.deepEqual(squarify([], (v) => v, 10, 10), [])
    assert.deepEqual(squarify([1], (v) => v, 0, 10), [])
  })
})

/* ── utils/markdownMath·link·sort·stockPreview·social·navigation ────── */
describe('utils 작은 것들', async () => {
  const { normalizeMath } = await src('utils/markdownMath.ts')
  const { safeLink } = await src('utils/link.ts')
  const s = await src('utils/sort.ts')
  const { readPreview, toPreviewState } = await src('utils/stockPreview.ts')
  const { socialLabel } = await src('utils/social.ts')
  const n = await src('utils/navigation.ts')
  test('normalizeMath', () => {
    assert.equal(normalizeMath('수익률은 \\( r = \\frac{a}{b} \\) 이다'), '수익률은 $$r = \\frac{a}{b}$$ 이다')
    assert.equal(normalizeMath('식:\\[ x^2 \\]끝'), '식:\n$$\nx^2\n$$\n끝')
    assert.equal(normalizeMath('\\[참고\\] 글'), '\\[참고\\] 글')
    assert.equal(normalizeMath('$100에서 $120으로'), '$100에서 $120으로')
    assert.equal(normalizeMath('값 $x_1$ 이다'), '값 $$x_1$$ 이다')
    assert.equal(normalizeMath('US$100 이다'), 'US$100 이다')
    assert.equal(normalizeMath('`\\( a \\)` 코드'), '`\\( a \\)` 코드')
    assert.equal(normalizeMath('```\n\\( a \\)\n```'), '```\n\\( a \\)\n```')
  })
  test('safeLink', () => {
    assert.equal(safeLink('https://a.b/c'), 'https://a.b/c')
    assert.equal(safeLink('http://a.b'), 'http://a.b')
    assert.equal(safeLink('javascript:alert(1)'), '')
    assert.equal(safeLink('data:text/html,x'), '')
    assert.equal(safeLink('/relative'), '')
    assert.equal(safeLink(null), '')
  })
  test('sortStocks — 빈 값은 방향과 상관없이 뒤', () => {
    const rows = [
      { stockCode: '1', stockName: '가', closePrice: 10, fluctuate: 1, tradingValue: 5 },
      { stockCode: '2', stockName: '나', closePrice: null, fluctuate: 3, tradingValue: 50 },
      { stockCode: '3', stockName: '', closePrice: 30, fluctuate: undefined, tradingValue: 500 },
    ]
    assert.deepEqual(s.sortStocks(rows, { key: 'closePrice', direction: 'asc' }).map((r) => r.stockCode), ['1', '3', '2'])
    assert.deepEqual(s.sortStocks(rows, { key: 'closePrice', direction: 'desc' }).map((r) => r.stockCode), ['3', '1', '2'])
    assert.deepEqual(s.sortStocks(rows, { key: 'stockName', direction: 'desc' }).map((r) => r.stockCode), ['2', '1', '3'])
    assert.deepEqual(s.sortStocks(rows, { key: 'fluctuate', direction: 'desc' }).map((r) => r.stockCode), ['2', '1', '3'])
    assert.deepEqual(s.nextSort(null, 'closePrice'), { key: 'closePrice', direction: 'desc' })
    assert.deepEqual(s.nextSort({ key: 'closePrice', direction: 'desc' }, 'closePrice'), { key: 'closePrice', direction: 'asc' })
    assert.deepEqual(s.nextSort({ key: 'closePrice', direction: 'desc' }, 'stockName'), { key: 'stockName', direction: 'asc' })
    assert.equal(s.describeSort({ key: 'tradingValue', direction: 'desc' }), '거래대금 많은 순')
  })
  test('sortBy — 주식 모아보기 담은 순(못 읽는 날짜·빈 값은 뒤, 같은 값은 원래 순서)', () => {
    const likes = [
      { code: 'a', likedAt: '2026-10-30T10:00:00' },
      { code: 'b', likedAt: 'not-a-date' },
      { code: 'c', likedAt: '2026-11-01T09:00:00' },
      { code: 'd', likedAt: null },
      { code: 'e', likedAt: '2026-10-30T10:00:00' },
    ]
    const at = (row) => (row.likedAt === null ? null : Date.parse(row.likedAt))
    assert.deepEqual(s.sortBy(likes, at, 'desc').map((r) => r.code), ['c', 'a', 'e', 'b', 'd'])
    assert.deepEqual(s.sortBy(likes, at, 'asc').map((r) => r.code), ['a', 'e', 'c', 'b', 'd'])
    assert.deepEqual(likes.map((r) => r.code), ['a', 'b', 'c', 'd', 'e'])
  })
  test('readPreview — 종목코드·모양·날짜 없는 가격', () => {
    assert.deepEqual(readPreview(toPreviewState({ stockCode: '005930', stockName: '삼성전자', closePrice: 71000, fluctuate: 1.2, baseDate: '20261028' }), '005930'),
      { stockCode: '005930', stockName: '삼성전자', closePrice: 71000, fluctuate: 1.2, baseDate: '20261028' })
    assert.deepEqual(readPreview(toPreviewState({ stockCode: '005930', stockName: '삼성전자', closePrice: 71000 }), '005930'), { stockCode: '005930', stockName: '삼성전자' })
    assert.equal(readPreview(toPreviewState({ stockCode: '005930', stockName: '삼성전자' }), '000660'), null)
    assert.equal(readPreview({ preview: { stockCode: '005930', stockName: ' ' } }, '005930'), null)
    assert.equal(readPreview(null, '005930'), null)
  })
  test('socialLabel', () => {
    assert.equal(socialLabel('KAKAO').name, '카카오')
    assert.equal(socialLabel('toString'), null)
    assert.equal(socialLabel(null), null)
  })
  test('toReturnPath·loginPathFrom', () => {
    assert.equal(n.toReturnPath('/backtest?x=1'), '/backtest?x=1')
    assert.equal(n.toReturnPath('//evil.com'), null)
    assert.equal(n.toReturnPath('https://evil.com/'), null)
    assert.equal(n.toReturnPath('/login'), null)
    assert.equal(n.toReturnPath('/oauth2/callback'), null)
    assert.equal(n.toReturnPath('/.//evil.com'), null)
    assert.equal(n.toReturnPath('/a/..//evil.com'), null)
    assert.equal(n.toReturnPath(null), null)
    assert.equal(n.loginPathFrom('/'), '/login')
    assert.equal(n.loginPathFrom('/login?next=%2Fai'), '/login?next=%2Fai')
    assert.equal(n.loginPathFrom('/backtest'), '/login?next=%2Fbacktest')
    assert.equal(n.loginPathFrom('//evil.com'), '/login')
  })
})

/* ── utils/cache·recentStocks·recentBacktests ───────────────────────── */
describe('localStorage 값', async () => {
  const c = await src('utils/cache.ts')
  const rs = await src('utils/recentStocks.ts')
  const rb = await src('utils/recentBacktests.ts')
  const auth = await src('utils/auth.ts')
  beforeEach(() => localStorage.clear())
  test('readCache — 모양·만료', () => {
    c.writeCache('k', { a: 1 })
    assert.deepEqual(c.readCache('k', 1000), { a: 1 })
    localStorage.setItem('k', JSON.stringify({ savedAt: Date.now() - 5000, value: 1 }))
    assert.equal(c.readCache('k', 1000), null)
    localStorage.setItem('k', JSON.stringify({ value: 1 }))
    assert.equal(c.readCache('k', 1000), null)
    localStorage.setItem('k', '{bad')
    assert.equal(c.readCache('k', 1000), null)
  })
  test('readStamp·readJson', () => {
    assert.equal(c.readStamp('nope'), 0)
    c.writeStamp('t', 123)
    assert.equal(c.readStamp('t'), 123)
    localStorage.setItem('t', 'abc')
    assert.equal(c.readStamp('t'), 0)
    localStorage.setItem('j', '{bad')
    assert.equal(c.readJson('j'), null)
    c.writeJson('j', [1, 2])
    assert.deepEqual(c.readJson('j'), [1, 2])
  })
  test('localStorage를 못 쓰면 메모리로', () => {
    const real = globalThis.localStorage
    globalThis.localStorage = new Proxy({}, { get() { throw new Error('SecurityError') } })
    try {
      c.writeStamp('m', 7)
      assert.equal(c.readStamp('m'), 7)
      c.writeJson('mj', { x: 1 })
      assert.deepEqual(c.readJson('mj'), { x: 1 })
    } finally {
      globalThis.localStorage = real
    }
  })
  test('recentStocks — 중복·상한·모양', () => {
    for (let i = 0; i < 10; i++) rs.rememberStock({ stockCode: String(i).padStart(6, '0'), stockName: `종목${i}` })
    const list = rs.readRecentStocks()
    assert.equal(list.length, 8)
    assert.equal(list[0].stockCode, '000009')
    rs.rememberStock({ stockCode: '000005', stockName: '종목5' })
    assert.equal(rs.readRecentStocks()[0].stockCode, '000005')
    assert.equal(rs.readRecentStocks().length, 8)
    localStorage.setItem('recentStocks', JSON.stringify([{ stockCode: 'abc', stockName: 'x' }, { stockCode: '005930', stockName: ' ' }, { stockCode: '005930', stockName: '삼성전자' }, 7]))
    assert.deepEqual(rs.readRecentStocks(), [{ stockCode: '005930', stockName: '삼성전자' }])
    rs.forgetRecentStocks()
    assert.deepEqual(rs.readRecentStocks(), [])
  })
  // 가짜 JWT(백엔드 JwtUtil 모양 — subject가 회원 번호). 서명은 지은 것
  const jwt = (sub) => { const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b64({ alg: 'HS256' })}.${b64({ sub, typ: 'access', name: '허광엽' })}.sig` }
  test('getAccountId — JWT subject, 아니면 null', () => {
    assert.equal(auth.getAccountId(), null)
    auth.saveTokens(jwt('12'))
    assert.equal(auth.getAccountId(), '12')
    auth.saveTokens('judge-token')
    assert.equal(auth.getAccountId(), null)
    auth.saveTokens('a.b.c')
    assert.equal(auth.getAccountId(), null)
    auth.saveTokens(jwt(''))
    assert.equal(auth.getAccountId(), null)
    auth.clearTokens()
  })
  test('recentBacktests — 같은 조합은 한 줄, 최근 순, 10줄', () => {
    auth.saveTokens(jwt('1'))
    const base = { stockCode: '005930', stockName: '삼성전자', investType: 3, period: 'ONE_YEAR', finalScore: 64 }
    rb.rememberBacktest(base)
    rb.rememberBacktest({ ...base, investType: 1, finalScore: 40 })
    rb.rememberBacktest({ ...base, finalScore: 70 })
    const list = rb.readRecentBacktests()
    assert.equal(list.length, 2)
    assert.equal(list[0].finalScore, 70)
    assert.equal(list[1].investType, 1)
    for (let i = 0; i < 12; i++) rb.rememberBacktest({ ...base, stockCode: String(i).padStart(6, '0') })
    assert.equal(rb.readRecentBacktests().length, 10)
    localStorage.setItem('recentBacktests', JSON.stringify({ owner: '1', rows: [{ ...base, viewedAt: 1, period: 'TWO_YEARS' }, { ...base, viewedAt: 2 }, null] }))
    assert.equal(rb.readRecentBacktests().length, 1)
    rb.forgetRecentBacktests()
    assert.deepEqual(rb.readRecentBacktests(), [])
    auth.clearTokens()
  })
  test('recentBacktests — 계정별: 다른 계정의 줄은 안 보이고, 그 계정이 보면 덮어쓴다. 계정을 모르면 남기지 않는다', () => {
    const base = { stockCode: '005930', stockName: '삼성전자', investType: 3, period: 'ONE_YEAR', finalScore: 64 }
    auth.saveTokens(jwt('1'))
    rb.rememberBacktest(base)
    assert.equal(rb.readRecentBacktests().length, 1)
    // 로그아웃 없이 2번 회원으로(다른 탭·콜백)
    auth.saveTokens(jwt('2'))
    assert.deepEqual(rb.readRecentBacktests(), [])
    // 토큰 만료 뒤 같은 회원이 다시 로그인하면 그대로(2026-10-30 결정)
    auth.clearTokens()
    assert.deepEqual(rb.readRecentBacktests(), [])
    auth.saveTokens(jwt('1'))
    assert.equal(rb.readRecentBacktests().length, 1)
    // 2번 회원이 결과를 보면 1번 회원의 줄은 버린다
    auth.saveTokens(jwt('2'))
    rb.rememberBacktest({ ...base, stockCode: '000660', stockName: 'SK하이닉스' })
    assert.deepEqual(rb.readRecentBacktests().map((r) => r.stockCode), ['000660'])
    auth.saveTokens(jwt('1'))
    assert.deepEqual(rb.readRecentBacktests(), [])
    // 2026-10-31 전의 배열 모양(주인 없음)은 버린다
    localStorage.setItem('recentBacktests', JSON.stringify([{ ...base, viewedAt: 1 }]))
    assert.deepEqual(rb.readRecentBacktests(), [])
    // 계정 번호를 모르는 토큰이면 남기지도 보여 주지도 않는다
    auth.saveTokens('judge-token')
    rb.rememberBacktest(base)
    assert.deepEqual(rb.readRecentBacktests(), [])
    auth.clearTokens()
  })
})

/* ── api/marketCalendar — 장 상태 ───────────────────────────────────── */
describe('api/marketCalendar', async () => {
  const m = await src('api/marketCalendar.ts')
  const days = (list) => localStorage.setItem('marketCalendar', JSON.stringify({ days: list, savedAt: Date.now() }))
  beforeEach(() => localStorage.clear())
  test('받아 둔 게 없으면 주말만 안다', () => {
    assert.deepEqual(m.marketStatus(kst(2026, 11, 1, 12)), { phase: 'dayOff', nextOpen: null }) // 일요일
    assert.equal(m.marketStatus(kst(2026, 10, 29, 12)), null) // 목요일, 모름
    assert.equal(m.isDayOffToday(kst(2026, 10, 31, 12)), true)
    assert.equal(m.isDayOffToday(kst(2026, 10, 29, 12)), false)
  })
  test('받아 둔 휴장일로 장 상태', () => {
    days([{ date: '20261029', open: true }, { date: '20261030', open: false }, { date: '20261031', open: false }, { date: '20261101', open: false }, { date: '20261102', open: true }])
    assert.deepEqual(m.marketStatus(kst(2026, 10, 29, 8, 59)), { phase: 'beforeOpen', nextOpen: '20261029' })
    assert.deepEqual(m.marketStatus(kst(2026, 10, 29, 9, 0)), { phase: 'open', nextOpen: null })
    assert.deepEqual(m.marketStatus(kst(2026, 10, 29, 15, 29)), { phase: 'open', nextOpen: null })
    assert.deepEqual(m.marketStatus(kst(2026, 10, 29, 15, 30)), { phase: 'closed', nextOpen: '20261102' })
    assert.deepEqual(m.marketStatus(kst(2026, 10, 30, 12)), { phase: 'dayOff', nextOpen: '20261102' }) // 금요일 공휴일
    assert.equal(m.isDayOffToday(kst(2026, 10, 30, 12)), true)
  })
  test('모양이 틀린 저장값은 버린다', () => {
    localStorage.setItem('marketCalendar', JSON.stringify({ days: [{ date: '2026-10-29', open: true }], savedAt: 1 }))
    assert.equal(m.marketStatus(kst(2026, 10, 29, 12)), null)
  })
})

/* ── API 계층(fetch 흉내) ───────────────────────────────────────────── */
const calls = []
let responder = () => ({ status: 200, body: { isSuccess: true, code: 'OK', message: '', result: null } })
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init })
  const reply = await responder(String(url), init)
  if (reply instanceof Error) throw reply
  const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)
  return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, text: async () => text, json: async () => JSON.parse(text) }
}
const ok = (result) => ({ status: 200, body: { isSuccess: true, code: 'OK', message: 'ok', result } })
const fail = (status, code, message = '실패') => ({ status, body: { isSuccess: false, code, message, result: null } })
const timeout = () => new DOMException('timed out', 'TimeoutError')

describe('api/client', async () => {
  const client = await src('api/client.ts')
  const auth = await src('utils/auth.ts')
  const nav = await src('utils/navigation.ts')
  const moved = []
  nav.setNavigator((path) => moved.push(path))
  beforeEach(() => { calls.length = 0; moved.length = 0; localStorage.clear(); auth.clearTokens() })

  test('래퍼를 벗기고, 실패 코드는 ApiError', async () => {
    responder = () => ok({ a: 1 })
    assert.deepEqual(await client.get('/api/x'), { a: 1 })
    responder = () => fail(404, 'STOCK404_1', '없는 종목')
    await assert.rejects(client.get('/api/x'), (e) => e instanceof client.ApiError && e.status === 404 && e.code === 'STOCK404_1' && e.message === '없는 종목')
    responder = () => ({ status: 200, body: { isSuccess: false, code: 'BACKTEST404_5', message: '없음', result: null } })
    await assert.rejects(client.get('/api/x'), (e) => e instanceof client.ApiError && e.code === 'BACKTEST404_5' && e.status === 200)
  })
  test('JSON이 아닌 본문·래퍼 없는 본문', async () => {
    responder = () => ({ status: 502, body: '<html>bad gateway</html>' })
    await assert.rejects(client.get('/api/x'), /요청 실패 \(502\)/)
    responder = () => ({ status: 200, body: '<html>' })
    await assert.rejects(client.get('/api/x'), /응답을 읽을 수 없습니다 \(200\)/)
    responder = () => ({ status: 200, body: { foo: 1 } })
    await assert.rejects(client.get('/api/x'), (e) => e instanceof client.ApiError && e.code === null && e.status === 200)
    responder = () => ({ status: 200, body: '' })
    await assert.rejects(client.get('/api/x'), (e) => e instanceof client.ApiError && e.code === null)
  })
  test('토큰 없는 401은 로그인으로 보내지 않는다', async () => {
    responder = () => fail(401, 'COMMON401_1')
    await assert.rejects(client.get('/api/members/me'), (e) => e.status === 401)
    assert.deepEqual(moved, [])
    assert.equal(calls.length, 1)
  })
  test('토큰 있는 401은 재발급 한 번 → 실패면 토큰 지우고 /login?next=', async () => {
    auth.saveTokens('old-token')
    globalThis.location = new URL('https://juby.example.test/backtest?x=1')
    responder = (url) => (url.includes('/api/auth/reissue') ? fail(401, 'AUTH401_2') : fail(401, 'AUTH401_1'))
    await assert.rejects(client.get('/api/members/me'), (e) => e.status === 401)
    const reissue = calls.find((c) => c.url.includes('/api/auth/reissue'))
    assert.ok(reissue, '재발급을 보낸다')
    assert.equal(reissue.url, 'https://api.example.test/api/auth/reissue')
    assert.equal(reissue.init.credentials, 'include')
    assert.equal(auth.isLoggedIn(), false)
    assert.deepEqual(moved, ['/login?next=%2Fbacktest%3Fx%3D1'])
    globalThis.location = new URL('https://juby.example.test/')
  })
  test('재발급이 되면 같은 요청을 새 토큰으로 한 번 더', async () => {
    auth.saveTokens('old-token')
    responder = (url, init) => {
      if (url.includes('/api/auth/reissue')) return ok({ accessToken: 'new-token' })
      return init.headers.Authorization === 'Bearer new-token' ? ok('fresh') : fail(401, 'AUTH401_1')
    }
    assert.equal(await client.get('/api/members/me'), 'fresh')
    assert.equal(auth.getAccessToken(), 'new-token')
    assert.deepEqual(moved, [])
    assert.equal(calls.length, 3)
  })
  test('ignoreUnauthorized — 재발급은 하되 로그인으로 보내지 않는다', async () => {
    auth.saveTokens('old-token')
    responder = (url) => (url.includes('/api/auth/reissue') ? fail(401, 'AUTH401_2') : fail(401, 'AUTH401_1'))
    await assert.rejects(client.get('/api/members/me/personality', { ignoreUnauthorized: true }), (e) => e.status === 401)
    assert.deepEqual(moved, [])
    assert.equal(auth.isLoggedIn(), true, '토큰은 부르는 쪽이 지운다')
  })
})

describe('api/kisMarket·member·stock — 응답 모양 거르기', async () => {
  const kis = await src('api/kisMarket.ts')
  const member = await src('api/member.ts')
  const stock = await src('api/news.ts')
  const auth = await src('utils/auth.ts')
  beforeEach(() => { calls.length = 0; localStorage.clear(); auth.saveTokens('tok') })

  test('getVolumeRank — 문자열 숫자, 순위 정렬, 빈 줄 제외, 1분 메모', async () => {
    responder = () => ok([
      { hts_kor_isnm: 'SK하이닉스', data_rank: '2', stck_prpr: '1500000', avrg_tr_pbmn: '99' },
      { hts_kor_isnm: '삼성전자', data_rank: 1, stck_prpr: '0071500', avrg_tr_pbmn: null },
      { hts_kor_isnm: '', data_rank: '3' }, null, { hts_kor_isnm: '이름만' },
    ])
    const got = await kis.getVolumeRank()
    assert.deepEqual(got.items, [
      { rank: 1, stockName: '삼성전자', price: 71500, averageTradingValue: null },
      { rank: 2, stockName: 'SK하이닉스', price: 1500000, averageTradingValue: 99 },
    ])
    const n = calls.length
    await kis.getVolumeRank()
    assert.equal(calls.length, n, '1분 안에는 다시 묻지 않는다')
    responder = () => ok({ not: 'array' })
  })
  test('getBackupCandles — 0원 봉·틀린 날짜 제외, 중복 날짜 하나, 오름차순, 기간 150일', async () => {
    responder = () => ok([
      { stck_bsop_date: '20261029', stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '105', acml_vol: '10' },
      { stck_bsop_date: '20261028', stck_oprc: '0', stck_hgpr: '0', stck_lwpr: '0', stck_clpr: '0', acml_vol: '0' },
      { stck_bsop_date: '2026-10-27', stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '105' },
      { stck_bsop_date: '20261026', stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '101' },
      { stck_bsop_date: '20261026', stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '102' },
      { stck_bsop_date: '20261023', stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: null },
    ])
    const candles = await kis.getBackupCandles('005930')
    assert.deepEqual(candles.map((c) => [c.date, c.close, c.volume]), [['20261026', 102, null], ['20261029', 105, 10]])
    const url = new URL(calls.at(-1).url, 'https://x')
    assert.equal(url.pathname, '/api/market/005930/daily_itemchartprice')
    const { ymd } = (await src('utils/date.ts')).kstNow()
    assert.equal(url.searchParams.get('endDate'), ymd)
    assert.equal(url.searchParams.get('startDate'), (await src('utils/date.ts')).shiftYmd(ymd, -150))
  })
  test('getLikeStocks — 틀린 종목코드 제외, totalCount 보정, 모양 틀리면 던진다', async () => {
    responder = () => ok({ baseDate: '2026-10-28', totalCount: null, likeStockList: [
      { stockCode: '005930', stockName: null, closePrice: 71000, fluctuate: '1.2', tradingValue: 1, likedAt: '2026-10-01T00:00:00' },
      { stockCode: 'abc', stockName: 'x' }, null,
    ] })
    const list = await member.getLikeStocks()
    assert.equal(list.totalCount, 1)
    assert.equal(list.baseDate, '20261028')
    assert.deepEqual(list.likeStockList, [{ stockCode: '005930', stockName: '005930', closePrice: 71000, fluctuate: null, tradingValue: 1, likedAt: '2026-10-01T00:00:00', likedDate: '20261001' }])
    responder = () => ok({ likeStockList: null })
    await assert.rejects(member.getLikeStocks(), /서버 응답을 읽을 수 없습니다/)
  })
  test('getMemberInfo — 이름·이메일이 비면 "", 생일 비면 null, 모르는 가입 경로는 null', async () => {
    responder = () => ok({ name: null, email: 'a@b.c', birth: '', socialType: 'APPLE', onboarded: true })
    assert.deepEqual(await member.getMemberInfo(), { name: '', email: 'a@b.c', birth: null, socialType: null })
    responder = () => ok({ name: '허광엽', email: 'a@b.c', birth: '2002-05-07', socialType: 'KAKAO' })
    assert.deepEqual(await member.getMemberInfo(), { name: '허광엽', email: 'a@b.c', birth: '2002-05-07', socialType: 'KAKAO' })
    responder = () => ok(null)
    await assert.rejects(member.getMemberInfo(), /서버 응답을 읽을 수 없습니다/)
  })
  test('getMyPersonality — MEMBER404_2만 null', async () => {
    responder = () => fail(404, 'MEMBER404_2')
    assert.equal(await member.getMyPersonality(), null)
    responder = () => ok({ investPersonality: '', description: 'x', personalityImg: null })
    assert.equal(await member.getMyPersonality(), null)
    responder = () => fail(500, 'COMMON500_1')
    await assert.rejects(member.getMyPersonality(), (e) => e.status === 500)
  })
  test('getStockNews — 제목·링크 없는 기사 제외, receivedCount는 거르기 전', async () => {
    responder = () => ok({ newsList: [
      { title: '<b>제목</b> &amp; 글', description: 'd', originalLink: 'https://news.example.com/a', publishedAt: '2026-10-27T10:00:00', timeAgo: '3시간 전' },
      { title: '', originalLink: 'https://x/y' }, { title: 'js', originalLink: 'javascript:alert(1)' }, { title: 'rel', originalLink: '/x' },
    ], totalCount: '12', page: 0 })
    const page = await stock.getStockNews('005930', 'LATEST', 0)
    assert.equal(page.items.length, 1)
    assert.equal(page.items[0].title, '제목 & 글')
    assert.equal(page.items[0].source, 'news.example.com')
    assert.equal(page.receivedCount, 4)
    assert.equal(page.totalCount, null)
    assert.equal(page.page, 0)
  })
  test('searchNews — 같은 링크 하나, 새 기사부터, 날짜 못 읽은 것은 뒤', async () => {
    responder = () => ok({ items: [
      { title: '옛', originallink: 'https://n/1', pubDate: 'Mon, 20 Oct 2026 10:00:00 +0900' },
      { title: '새', originallink: 'https://n/2', pubDate: 'Wed, 29 Oct 2026 10:00:00 +0900' },
      { title: '중복', originallink: 'https://n/2', pubDate: 'Wed, 29 Oct 2026 10:00:00 +0900' },
      { title: '날짜 모름', originallink: 'https://n/3', pubDate: 'x' }, null, { title: '', originallink: 'https://n/4' },
    ] })
    const items = await stock.searchNews(' 삼성전자 ')
    assert.deepEqual(items.map((i) => i.title), ['새', '옛', '날짜 모름'])
    assert.ok(calls.at(-1).url.endsWith('/api/news?query=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90'))
  })
  test('askStockNews', async () => {
    responder = () => ok([{ title: 'a', originalLink: 'https://n/a', pubDate: 'Mon, 11 Aug 2026 14:32:00 +0900' }, { title: 'b', originalLink: '' }])
    const hits = await stock.askStockNews('삼성전자', ' 왜 올랐어? ')
    assert.equal(hits.length, 1)
    const url = new URL(calls.at(-1).url, 'https://x')
    assert.equal(url.searchParams.get('question'), '왜 올랐어?')
    assert.equal(url.searchParams.get('stockName'), '삼성전자')
  })
})

describe('api/client — 끊기 신호', async () => {
  const client = await src('api/client.ts')
  beforeEach(() => { calls.length = 0 })
  test('부르는 쪽이 끊으면 "요청을 끊었습니다"이고 차단기에 세지 않는다', async () => {
    responder = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const controller = new AbortController()
    const pending = client.get('/api/open-ai/ask', { timeoutMs: null, signal: controller.signal })
    controller.abort()
    await assert.rejects(pending, /요청을 끊었습니다/)
    controller.abort()
    const again = new AbortController()
    const pending2 = client.get('/api/open-ai/ask', { timeoutMs: null, signal: again.signal })
    again.abort()
    await assert.rejects(pending2, /요청을 끊었습니다/)
    responder = () => ok('alive')
    assert.equal(await client.get('/api/x'), 'alive', '두 번 끊어도 차단기는 걸리지 않는다')
  })
  test('제한 시간과 끊기 신호를 같이 주면 둘 중 먼저 오는 쪽', async () => {
    responder = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason instanceof DOMException ? init.signal.reason : new DOMException('x', 'AbortError'))))
    const controller = new AbortController()
    const pending = client.get('/api/x', { timeoutMs: 50, signal: controller.signal, countsTowardBreaker: false })
    await assert.rejects(pending, /응답 없음 \(50ms 초과\)/)
    const c2 = new AbortController()
    const pending2 = client.get('/api/x', { timeoutMs: 5000, signal: c2.signal })
    c2.abort()
    await assert.rejects(pending2, /요청을 끊었습니다/)
    responder = () => ok(1)
  })
})

describe('api/personality — 예비 문항 결과는 저장하지 않는다', async () => {
  const p = await src('api/personality.ts')
  const auth = await src('utils/auth.ts')
  const seven = Array.from({ length: 7 }, (_, i) => ({ questionId: i + 1, content: '', choices: [1, 3, 5, 7, 9].map((score, j) => ({ choiceId: (i + 1) * 10 + j, content: '', score })) }))
  beforeEach(() => { calls.length = 0; auth.saveTokens('tok') })
  test('로그인했어도 fallbackReason이 있으면 POST 없이 로컬 채점', async () => {
    const result = await p.submitTest(seven, [9, 9, 9, 9, 9, 9, 9], 'login')
    assert.equal(result.type, '공격투자형')
    assert.equal(calls.length, 0)
  })
  test('서버 문항이고 로그인이면 낱개 점수를 POST', async () => {
    responder = () => ok({ personalityName: '위험중립형', description: '', url: '' })
    const ten = Array.from({ length: 10 }, (_, i) => ({ questionId: i + 1, content: '', choices: [1, 3, 5, 7, 9].map((score, j) => ({ choiceId: (i + 1) * 10 + j, content: '', score })) }))
    const result = await p.submitTest(ten, [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], null)
    assert.equal(result.type, '위험중립형')
    assert.equal(calls.length, 1)
    assert.deepEqual(JSON.parse(calls[0].init.body), { scores: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] })
  })
  test('비로그인은 늘 로컬 채점', async () => {
    auth.clearTokens()
    const result = await p.submitTest(seven, [1, 1, 1, 1, 1, 1, 1], null)
    assert.equal(result.type, '안정형')
    assert.equal(calls.length, 0)
  })
})

/* ── 차단기는 맨 끝 — 걸리면 15초 동안 모든 요청이 막힌다 ── */
describe('api/client 차단기', async () => {
  const client = await src('api/client.ts')
  const auth = await src('utils/auth.ts')
  beforeEach(() => { calls.length = 0; auth.clearTokens() })
  test('시간 초과는 Error, 두 번 연달아면 차단기 — countsTowardBreaker:false는 세지 않는다', async () => {
    responder = () => timeout()
    await assert.rejects(client.get('/api/a', { countsTowardBreaker: false }), /응답 없음/)
    await assert.rejects(client.get('/api/a', { countsTowardBreaker: false }), /응답 없음/)
    responder = () => ok(1)
    assert.equal(await client.get('/api/a'), 1, '차단기가 걸리지 않았다')
    responder = () => timeout()
    await assert.rejects(client.get('/api/a'), /응답 없음/)
    await assert.rejects(client.get('/api/a'), /응답 없음/)
    responder = () => ok(1)
    const before = calls.length
    await assert.rejects(client.get('/api/a'), /서버 무응답 상태/)
    assert.equal(calls.length, before, '보내지 않는다')
  })
})
