// 아래 지수 띠와 실시간 시세 판정. /api는 전부 가짜(mock.mjs) — 지수는 GET /api/market-indices, 실시간은 SSE GET /api/stream/prices.
// node market.mjs <BASE> [--only A,R,S]
//
// 기대값(판정 전에 적는다)
//  A1 로그인 홈: 코스피 "2,612.43" "+0.47%" 빨강(up), 코스닥 "745.10" "-0.43%" 파랑(down), "10월 29일 11:00 기준", "(목업본)" 없음
//  A2 숫자가 글자로 와도 A1과 같은 글자
//  A3 보합·빈 대비율: 코스피 "0.00%" 색 없음(flat), 코스닥은 이름·지수만
//  A4 틀린 줄 섞임: 이름 빈 줄·null·지수 "abc" 줄은 빠지고 코스피200 한 줄만
//  A5 모양 틀림·500(지난 값 없음): 띠 없음. 500 + 지난 값: 지난 값과 그 때("10월 28일 15:40 기준")
//  A6 일요일 11:00(증권사 토큰 없을 때): 지수 요청 0건, 지난 값이 있으면 그걸 띄운다
//  A7 실시간 연결이 없으면 장중 61초 뒤 지수 요청 2건. 장 밖(목 20:00)은 61초 뒤에도 1건
//  A8 화면을 옮겨도(홈 → 상세 → 백테스트, 링크로) 지수 요청 1건·스트림 연결 1건
//  A9 비로그인 장중(지수·스트림은 로그인 없이 열린다 — JUBY-BE dc44e2b): 띠가 실시간 "코스피 2,620.50" "실시간", 홈 삼성전자 "72,400원", 지수 1건
//  A10 비로그인 장 밖(목 20:00)에 첫 지수 요청이 500: 61초 뒤 다시 물어 띠가 뜬다(지수 2건). 그 탭에서 로그인해도 지수를 다시 묻지 않는다(2건 그대로)
//  A11 목 15:50(증권사 토큰이 끝나 있을 때)·지난 값 없음: 지수를 1건 묻고 띠를 띄운다 — 지난 값이 없으면 띠가 통째로 비므로
//  R1 스트림 값이 띠를 바꾼다: 코스피 "2,620.50" "+0.78%", 기준 자리에 "실시간"
//  R2 홈 시세표: 삼성전자 "72,400원" "+1.97%" (둘째 묶음까지 반영), 머리 "실시간"
//  R3 값이 바뀌어 거래대금 순서가 달라져도 줄 순서는 그대로(정렬을 다시 누르면 바뀐다)
//  R4 종목 상세 머리 가격: "72,300" + "실시간"
//  R5 관심종목: 삼성전자 행 "+1.83%", 기준 "실시간"
//  R6 장 밖(목 20:00)에는 스트림 요청 0건
//  R7 스트림이 500이면 다시 붙되(2초 안에 2건 이상 아님 — 2초 뒤부터) 화면은 REST 값 그대로, 콘솔 오류 없음
//  R8 시세표 응답이 장중 값(realtime·asOf)이면 머리 "10월 29일 11:00 기준"
//  S3 가로 넘침 없음: 320·375·768·1440 (홈, 상세)
//  S4 맨 아래까지 내리면 본문 마지막 요소 아래 끝 ≤ 띠 위 끝, 띠는 화면 맨 아래
//  S5 띠 높이 1440: 44px, 375: 40px. 띠 글자 왼쪽 끝 = 머리글 로고 왼쪽 끝
//  S6 띠 글자 대비 전부 ≥ 4.5:1 (REST·실시간)
//  S8 375에서 두 줄이 띠 안에서 잘리지 않음
import { cli, judge, kst, noOverflow, sleep, tokenFor } from './lib.mjs'

