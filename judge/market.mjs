// 아래 지수 띠 판정(2026-10-29). /api는 전부 가짜(mock.mjs). 실제 백엔드로 가는 요청은 막힌다.
// node market.mjs <SAMPLE_BASE> <API_BASE>
//   SAMPLE_BASE: 커밋할 빌드(USE_SAMPLE = true)  API_BASE: 같은 소스에서 USE_SAMPLE만 false로 바꾼 임시 빌드
//
// 기대값(판정 전에 적는다)
//  S1 예시 빌드: 홈·상세·백테스트·AI·사용설명서·로그인·없는 주소·마이페이지(로그인) 8화면 모두 띠가 있고 코스피·코스닥 두 줄 + "(목업본)"(2026-11-03까지 "예시 값 · 실제 지수 아님")
//  S2 예시 빌드: /api/stocks/indices 요청 0건, localStorage marketIndices 없음
//  S3 가로 넘침 없음: 320·375·390·768·1024·1440·1920 (홈, 상세)
//  S4 맨 아래까지 내리면 본문 마지막 요소 아래 끝 ≤ 띠 위 끝(가리지 않음). 내용이 짧은 화면(없는 주소)도 띠가 화면 맨 아래
//  S5 띠 높이 1440: 44px, 375: 40px. 띠 글자 왼쪽 끝 = 머리글 로고 왼쪽 끝(1440·1920)
//  S6 띠 글자 대비 전부 ≥ 4.5:1
//  S7 겹침: 상세 차트가 띠 밑을 지날 때 띠가 위, 모달이 열리면 모달(막)이 띠 위
//  S8 375에서 두 줄과 "(목업본)"이 띠 안에서 잘리지 않음(목록 넘침 없음)
//  A1 API 빌드(숫자): 코스피 "2,612.43" "+12.31" "+0.47%" 빨강(up), 코스닥 "745.10" "-3.20" "-0.43%" 파랑(down), "10월 29일 11:00 기준", "(목업본)" 없음
//  A2 API 빌드(문자열 숫자): A1과 같은 글자
//  A3 보합·빈 대비: 코스피 "0.00" "0.00%" 색 없음(flat), 코스닥은 대비 자리 없이 이름·지수만
//  A4 틀린 줄 섞임: 이름 빈 줄·null·지수 "abc" 줄은 빠지고 코스피200 한 줄만
//  A5 모양 틀림 / 500 (지난 값 없음): 띠 없음. 500 + 지난 값: 지난 값과 그 받은 때("10월 28일 15:40 기준")
//  A6 일요일 11:00(증권사 토큰 없을 때): 요청 0건, 지난 값이 있으면 그걸 띄운다
//  A7 장중(목 11:00) 61초 뒤 요청 2건, 122초 뒤 3건. 장 밖(목 20:00) 61초 뒤에도 1건. 탭을 숨기면 61초 뒤에도 늘지 않음
//  A8 화면을 옮겨도(홈 → 상세 → 백테스트 → 홈, 링크로) 요청 1건, 띠 그대로
//  A9 받은 값은 localStorage marketIndices에 담긴다(지수·받은 때)
import { chromium } from 'playwright'
import { mock, seedLogin } from './mock.mjs'

