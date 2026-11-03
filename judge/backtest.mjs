// 백테스트 즉석 실행(/api/backtest/run) 연결 판정(2026-10-29). /api는 전부 가짜(mock.mjs). 실제 응답이 섞이면 "!! 실제 응답"을 찍는다.
// node backtest.mjs <BASE>
import { chromium } from 'playwright'
import { mock, seedLogin } from './mock.mjs'

const BASE = process.argv[2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const report = (id, ok, msg) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`)
const browser = await chromium.launch({ channel: 'chrome' })

async function run(opts, period) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await seedLogin(context)
  const log = await mock(context, opts)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.headers()['x-vercel-id']) console.log('!! 실제 응답:', u.pathname) })
  await page.goto(BASE + '/backtest', { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await page.locator('#backtest-stock').fill('삼성전자')
  await page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
  await sleep(300)
  await page.locator('#backtest-period').selectOption(period)
  await sleep(200)
  await page.locator('[class*="submit"]').first().click()
  await sleep(1500)
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  const runs = log.filter((l) => l.startsWith('GET /api/backtest/run'))
  const presets = log.filter((l) => l.startsWith('GET /api/backtest/preset?'))
  const ranks = await page.locator('[class*="rankScore"]').allInnerTexts()
  const score = await page.locator('[class*="score"]').filter({ hasNotText: /적합도|점/ }).first().innerText().catch(() => '')
  const meta = await page.locator('[class*="meta"]').first().innerText().catch(() => '')
  await context.close()
  return { text, runs, presets, ranks, score, meta, errors }
}

// B1 프리셋이 다 있으면 즉석 실행을 부르지 않는다
{
  const r = await run({}, 'ONE_YEAR')
  report('B1-a', r.runs.length === 0 && r.presets.length === 5, `프리셋 ${r.presets.length}건(기대 5: 고른 조합 = 비교 5건 중 하나), 즉석 실행 ${r.runs.length}건(기대 0)`)
  report('B1-b', /2025년 10월 28일 ~ 10월 28일 일봉 기준 · 매일 새벽 4시/.test(r.meta), `바닥 글 "${r.meta}"`)
  report('B1-c', r.ranks.length === 5 && !/불러오지 못했어요/.test(r.text), `순위 ${r.ranks.length}개, 못 받음 안내 ${/불러오지 못했어요/.test(r.text)}`)
  report('B1-d', r.errors.length === 0, `페이지 예외 ${JSON.stringify(r.errors)}`)
}

// B2 고른 조합의 프리셋이 없으면(404_5) 같은 조건으로 즉석 실행해 그 결과를 보여 준다
{
  const r = await run({ presetMissing: (c, t, p) => t === 3 && p === 'ONE_YEAR' }, 'ONE_YEAR')
  const query = r.runs[0]?.split('?')[1] ?? ''
  report('B2-a', r.runs.length === 1 && query === 'stockCode=005930&investType=3&period=ONE_YEAR', `즉석 실행 ${r.runs.length}건, 조건 "${query}"`)
  report('B2-b', /66\.6/.test(r.text) && /지금 바로 계산했어요/.test(r.meta) && /1년/.test(r.meta), `점수 66.6 보임 ${/66\.6/.test(r.text)}, 바닥 글 "${r.meta}"`)
  report('B2-c', r.ranks.length === 5 && r.ranks.includes('66.6') && !/불러오지 못했어요/.test(r.text), `순위 ${JSON.stringify(r.ranks)} (즉석 결과가 비교에도 쓰임)`)
  report('B2-d', r.errors.length === 0, `페이지 예외 ${JSON.stringify(r.errors)}`)
}

// B3 즉석 실행이 일봉 부족(404_6)으로 거절하면 더 짧은 기간을 권한다
{
  const r = await run({ presetMissing: (c, t, p) => t === 3 && p === 'SIX_MONTHS', run: () => 'BACKTEST404_6' }, 'SIX_MONTHS')
  report('B3-a', r.runs.length === 1 && /그 기간을 계산할 일봉이 모자라요/.test(r.text) && /더 짧은 기간을 골라 주세요/.test(r.text), `즉석 실행 ${r.runs.length}건, 안내 보임 ${/일봉이 모자라요/.test(r.text)}`)
  report('B3-b', !/아직 계산되지 않은 조합/.test(r.text) && r.errors.length === 0, `옛 안내(아직 계산되지 않은 조합) ${/아직 계산되지 않은 조합/.test(r.text)}, 예외 ${r.errors.length}`)
}

// B4 비교 5건 중 둘이 404_5: 하나는 즉석 실행으로 채우고, 하나는 즉석 실행도 실패(404_6) → 4개로 순위 + "1개 전략은 불러오지 못했어요"
{
  const r = await run({ presetMissing: (c, t, p) => (t === 2 || t === 4) && p === 'ONE_YEAR', run: (c, t) => (t === 2 ? 'ok' : 'BACKTEST404_6') }, 'SIX_MONTHS')
  report('B4-a', r.runs.length === 2, `즉석 실행 ${r.runs.length}건(기대 2)`)
  report('B4-b', r.ranks.length === 4 && r.ranks.includes('66.6') && /1개 전략은 불러오지 못했어요/.test(r.text), `순위 ${JSON.stringify(r.ranks)}, 안내 ${/1개 전략은 불러오지 못했어요/.test(r.text)}`)
  report('B4-c', /2025년 10월 28일 ~ 10월 28일/.test(r.meta) && r.errors.length === 0, `고른 조합(프리셋) 바닥 글 "${r.meta}", 예외 ${r.errors.length}`)
}

// B5 비교 5건이 전부 일봉 부족이면 "1년치 일봉이 모자라 비교할 수 없어요"
{
  const r = await run({ presetMissing: (c, t, p) => p === 'ONE_YEAR', run: () => 'BACKTEST404_6' }, 'SIX_MONTHS')
  report('B5-a', r.runs.length === 5 && r.ranks.length === 0 && /1년치 일봉이 모자라 비교할 수 없어요/.test(r.text), `즉석 실행 ${r.runs.length}건, 순위 ${r.ranks.length}개, 안내 ${/1년치 일봉이 모자라/.test(r.text)}`)
  report('B5-b', /적합도/.test(r.text) && r.errors.length === 0, `고른 조합 결과는 보임 ${/적합도/.test(r.text)}, 예외 ${r.errors.length}`)
}

// B6 즉석 실행이 서버 오류(500)면 일반 안내 + 비교는 "불러오지 못했어요"
{
  const r = await run({ presetMissing: (c, t, p) => p === 'ONE_YEAR', run: () => '500' }, 'ONE_YEAR')
  report('B6', /결과를 불러오지 못했어요/.test(r.text) && /잠시 후 다시 시도/.test(r.text) && r.errors.length === 0, `안내 ${/결과를 불러오지 못했어요/.test(r.text)}, 예외 ${r.errors.length}`)
}

// B7 왼쪽 날개 진행 단계: 고르지 않은 단계는 "미완성"(2026-11-03 사용자 — 그 전엔 "아직"), 종목을 고르면 그 줄이 종목 이름이 된다
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await seedLogin(context)
  await mock(context, {})
  const page = await context.newPage()
  await page.goto(BASE + '/backtest', { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  const values = () => page.$$eval('nav[aria-label="백테스트 단계"] li a', (as) => as.map((a) => a.lastElementChild?.textContent.trim() ?? ''))
  const before = await values()
  await page.locator('#backtest-stock').fill('삼성전자')
  await page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
  await sleep(300)
  const after = await values()
  const rail = await page.locator('nav[aria-label="백테스트 단계"]').innerText()
  report('B7', before.length === 4 && before[0] === '미완성' && before[3] === '미완성' && after[0] === '삼성전자' && !/아직/.test(rail),
    `고르기 전 ${JSON.stringify(before)}, 종목 고른 뒤 ${JSON.stringify(after)}, 날개에 "아직" ${/아직/.test(rail)}`)
  await context.close()
}

await browser.close()
console.log(out.join('\n'))
console.log(`backtest PASS ${out.filter((l) => l.startsWith('PASS')).length} FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`)