const j = await judge(cli())
const BAR = 'aside[aria-label="국내 지수"]'
const THU_20 = kst(2026, 10, 29, 20)
const SUN_11 = kst(2026, 11, 1, 11)
const CACHED = JSON.stringify({ savedAt: kst(2026, 10, 28, 15, 40), value: { indices: [{ code: '0001', name: '코스피', value: 2590.5, changeRate: -0.21 }], receivedAt: kst(2026, 10, 28, 15, 40) } })
const SEED_CACHE = { 'marketIndices.v2': CACHED }
const LIVE = [
  {
    prices: [
      { stockCode: '005930', currentPrice: 72300, changeRate: 1.83, accTradingValue: 2.1e12, contractTime: '110001' },
      // 넷째 줄(한화에어로스페이스)이 거래대금 1위가 되는 값 — 줄 순서는 그대로여야 한다(R3)
      { stockCode: '012450', currentPrice: 910000, changeRate: 3.2, accTradingValue: 9.9e12, contractTime: '110001' },
    ],
    indices: [{ code: '0001', name: '코스피', currentIndex: 2620.5, changeRate: 0.78 }],
  },
  { prices: [{ stockCode: '005930', currentPrice: 72400, changeRate: 1.97, accTradingValue: 2.2e12, contractTime: '110002' }] },
]
const barText = (page) => page.evaluate((sel) => document.querySelector(sel)?.innerText.replace(/\s+/g, ' ') ?? null, BAR)
const toneOf = (page, name) => page.evaluate(({ sel, name }) => {
  const item = [...document.querySelectorAll(`${sel} li`)].find((li) => li.innerText.includes(name))
  const tone = item?.querySelector('span:last-child')
  return tone ? getComputedStyle(tone).color : null
}, { sel: BAR, name })
const rowText = (page, code) => page.evaluate((code) => [...document.querySelectorAll('li')].find((li) => li.innerText.includes(code) && /원/.test(li.innerText))?.innerText.replace(/\s+/g, ' ') ?? null, code)
const homeHead = (page) => page.evaluate(() => document.querySelector('#home-stocks-title')?.parentElement?.innerText.replace(/\s+/g, ' ') ?? '')
const n = (log, re) => log.filter((l) => re.test(l)).length
const IDX = /^GET \/api\/market-indices/
const STREAM = /^GET \/api\/stream\/prices/

await j.run('A', async () => {
  let t = await j.open()
  await t.goto('/', 1800)
  const text = await barText(t.page)
  const [kospi, kosdaq] = [await toneOf(t.page, '코스피'), await toneOf(t.page, '코스닥')]
  j.report('A1', /코스피 2,612\.43 \+0\.47%/.test(text) && /코스닥 745\.10 -0\.43%/.test(text) && /10월 29일 11:00 기준/.test(text) && !/목업본/.test(text) && kospi !== kosdaq, `"${text}" 색 ${kospi} / ${kosdaq}`)
  await t.close()

  t = await j.open({ indices: 'strings' })
  await t.goto('/', 1800)
  const strings = await barText(t.page)
  j.report('A2', /코스피 2,612\.43 \+0\.47%/.test(strings) && /코스닥 745\.10 -0\.43%/.test(strings), strings)
  await t.close()

  t = await j.open({ indices: 'flat' })
  await t.goto('/', 1800)
  const flat = await barText(t.page)
  j.report('A3', /코스피 2,600\.00 0\.00%/.test(flat) && /코스닥 745\.10( 10월| 실시간|$)/.test(flat), flat)
  await t.close()

  t = await j.open({ indices: 'partial' })
  await t.goto('/', 1800)
  const partial = await barText(t.page)
  j.report('A4', /코스피200 350\.25 \+0\.43%/.test(partial) && !/코스닥/.test(partial) && !/코스피 2,612/.test(partial), partial)
  await t.close()

  const a5 = []
  for (const [indices, seed] of [['malformed', null], ['500', null], ['500', SEED_CACHE]]) {
    t = await j.open({ indices, seed })
    await t.goto('/', 1800)
    a5.push(await barText(t.page))
    await t.close()
  }
  j.report('A5', a5[0] === null && a5[1] === null && /코스피 2,590\.50 -0\.21%/.test(a5[2] ?? '') && /10월 28일 15:40 기준/.test(a5[2] ?? ''), JSON.stringify(a5))

  t = await j.open({ at: SUN_11, seed: { ...SEED_CACHE, kisTokenPrimedAt: '0' } })
  await t.goto('/', 1800)
  const sunday = await barText(t.page)
  j.report('A6', n(t.log, IDX) === 0 && /코스피 2,590\.50/.test(sunday ?? ''), `지수 요청 ${n(t.log, IDX)}건, 띠 "${sunday}"`)
  await t.close()

  t = await j.open()
  await t.goto('/', 500)
  await sleep(61_500)
  const open = n(t.log, IDX)
  await t.close()
  t = await j.open({ at: THU_20 })
  await t.goto('/', 500)
  await sleep(61_500)
  const closed = n(t.log, IDX)
  await t.close()
  j.report('A7', open === 2 && closed === 1, `장중 61초 뒤 ${open}건, 장 밖 ${closed}건`)

  t = await j.open()
  await t.goto('/', 1500)
  await t.page.getByRole('link', { name: '삼성전자' }).first().click()
  await sleep(1500)
  await t.page.getByRole('link', { name: '이 종목 백테스트' }).first().click()
  await sleep(1500)
  j.report('A8', n(t.log, IDX) === 1 && n(t.log, STREAM) === 1 && (await barText(t.page)) !== null, `지수 ${n(t.log, IDX)}건, 스트림 ${n(t.log, STREAM)}건, 주소 ${new URL(t.page.url()).pathname}`)
  await t.close()

  t = await j.open({ loggedIn: false, stream: LIVE })
  await t.goto('/', 2500)
  const guestBar = await barText(t.page)
  const guestRow = await rowText(t.page, '005930')
  j.report('A9', /코스피 2,620\.50 \+0\.78%/.test(guestBar ?? '') && /실시간/.test(guestBar ?? '') && /72,400원/.test(guestRow ?? '') && n(t.log, IDX) === 1, `띠 "${guestBar}", 행 "${guestRow}", 지수 ${n(t.log, IDX)}건, 스트림 ${n(t.log, STREAM)}건`)
  await t.close()

  t = await j.open({ loggedIn: false, at: THU_20, indices: (count) => (count === 1 ? '500' : 'ok') })
  await t.goto('/', 1500)
  const before = await barText(t.page)
  await sleep(61_000)
  const retried = await barText(t.page)
  await t.page.evaluate((token) => {
    localStorage.setItem('accessToken', token)
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: token }))
  }, tokenFor())
  await sleep(1500)
  const after = await barText(t.page)
  j.report(
    'A10',
    before === null && /코스피 2,612\.43/.test(retried ?? '') && /코스피 2,612\.43/.test(after ?? '') && n(t.log, IDX) === 2,
    `처음 띠 ${before}, 61초 뒤 "${retried}", 로그인 뒤 "${after}", 지수 ${n(t.log, IDX)}건`,
  )
  await t.close()

  t = await j.open({ at: kst(2026, 10, 29, 15, 50), seed: { kisTokenPrimedAt: '0' } })
  await t.goto('/', 1800)
  const expired = await barText(t.page)
  j.report('A11', n(t.log, IDX) === 1 && /코스피 2,612\.43/.test(expired ?? ''), `지수 요청 ${n(t.log, IDX)}건, 띠 "${expired}"`)
  await t.close()
})