const [SAMPLE, API] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
function report(id, ok, msg) {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`
  out.push(line)
  console.log(line)
}
const BAR = 'aside[aria-label="국내 지수"]'
const IDX = /^GET \/api\/stocks\/indices/
const count = (log, re) => log.filter((l) => re.test(l)).length
const THU_11 = Date.UTC(2026, 9, 29, 2, 0, 0)
const THU_20 = Date.UTC(2026, 9, 29, 11, 0, 0)
const SUN_11 = Date.UTC(2026, 10, 1, 2, 0, 0)
const CACHED = { indices: [{ code: '0001', name: '코스피', value: 2590.5, change: -5.5, changeRate: -0.21 }], receivedAt: Date.UTC(2026, 9, 28, 6, 40, 0) }

const browser = await chromium.launch({ channel: 'chrome' })

/** 시계를 at으로 못박은(타이머까지) 맥락. cache를 주면 지난 값을 심는다 */
async function clocked({ w = 1440, h = 900, at = THU_11, cache = null, mockOpts = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h } })
  await context.clock.install({ time: at })
  if (cache) {
    await context.addInitScript(({ cache, at }) => {
      if (sessionStorage.getItem('__seeded') !== null) return
      sessionStorage.setItem('__seeded', '1')
      localStorage.setItem('marketIndices', JSON.stringify({ savedAt: at - 60_000, value: cache }))
    }, { cache, at })
  }
  const log = await mock(context, mockOpts)
  const page = await context.newPage()
  return { context, page, log }
}

async function barText(page) {
  return (await page.locator(BAR).innerText()).replace(/\s+/g, ' ').trim()
}

async function itemInfo(page) {
  return page.$$eval(`${BAR} li`, (lis) => lis.map((li) => {
    const spans = [...li.querySelectorAll('span')]
    const tone = spans.find((s) => /_tone_/.test(s.className))
    return {
      text: li.innerText.replace(/\s+/g, ' ').trim(),
      tone: tone ? (/_up_/.test(tone.className) ? 'up' : /_down_/.test(tone.className) ? 'down' : /_flat_/.test(tone.className) ? 'flat' : '?') : 'none',
    }
  }))
}

// ---------- 예시 빌드 ----------
{
  const pages = [['/', false], ['/stocks/005930', false], ['/backtest', false], ['/ai', false], ['/guide', false], ['/login', false], ['/nope', false], ['/mypage/personality', true]]
  const fails = []
  let indexReqs = 0
  let cacheKeys = 0
  for (const [path, loggedIn] of pages) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await seedLogin(context, loggedIn)
    const log = await mock(context)
    const page = await context.newPage()
    await page.goto(SAMPLE + path)
    const ok = await page.locator(`${BAR} li`).nth(1).waitFor({ timeout: 6000 }).then(() => true, () => false)
    const text = ok ? await barText(page) : ''
    if (!(ok && /코스피 5,937\.66/.test(text) && /코스닥 1,152\.34/.test(text) && /\(목업본\)/.test(text))) fails.push(`${path}: "${text}"`)
    await page.waitForTimeout(800)
    indexReqs += count(log, IDX)
    cacheKeys += await page.evaluate(() => (localStorage.getItem('marketIndices') === null ? 0 : 1))
    await context.close()
  }
  report('S1', fails.length === 0, fails.length === 0 ? `8화면 모두 띠 + 두 줄 + "(목업본)"` : fails.join(' | '))
  report('S2', indexReqs === 0 && cacheKeys === 0, `지수 요청 ${indexReqs}건, marketIndices 담긴 화면 ${cacheKeys}`)
}

{
  const fails = []
  for (const w of [320, 375, 390, 768, 1024, 1440, 1920]) {
    for (const path of ['/', '/stocks/005930']) {
      const context = await browser.newContext({ viewport: { width: w, height: 800 } })
      await seedLogin(context, false)
      await mock(context)
      const page = await context.newPage()
      await page.goto(SAMPLE + path)
      await page.locator(`${BAR} li`).nth(1).waitFor()
      await page.waitForTimeout(1200)
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (over > 0) fails.push(`${w} ${path} +${over}px`)
      await context.close()
    }
  }
  report('S3', fails.length === 0, fails.length === 0 ? '7폭 × 2화면 가로 넘침 0' : fails.join(', '))
}

{
  const res = []
  for (const [w, h, path] of [[1440, 900, '/'], [375, 812, '/'], [1440, 900, '/stocks/005930'], [1440, 900, '/nope'], [375, 812, '/nope']]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } })
    await seedLogin(context, false)
    await mock(context)
    const page = await context.newPage()
    await page.goto(SAMPLE + path)
    await page.locator(`${BAR} li`).nth(1).waitFor()
    await page.waitForTimeout(1500)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const r = await page.evaluate((sel) => {
      const bar = document.querySelector(sel).getBoundingClientRect()
      // 본문 안에서 가장 아래에 있는 보이는 요소
      let bottom = 0
      for (const el of document.querySelectorAll('main *')) {
        const b = el.getBoundingClientRect()
        if (b.height > 0 && b.width > 0 && getComputedStyle(el).visibility !== 'hidden') bottom = Math.max(bottom, b.bottom)
      }
      return { barTop: bar.top, barBottom: bar.bottom, contentBottom: bottom, vh: window.innerHeight }
    }, BAR)
    res.push({ w, path, ...r, ok: r.contentBottom <= r.barTop + 0.5 && Math.abs(r.barBottom - r.vh) < 1 })
    await context.close()
  }
  report('S4', res.every((r) => r.ok), res.map((r) => `${r.w}${r.path} 내용끝 ${Math.round(r.contentBottom)} ≤ 띠 ${Math.round(r.barTop)}, 띠 아래 ${Math.round(r.barBottom)}/${r.vh}`).join(' · '))
}

{
  const res = []
  for (const [w, h] of [[1440, 900], [1920, 1080], [375, 812]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } })
    await seedLogin(context, false)
    await mock(context)
    const page = await context.newPage()
    await page.goto(SAMPLE + '/')
    await page.locator(`${BAR} li`).nth(1).waitFor()
    const r = await page.evaluate((sel) => {
      const bar = document.querySelector(sel)
      const first = bar.querySelector('p, li')
      const visibleFirst = [...bar.querySelectorAll('p, li')].find((e) => e.getBoundingClientRect().width > 0) ?? first
      const logo = document.querySelector('header a')
      return { h: bar.getBoundingClientRect().height, barLeft: visibleFirst.getBoundingClientRect().left, logoLeft: logo.getBoundingClientRect().left }
    }, BAR)
    res.push({ w, ...r })
    await context.close()
  }
  const ok = res[0].h === 44 && res[1].h === 44 && res[2].h === 40 && Math.abs(res[0].barLeft - res[0].logoLeft) < 1 && Math.abs(res[1].barLeft - res[1].logoLeft) < 1 && Math.abs(res[2].barLeft - res[2].logoLeft) < 1
  report('S5', ok, res.map((r) => `${r.w}: 높이 ${r.h}, 띠 왼쪽 ${Math.round(r.barLeft)} / 로고 ${Math.round(r.logoLeft)}`).join(' · '))
}

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await seedLogin(context, false)
  await mock(context)
  const page = await context.newPage()
  const worst = []
  for (const base of [SAMPLE, API]) {
    await page.goto(base + '/')
    await page.locator(`${BAR} li`).nth(1).waitFor()
    await page.waitForTimeout(500)
    worst.push(...await page.evaluate((sel) => {
      const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3) }
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const bgOf = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c); el = el.parentElement } return [255, 255, 255] }
      const res = []
      const walker = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement
        if (walker.currentNode.textContent.trim() === '' || el.getBoundingClientRect().width === 0) continue
        const a = lum(parse(getComputedStyle(el).color)), b = lum(bgOf(el))
        res.push({ text: walker.currentNode.textContent.trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) })
      }
      return res
    }, BAR))
  }
  await context.close()
  const min = worst.reduce((m, r) => (r.ratio < m.ratio ? r : m))
  report('S6', worst.every((r) => r.ratio >= 4.5), `띠 글자 ${worst.length}곳(예시·API 빌드) 최저 ${min.ratio.toFixed(2)}:1 ("${min.text}")`)
}

{
  // 상세: 차트가 띠 밑에 오게 하고(창 높이를 낮춰 차트 아래쪽이 띠에 걸리게) 띠 가운데를 누가 차지하는지 본다
  // 2026-10-30 디자인 재정비: 차트가 오른쪽 열 맨 위로 올라가 480 높이에서는 띠에 닿지 않는다(띠보다 위로 스크롤할 수 없다). 300으로 낮춘다
  const context = await browser.newContext({ viewport: { width: 1440, height: 300 } })
  await seedLogin(context, true)
  await mock(context)
  const page = await context.newPage()
  await page.goto(SAMPLE + '/stocks/005930')
  await page.locator(`${BAR} li`).nth(1).waitFor()
  await page.locator('canvas').first().waitFor()
  await page.waitForTimeout(1500)
  // 가장 큰 캔버스(봉 차트)의 가운데가 띠 가운데에 오게 내린다
  // 가장 큰 캔버스(봉 차트)를 찾는 함수 본문. 두 evaluate가 같은 글을 쓴다(eval 대신 Function)
  const big = `return [...document.querySelectorAll('canvas')].reduce((a, c) => (c.getBoundingClientRect().height * c.getBoundingClientRect().width > a.getBoundingClientRect().height * a.getBoundingClientRect().width ? c : a))`
  const chartUnder = await page.evaluate(({ sel, big }) => {
    const bar = document.querySelector(sel).getBoundingClientRect()
    const canvas = new Function(big)().getBoundingClientRect()
    window.scrollBy(0, canvas.top + canvas.height / 2 - (bar.top + bar.height / 2))
    return true
  }, { sel: BAR, big })
  await page.waitForTimeout(300)
  const topOnChart = await page.evaluate(({ sel, big }) => {
    const bar = document.querySelector(sel)
    const r = bar.getBoundingClientRect()
    const canvas = new Function(big)().getBoundingClientRect()
    const x = canvas.left + 40
    const y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    return { overlap: canvas.top < y && canvas.bottom > y, inBar: bar.contains(hit), canvasTop: Math.round(canvas.top), canvasBottom: Math.round(canvas.bottom), y: Math.round(y) }
  }, { sel: BAR, big })
  // 모달: 마이페이지 내 정보의 탈퇴 확인
  await page.goto(SAMPLE + '/mypage/profile')
  await page.locator(`${BAR} li`).nth(1).waitFor()
  const withdraw = page.getByRole('button', { name: /탈퇴/ }).first()
  await withdraw.waitFor({ timeout: 6000 })
  await withdraw.click()
  await page.getByRole('dialog').waitFor({ timeout: 4000 })
  const modalOnTop = await page.evaluate((sel) => {
    const bar = document.querySelector(sel)
    const r = bar.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + 200, r.top + r.height / 2)
    return !bar.contains(hit)
  }, BAR)
  await context.close()
  report('S7', chartUnder && topOnChart.overlap && topOnChart.inBar && modalOnTop, `봉 차트(${topOnChart.canvasTop}~${topOnChart.canvasBottom})가 띠 가운데(${topOnChart.y}) 밑을 지날 때 맨 위 = 띠 ${topOnChart.inBar}, 모달이 띠 위 ${modalOnTop}`)
}

{
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  await seedLogin(context, false)
  await mock(context)
  const page = await context.newPage()
  await page.goto(SAMPLE + '/')
  await page.locator(`${BAR} li`).nth(1).waitFor()
  await page.waitForTimeout(500)
  const r = await page.evaluate((sel) => {
    const bar = document.querySelector(sel)
    const list = bar.querySelector('ul')
    const chip = [...bar.querySelectorAll('p')].find((p) => /목업본/.test(p.textContent))
    const br = bar.getBoundingClientRect(), cr = chip.getBoundingClientRect()
    return { listOver: list.scrollWidth - list.clientWidth, chipInside: cr.right <= br.right && cr.width > 0, text: bar.innerText.replace(/\s+/g, ' ') }
  }, BAR)
  await context.close()
  report('S8', r.listOver === 0 && r.chipInside, `375: 목록 넘침 ${r.listOver}px, "(목업본)" 띠 안 ${r.chipInside} — "${r.text}"`)
}

// ---------- API 빌드 ----------
{
  const res = {}
  for (const v of ['ok', 'strings']) {
    const { context, page, log } = await clocked({ mockOpts: { indices: v } })
    await page.goto(API + '/')
    await page.locator(`${BAR} li`).nth(1).waitFor({ timeout: 6000 }).catch(() => {})
    res[v] = { items: await itemInfo(page).catch(() => []), text: await barText(page).catch(() => ''), reqs: count(log, IDX) }
    await context.close()
  }
  const want = (r) => r.items.length === 2 &&
    r.items[0].text === '코스피 2,612.43 +12.31 +0.47%' && r.items[0].tone === 'up' &&
    r.items[1].text === '코스닥 745.10 -3.20 -0.43%' && r.items[1].tone === 'down' &&
    /10월 29일 11:00 기준/.test(r.text) && !/예시|목업본/.test(r.text) && r.reqs === 1
  // 괄호는 CSS(::before/::after)라 innerText에 안 들어간다. 눈에 보이는 건 "+12.31 (+0.47%)"
  report('A1', want(res.ok), `${JSON.stringify(res.ok.items)} · "${res.ok.text}" · 요청 ${res.ok.reqs}`)
  report('A2', want(res.strings), `${JSON.stringify(res.strings.items)} · 요청 ${res.strings.reqs}`)
}

{
  const { context, page } = await clocked({ mockOpts: { indices: 'flat' } })
  await page.goto(API + '/')
  await page.locator(`${BAR} li`).nth(1).waitFor({ timeout: 6000 }).catch(() => {})
  const items = await itemInfo(page)
  await context.close()
  report('A3', items.length === 2 && items[0].text === '코스피 2,600.00 0.00 0.00%' && items[0].tone === 'flat' && items[1].text === '코스닥 745.10' && items[1].tone === 'none', JSON.stringify(items))
}

{
  const { context, page } = await clocked({ mockOpts: { indices: 'partial' } })
  await page.goto(API + '/')
  await page.locator(`${BAR} li`).first().waitFor({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(500)
  const items = await itemInfo(page)
  await context.close()
  report('A4', items.length === 1 && items[0].text === '코스피200 350.25 +1.50 +0.43%', JSON.stringify(items))
}

{
  const res = []
  for (const [v, cache] of [['malformed', null], ['500', null], ['500', CACHED]]) {
    const { context, page, log } = await clocked({ mockOpts: { indices: v }, cache })
    await page.goto(API + '/')
    await page.locator('table, [class*=_card_]').first().waitFor({ timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const has = await page.locator(BAR).count()
    res.push({ v, cache: cache !== null, bars: has, text: has ? await barText(page) : '', reqs: count(log, IDX) })
    await context.close()
  }
  const ok = res[0].bars === 0 && res[1].bars === 0 && res[2].bars === 1 && /코스피 2,590\.50 -5\.50 -0\.21%/.test(res[2].text) && /10월 28일 15:40 기준/.test(res[2].text) && res.every((r) => r.reqs === 1)
  report('A5', ok, res.map((r) => `${r.v}${r.cache ? '+지난값' : ''}: 띠 ${r.bars} "${r.text}" 요청 ${r.reqs}`).join(' · '))
}

{
  const res = []
  for (const cache of [null, CACHED]) {
    const { context, page, log } = await clocked({ at: SUN_11, cache })
    await page.goto(API + '/')
    await page.locator('table, [class*=_card_]').first().waitFor({ timeout: 6000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const has = await page.locator(BAR).count()
    res.push({ cache: cache !== null, bars: has, text: has ? await barText(page) : '', reqs: count(log, IDX) })
    await context.close()
  }
  report('A6', res[0].reqs === 0 && res[1].reqs === 0 && res[0].bars === 0 && res[1].bars === 1 && /2,590\.50/.test(res[1].text), res.map((r) => `${r.cache ? '지난값 있음' : '지난값 없음'}: 요청 ${r.reqs}, 띠 ${r.bars} "${r.text}"`).join(' · '))
}

{
  const res = {}
  {
    const { context, page, log } = await clocked({ at: THU_11 })
    await page.goto(API + '/')
    await page.locator(`${BAR} li`).nth(1).waitFor()
    const first = count(log, IDX)
    await page.clock.runFor(61_000); await sleep(400)
    const second = count(log, IDX)
    await page.clock.runFor(61_000); await sleep(400)
    res.open = [first, second, count(log, IDX)]
    await context.close()
  }
  {
    const { context, page, log } = await clocked({ at: THU_20 })
    await page.goto(API + '/')
    await page.locator(`${BAR} li`).nth(1).waitFor()
    await page.clock.runFor(61_000); await sleep(400)
    await page.clock.runFor(61_000); await sleep(400)
    res.closed = count(log, IDX)
    await context.close()
  }
  {
    const { context, page, log } = await clocked({ at: THU_11 })
    await page.goto(API + '/')
    await page.locator(`${BAR} li`).nth(1).waitFor()
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.runFor(61_000); await sleep(400)
    await page.clock.runFor(61_000); await sleep(400)
    res.hidden = count(log, IDX)
    await context.close()
  }
  report('A7', res.open.join() === '1,2,3' && res.closed === 1 && res.hidden === 1, `장중 0·61·122초: ${res.open.join('→')}건, 장 밖 122초: ${res.closed}건, 탭 숨김 122초: ${res.hidden}건`)
}

{
  const { context, page, log } = await clocked({ at: THU_11 })
  await page.goto(API + '/')
  await page.locator(`${BAR} li`).nth(1).waitFor()
  const handle = await page.locator(BAR).elementHandle()
  await page.locator('a[href="/stocks/005930"]').first().click()
  await page.waitForURL(/\/stocks\/005930/)
  await page.getByRole('link', { name: '주식 백테스트' }).first().click()
  await page.waitForURL(/\/backtest/)
  await page.getByRole('link', { name: '홈' }).first().click()
  await page.waitForURL((u) => u.pathname === '/')
  await page.waitForTimeout(800)
  const same = await handle.evaluate((el) => el.isConnected)
  const reqs = count(log, IDX)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('marketIndices') ?? 'null'))
  await context.close()
  report('A8', reqs === 1 && same, `화면 3번 옮긴 뒤 요청 ${reqs}건, 같은 띠 요소 ${same}`)
  report('A9', stored?.value?.indices?.length === 2 && Math.abs((stored.value.receivedAt ?? 0) - THU_11) < 5000, `담긴 값: 지수 ${stored?.value?.indices?.length}줄, 받은 때 ${new Date(stored?.value?.receivedAt ?? 0).toISOString()}`)
}

await browser.close()
const failed = out.filter((l) => l.startsWith('FAIL')).length
console.log(`\n${out.length - failed}/${out.length} 통과`)
