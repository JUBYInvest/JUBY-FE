// 디자인 재정비 화면별 판정(결과 보고서 1절 H-1~5, S-1~4, L-1~4). /api는 전부 가짜(mock.mjs).
// S-1·S-3·S-4·L-2는 그 뒤 바뀐 것(M-8 한 판·휴장일·관심종목 뉴스)에 맞춰 2026-10-31에 기대값을 고쳤다.
// H-1·H-4는 커뮤니티가 채팅이 되어(2026-11-02) 글 5개 대신 대화창·입력칸, 말마다 "예시 글" 대신 칸의 "예시" 표시를 본다.
// node feature.mjs <BASE> [--repo DIR]
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { mock, seedLogin, candles } from './mock.mjs'

const args = process.argv.slice(2)
const BASE = args[0]
const REPO = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const report = (id, ok, msg) => { const line = `${ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`; out.push(line); console.log(line) }
const browser = await chromium.launch({ channel: 'chrome' })
async function open(path, { width = 1440, height = 900, login = true, opts = {}, wait = 1800 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } })
  await seedLogin(context, login)
  const log = await mock(context, opts)
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await sleep(wait)
  await page.evaluate(() => document.fonts.ready)
  return { context, page, log: log.filter((l) => !l.startsWith('BLOCKED')), raw: log }
}
/** 첫 화면(지수 띠 위)에 다 들어온 요소 수 */
const inView = (page, sel) => page.evaluate((sel) => {
  const bar = document.querySelector('aside[aria-label="국내 지수"]')
  const limit = innerHeight - (bar ? bar.getBoundingClientRect().height : 0)
  return [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= limit + 0.5 }).length
}, sel)

/* ── 홈 ── */
{
  const { context, page } = await open('/', { width: 1920, height: 1080 })
  const h1 = {
    search: await inView(page, 'input[role="combobox"]'),
    themes: await inView(page, '[class*="_cards_"] > a'),
    rows: await inView(page, '[class*="_body_"] > li'),
    steps: await inView(page, '[class*="_steps_"] li'),
    // 커뮤니티는 2026-11-02부터 채팅이다(글 5개 → 대화창 + 입력칸). 말 하나하나는 community.mjs가 본다
    chat: await inView(page, '[aria-labelledby="home-community-title"] [role="log"]'),
    composer: await inView(page, '#home-community-input'),
  }
  report('H-1', h1.search === 1 && h1.themes === 3 && h1.rows >= 6 && h1.steps === 4 && h1.chat === 1 && h1.composer === 1, `1920×1080 첫 화면 — 검색 ${h1.search}, 테마 ${h1.themes}, 시세표 ${h1.rows}행, 사용설명서 ${h1.steps}단계, 커뮤니티 대화창 ${h1.chat}·입력칸 ${h1.composer}`)
  const h2 = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[class*="_cards_"] > a')]
    const boxed = cards.filter((c) => { const cs = getComputedStyle(c); return cs.boxShadow !== 'none' || ['Top', 'Right', 'Bottom'].every((s) => parseFloat(cs[`border${s}Width`]) > 0) })
    return { n: cards.length, boxed: boxed.length, year: cards.filter((c) => /1년 전보다\s*[+-]?\d/.test(c.textContent)).length, big: cards.filter((c) => [...c.querySelectorAll('*')].some((e) => parseFloat(getComputedStyle(e).fontSize) >= 28)).length }
  })
  report('H-2', h2.n === 3 && h2.boxed === 0 && h2.year === 3 && h2.big === 0, `테마 칸 ${h2.n}, 상자(그림자·세 변 테두리) ${h2.boxed}, "1년 전보다 ±x%" ${h2.year}, 28px 넘는 큰 숫자 ${h2.big}`)
  const ranks = await page.locator('[class*="_rank_"]').allTextContents()
  await page.getByRole('button', { name: '등락률 기준 정렬' }).click()
  await sleep(300)
  const firstRate = await page.locator('[class*="_body_"] > li').first().locator('span').nth(4).textContent()
  report('H-3', ranks.length >= 13 && ranks.slice(0, 3).join(',') === '1,2,3' && /^\+2\.10%$/.test(firstRate?.trim() ?? ''), `순번 ${ranks.length}개(${ranks.slice(0, 3)}), 등락률 정렬 뒤 첫 줄 ${firstRate?.trim()}`)
  // 채팅이 된 뒤(2026-11-02)로는 말마다가 아니라 칸 제목 옆 "예시"와 칸 아래 안내 한 줄로 밝힌다
  const community = page.locator('section[aria-labelledby="home-community-title"]')
  const samples = (await community.getByText('예시', { exact: true }).count()) + (await community.getByText(/지금 보이는 대화는 예시/).count())
  const files = []
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p) } }
  walk(join(REPO, 'src'))
  const holders = (needle) => files.filter((f) => readFileSync(f, 'utf8').includes(needle)).map((f) => f.replace(REPO + '/', ''))
  const postFiles = holders('주린이공부중'), stepFiles = holders('10문항으로 나에게 맞는 전략을')
  report('H-4', samples === 2 && postFiles.join() === 'src/content/communityPreview.ts' && stepFiles.join() === 'src/content/homeGuide.ts', `"예시" 표시(칸 제목·안내) ${samples}, 대화가 있는 파일 — 커뮤니티 ${JSON.stringify(postFiles)}, 사용설명서 단계 ${JSON.stringify(stepFiles)}`)
  const width = await page.evaluate(() => { const m = document.querySelector('main'); const cs = getComputedStyle(m); return m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) })
  report('H-5', Math.round(width) === 1680, `1920 본문 폭 ${Math.round(width)}px(좌우 빈자리 각 ${Math.round((1920 - width) / 2)}px)`)
  await context.close()
}