await j.run('R', async () => {
  let t = await j.open({ stream: LIVE })
  await t.goto('/', 2500)
  const bar = await barText(t.page)
  j.report('R1', /코스피 2,620\.50 \+0\.78%/.test(bar) && /실시간/.test(bar) && !/기준/.test(bar), bar)
  const row = await rowText(t.page, '005930')
  const head = await homeHead(t.page)
  j.report('R2', /72,400원/.test(row ?? '') && /\+1\.97%/.test(row ?? '') && /실시간/.test(head), `"${row}" · 머리 "${head}"`)
  await t.close()

  // 시세표가 선 뒤에 거래대금 1위가 바뀌는 값이 온다(둘째 연결) — 줄은 그대로, 정렬을 다시 누르면 그 값으로 선다
  t = await j.open({ stream: [{ indices: LIVE[0].indices }, { prices: [LIVE[0].prices[1]] }] })
  await t.goto('/', 3000)
  const codes = (count) => t.page.evaluate((count) => [...document.querySelectorAll('li')].filter((li) => /\d{6}/.test(li.innerText) && /원/.test(li.innerText)).slice(0, count).map((li) => li.innerText.match(/\d{6}/)[0]), count)
  const order = await codes(4)
  const hanwha = await rowText(t.page, '012450')
  await t.page.getByRole('button', { name: /등락률/ }).first().click()
  await sleep(300)
  const resorted = await codes(2)
  j.report('R3', order.join() === '005930,000660,005935,012450' && /910,000원/.test(hanwha ?? '') && resorted[0] === '012450', `실시간 값이 온 뒤 순서 ${order.join()} ("${hanwha}") · 등락률 정렬 뒤 ${resorted.join()}`)
  await t.close()

  t = await j.open({ stream: LIVE.slice(0, 1) })
  await t.goto('/stocks/005930', 2500)
  const price = await t.page.evaluate(() => document.querySelector('main p')?.parentElement?.innerText.replace(/\s+/g, ' ') ?? '')
  j.report('R4', /72,300/.test(price) && /실시간/.test(price), price.slice(0, 120))
  await t.close()

  t = await j.open({ stream: LIVE.slice(0, 1) })
  await t.goto('/likes', 2500)
  const likes = await t.page.evaluate(() => document.querySelector('main')?.innerText.replace(/\s+/g, ' ') ?? '')
  j.report('R5', /삼성전자[^]*\+1\.83%/.test(likes) && /실시간/.test(likes.slice(0, 200)), likes.slice(0, 160))
  await t.close()

  t = await j.open({ at: THU_20, stream: LIVE })
  await t.goto('/', 2000)
  j.report('R6', n(t.log, STREAM) === 0, `장 밖 스트림 ${n(t.log, STREAM)}건`)
  await t.close()

  t = await j.open({ streamStatus: 500 })
  await t.goto('/', 1500)
  const early = n(t.log, STREAM)
  await sleep(3000)
  const later = n(t.log, STREAM)
  const head500 = await homeHead(t.page)
  j.report('R7', early === 1 && later >= 2 && /10월 28일 종가 기준/.test(head500), `1.5초 ${early}건 → 4.5초 ${later}건, 머리 "${head500}"`)
  await t.close()

  t = await j.open({ stocksRealtime: true })
  await t.goto('/', 1800)
  const restHead = await homeHead(t.page)
  j.report('R8', /10월 29일 11:00 기준/.test(restHead), restHead)
  await t.close()
})

await j.run('S', async () => {
  const over = []
  for (const width of [320, 375, 768, 1440]) {
    for (const path of ['/', '/stocks/005930']) {
      const t = await j.open({ width, height: 800, stream: LIVE.slice(0, 1) })
      await t.goto(path, 2000)
      if (!(await noOverflow(t.page))) over.push(`${width}${path}`)
      await t.close()
    }
  }
  j.report('S3', over.length === 0, over.length === 0 ? '4폭 × 2화면 가로 넘침 0' : over.join(', '))

  const res = []
  for (const [width, height, path] of [[1440, 900, '/'], [375, 812, '/'], [1440, 900, '/nope'], [375, 812, '/nope']]) {
    const t = await j.open({ width, height })
    await t.goto(path, 1800)
    await t.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(300)
    const r = await t.page.evaluate((sel) => {
      const bar = document.querySelector(sel).getBoundingClientRect()
      let bottom = 0
      for (const el of document.querySelectorAll('main *')) {
        const b = el.getBoundingClientRect()
        if (b.height > 0 && b.width > 0 && getComputedStyle(el).visibility !== 'hidden') bottom = Math.max(bottom, b.bottom)
      }
      return { barTop: bar.top, barBottom: bar.bottom, contentBottom: bottom, vh: window.innerHeight }
    }, BAR)
    res.push({ width, path, ...r, ok: r.contentBottom <= r.barTop + 0.5 && Math.abs(r.barBottom - r.vh) < 1 })
    await t.close()
  }
  j.report('S4', res.every((r) => r.ok), res.map((r) => `${r.width}${r.path} 내용끝 ${Math.round(r.contentBottom)} ≤ 띠 ${Math.round(r.barTop)}`).join(' · '))

  const sizes = []
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    const t = await j.open({ width, height })
    await t.goto('/', 1500)
    sizes.push(await t.page.evaluate((sel) => {
      const bar = document.querySelector(sel)
      const first = [...bar.querySelectorAll('p, li')].find((e) => e.getBoundingClientRect().width > 0)
      return { h: bar.getBoundingClientRect().height, barLeft: first.getBoundingClientRect().left, logoLeft: document.querySelector('header a').getBoundingClientRect().left }
    }, BAR))
    await t.close()
  }
  j.report('S5', sizes[0].h === 44 && sizes[1].h === 40 && sizes.every((s) => Math.abs(s.barLeft - s.logoLeft) < 1), JSON.stringify(sizes))

  const ratios = []
  for (const stream of [undefined, LIVE.slice(0, 1)]) {
    const t = await j.open({ stream })
    await t.goto('/', 2000)
    ratios.push(...await t.page.evaluate((sel) => {
      const parse = (c) => c.match(/[\d.]+/g).map(Number).slice(0, 3)
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const bgOf = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return parse(c); el = el.parentElement } return [255, 255, 255] }
      const out = []
      const walker = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement
        if (walker.currentNode.textContent.trim() === '' || el.getBoundingClientRect().width === 0) continue
        const a = lum(parse(getComputedStyle(el).color)), b = lum(bgOf(el))
        out.push({ text: walker.currentNode.textContent.trim(), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) })
      }
      return out
    }, BAR))
    await t.close()
  }
  const min = ratios.reduce((m, r) => (r.ratio < m.ratio ? r : m))
  j.report('S6', ratios.every((r) => r.ratio >= 4.5), `띠 글자 ${ratios.length}곳 최저 ${min.ratio.toFixed(2)}:1 ("${min.text}")`)

  const t = await j.open({ width: 375, height: 812, stream: LIVE.slice(0, 1) })
  await t.goto('/', 2000)
  const clip = await t.page.evaluate((sel) => {
    const bar = document.querySelector(sel)
    const list = bar.querySelector('ul')
    const last = [...bar.querySelectorAll('li')].at(-1).getBoundingClientRect()
    return { listOver: list.scrollWidth - list.clientWidth, inside: last.right <= bar.getBoundingClientRect().right }
  }, BAR)
  j.report('S8', clip.listOver <= 0 && clip.inside, JSON.stringify(clip))
  await t.close()
})

await j.finish()