/* ── 종목 상세 ── */
{
  const plotH = []
  for (const [w, h] of [[1920, 1080], [1440, 900]]) {
    const { context, page } = await open('/stocks/005930', { width: w, height: h, wait: 2200 })
    // M-8(2026-10-30)부터 넓은 화면의 차트는 정보 열과 아래 끝을 맞춰 늘어난다(최소 260px) — 높이 상한 대신 끝맞춤을 잰다
    plotH.push(await page.evaluate(() => { const plot = document.querySelector('[class*="_plot_"]')?.getBoundingClientRect(), info = document.querySelector('[class*="_info_"]')?.getBoundingClientRect(), chart = document.querySelector('[class*="_chartColumn_"]')?.getBoundingClientRect()
      return plot && info && chart ? { h: Math.round(plot.height), gap: Math.round(chart.bottom - info.bottom) } : { h: -1, gap: null } }))
    if (w === 1920) {
      const s2 = { info: await inView(page, 'h1'), price: await inView(page, '[class*="_priceNumber_"]'), acts: await inView(page, '[class*="_actionPanel_"] a'), chart: await inView(page, '[class*="_chartBox_"]'), news: await inView(page, '[class*="_newsColumn_"] li') }
      report('S-2', s2.info === 1 && s2.price === 1 && s2.acts === 2 && s2.chart === 1 && s2.news === 5, `1920×1080 첫 화면 — 이름 ${s2.info}, 큰 가격 ${s2.price}, 바로 가기 ${s2.acts}, 차트 ${s2.chart}, 뉴스 ${s2.news}건`)
      // S-3 손으로 계산: 판정용 일봉(mock.candles)에 기간 탭과 같은 규칙(1주 7일 전, 달·해는 말일 맞춤)
      const all = candles('005930').map((c) => ({ ...c, d: c.date.replaceAll('-', '') }))
      const last = all.at(-1)
      const ymd = (dt) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`
      const base = new Date(+last.d.slice(0, 4), +last.d.slice(4, 6) - 1, +last.d.slice(6, 8))
      const minusMonths = (dt, m) => { const y = dt.getFullYear(), mo = dt.getMonth() - m; return new Date(y, mo, Math.min(dt.getDate(), new Date(y, mo + 1, 0).getDate())) }
      const starts = [ymd(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 7)), ymd(minusMonths(base, 1)), ymd(minusMonths(base, 3)), ymd(minusMonths(base, 6)), ymd(minusMonths(base, 12))]
      const fmt = (r) => `${r > 0 ? '+' : ''}${r.toFixed(2)}%`
      const expected = starts.map((s) => fmt((last.closePrice / all.find((c) => c.d >= s).closePrice - 1) * 100))
      const year = all.filter((c) => c.d >= starts[4])
      const hi = year.reduce((a, c) => (c.highPrice > a.highPrice ? c : a)), lo = year.reduce((a, c) => (c.lowPrice < a.lowPrice ? c : a))
      expected.push(`${hi.highPrice.toLocaleString('ko-KR')}원`, `${lo.lowPrice.toLocaleString('ko-KR')}원`)
      const shown = await page.$$eval('[aria-label="기간별 주가 변화"] dd', (dds) => dds.map((dd) => dd.textContent.trim()))
      const dates = await page.$$eval('[aria-label="기간별 주가 변화"] dt small', (s) => s.map((x) => x.textContent.trim()))
      const want = [`${+hi.date.slice(5, 7)}월 ${+hi.date.slice(8, 10)}일`, `${+lo.date.slice(5, 7)}월 ${+lo.date.slice(8, 10)}일`]
      report('S-3', JSON.stringify(shown) === JSON.stringify(expected) && want.every((w, i) => dates[i]?.endsWith(w)), `화면 ${JSON.stringify(shown)} ${JSON.stringify(dates)} · 계산 ${JSON.stringify(expected)} ${JSON.stringify(want)}`)
    }
    await context.close()
  }
  report('S-1', plotH.every((p) => p.h >= 260 && p.gap !== null && Math.abs(p.gap) <= 2), `차트 높이·정보 열과의 끝 차이 1920×1080 ${plotH[0].h}px·${plotH[0].gap}px · 1440×900 ${plotH[1].h}px·${plotH[1].gap}px`)
  const { context, page } = await open('/stocks/005930', { width: 375, height: 812, wait: 2200 })
  const order = await page.evaluate(() => ['h1', '[class*="_actionPanel_"]', '[class*="_chartBox_"]', '[aria-label="시세 요약"]', '[aria-label="기간별 주가 변화"]', '[class*="_newsColumn_"]'].map((s) => Math.round(document.querySelector(s)?.getBoundingClientRect().top ?? -1)))
  report('S-4', order.every((y, i) => y >= 0 && (i === 0 || y > order[i - 1])), `375 세로 위치(이름·행동·차트·시세 요약·기간별 변화·뉴스) ${JSON.stringify(order)}`)
  await context.close()
}

/* ── 주식 모아보기 ── */
{
  const { context, page, raw } = await open('/likes')
  const live = () => raw.filter((l) => !l.startsWith('BLOCKED'))
  const nav = await page.$$eval('nav[aria-label="서비스"] a', (as) => as.map((a) => a.textContent.trim()))
  report('L-1', JSON.stringify(nav) === JSON.stringify(['홈', '주식 모아보기', '주식 백테스트', 'AI 주가분석', '사용설명서']), `머리글 메뉴 ${JSON.stringify(nav)}`)
  const m = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, stats: document.querySelectorAll('[class*="_stats_"] > div').length, tiles: document.querySelectorAll('[data-market]').length, rows: document.querySelectorAll('[class*="_row_"]').length, handoff: document.querySelectorAll('[class*="_go_"] a').length }))
  const before = live()
  await page.getByRole('button', { name: '삼성전자 관심종목 해제' }).click()
  await sleep(500)
  const after = live().slice(before.length)
  const rowsAfter = await page.locator('[class*="_row_"]').count()
  // 2026-10-30 보강 뒤 이 화면의 요청은 휴장일(지수 띠 장 상태, K-1) + 관심종목 목록 + 고른 종목 뉴스 1건이다(CLAUDE.md "주식 모아보기")
  const LIKES_REQUESTS = ['GET /api/market/holiday?basedate=20261029', 'GET /api/members/me/like-stocks', `GET /api/news?query=${encodeURIComponent('삼성전자')}`]
  report('L-2a', JSON.stringify(before) === JSON.stringify(LIKES_REQUESTS) && m.h1 === '관심종목 2개 중 1개가 올랐어요' && m.stats === 5 && m.tiles === 2 && m.rows === 2 && m.handoff === 4,
    `요청 ${JSON.stringify(before)}, 한 문장 "${m.h1}", 숫자 ${m.stats}, 지도 칸 ${m.tiles}, 목록 ${m.rows}, 바로 가기 ${m.handoff}`)
  // 고른 종목(첫 종목)을 빼면 뉴스가 다음 첫 종목으로 옮겨 1건 더 받는다
  report('L-2b', JSON.stringify(after) === JSON.stringify(['DELETE /api/members/me/like-stocks/005930', `GET /api/news?query=${encodeURIComponent('SK하이닉스')}`]) && rowsAfter === 1, `해제 뒤 요청 ${JSON.stringify(after)}, 목록 ${rowsAfter}줄`)
  await context.close()
  const f = await open('/likes', { opts: { likeWrite: '500' } })
  await f.page.getByRole('button', { name: '삼성전자 관심종목 해제' }).click()
  await sleep(800)
  const status = await f.page.locator('[role="status"]').textContent().catch(() => null)
  const rowsBack = await f.page.locator('[class*="_row_"]').count()
  report('L-2c', rowsBack === 2 && /해제하지 못했어요/.test(status ?? ''), `해제 실패(500) 뒤 목록 ${rowsBack}줄, 안내 "${status}"`)
  await f.context.close()
  const g = await open('/likes', { login: false })
  const loginLink = await g.page.getByRole('link', { name: '로그인' }).last().getAttribute('href')
  report('L-3', g.log.length === 0 && loginLink === '/login?next=%2Flikes', `비로그인 요청 ${g.log.length}건, 로그인 링크 ${loginLink}`)
  await g.context.close()
  const h = await open('/mypage/personality')
  const menu = await h.page.$$eval('aside a, [class*="_sidebar_"] a', (as) => as.map((a) => a.textContent.trim()))
  await h.page.goto(BASE + '/mypage/likes', { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  const path = new URL(h.page.url()).pathname
  report('L-4', !menu.includes('관심종목') && path === '/likes', `마이페이지 메뉴 ${JSON.stringify(menu)}, /mypage/likes → ${path}`)
  await h.context.close()
}

const fails = out.filter((l) => l.startsWith('FAIL')).length
console.log(`\n합계: PASS ${out.length - fails} · FAIL ${fails}`)
await browser.close()
