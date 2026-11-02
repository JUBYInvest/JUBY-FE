// 종목 상세 바로 가기 버튼 3개(관심종목·이 종목 백테스트·AI에게 물어보기) 판정(2026-10-29, 배치 기대값은 2026-10-31 design/fresh-look 기준). /api는 전부 가짜(mock.mjs).
// node quick.mjs <BASE> [--before <BASE>] [--dev <BASE>] [--only layout,heart,backtest,ai,regress,extra,webkit] [--shots <DIR>]
// 실제 응답이 섞이면 "!! 실제 응답"을 찍는다.
import { chromium, webkit } from 'playwright'
import { mkdirSync } from 'node:fs'
import { mock, seedLogin } from './mock.mjs'

const args = process.argv.slice(2)
const BASE = args[0]
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const BEFORE = flag('--before')
const DEV = flag('--dev')
const SHOTS = flag('--shots')
const ONLY = (flag('--only') ?? 'layout,heart,backtest,ai,regress,extra,webkit').split(',')
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
function report(id, ok, msg) {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`
  out.push(line)
  console.log(line)
}
async function until(fn, ms = 6000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if (await fn()) return true } catch { /* 아직 없다 */ }
    await sleep(100)
  }
  return false
}
const count = (log, re) => log.filter((l) => re.test(l)).length

const QUESTION = '삼성전자의 주가에 대해서 간단하게 브리핑을 해줘'
const HEART = /^관심종목 (추가|해제)$/
const BT = '이 종목 백테스트'
const AI = 'AI에게 물어보기'
const LIKE_GET = /^GET \/api\/members\/me\/like-stocks$/
const LIKE_ANY = /\/api\/members\/me\/like-stocks/
const PRESET = /^GET \/api\/backtest\/preset\?/
const RUN = /^GET \/api\/backtest\/run/
const SESSION_POST = /^POST \/api\/chat-sessions$/
const ASK = /^POST \/api\/open-ai\/ask$/

const chrome = await chromium.launch({ channel: 'chrome' })
let wk = null

async function setup(browser, { base = BASE, width = 1280, login = true, opts = {}, path = '/stocks/005930' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } })
  await seedLogin(context, login)
  const log = await mock(context, opts)
  const page = await context.newPage()
  // 없는 버튼을 30초씩 기다리지 않는다(고치기 전 빌드에서 판정이 빨리 실패하게)
  page.setDefaultTimeout(4000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/') && r.headers()['x-vercel-id']) console.log('!! 실제 응답:', u.pathname)
  })
  if (path !== null) await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  return { context, page, log, errors }
}

const heartOf = (page) => page.getByRole('button', { name: HEART })
// 2026-10-29 리디자인(U-3)부터 오른쪽 열 카드의 링크 행이다. 이름을 모르면 링크가 아니다(누를 수 없음)
const btOf = (page) => page.locator('[class*="_actionPanel_"] a').filter({ hasText: BT })
const aiOf = (page) => page.locator('[class*="_actionPanel_"] a').filter({ hasText: AI })
const linkReady = async (loc) => (await loc.count()) === 1
const usrState = (page) => page.evaluate(() => window.history.state?.usr ?? null)

/* ── 배치 ─────────────────────────────────────────────────────────── */

async function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
    const q = (s) => document.querySelector(s)
    const panel = q('[class*="_actionPanel_"]')
    const rows = panel ? [...panel.querySelectorAll('a')].map(rect) : []
    const heart = [...document.querySelectorAll('button')].find((b) => /^관심종목 (추가|해제)$/.test(b.getAttribute('aria-label') ?? ''))
    const chartBox = q('[class*="_chartBox_"]')
    const canvases = chartBox ? [...chartBox.querySelectorAll('canvas')].map(rect) : []
    return {
      panel: rect(panel), rows, heart: rect(heart ?? null), chart: rect(chartBox), summary: rect(q('[class*="_summaryCard_"]')),
      canvasRight: canvases.length === 0 ? null : Math.max(...canvases.map((c) => c.right)),
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    }
  })
}

async function layoutAt(browser, bname, width) {
  const { context, page, errors } = await setup(browser, { width })
  await until(() => page.locator('[class*="_chartBox_"] canvas').first().isVisible(), 8000)
  await until(() => linkReady(btOf(page)), 3000)
  await sleep(600)
  await page.evaluate(() => document.fonts.ready)
  const m = await measure(page)
  const id = `${bname}-L-${width}`
  report(`${id}-a`, m.rows.length === 2 && m.heart !== null && m.summary !== null, `바로 가기 행 ${m.rows.length}, 관심 토글 ${m.heart !== null}, 시세 요약 ${m.summary !== null}`)
  if (m.panel !== null && m.chart !== null) {
    // design/fresh-look(2026-10-30 M-8 "한 판"): 바로 가기는 모든 폭에서 머리 띠 안, 차트 위다
    // (2차 재정비 design/second-pass는 1100px 초과에서 차트 오른쪽 날개 위였다 — 채택되지 않아 2026-10-31에 기대값을 되돌렸다)
    const placed = m.panel.bottom <= m.chart.top + 0.5
    report(`${id}-b`, placed, `차트 위 패널(차트 ${Math.round(m.chart.left)}~${Math.round(m.chart.right)}·${Math.round(m.chart.top)}~${Math.round(m.chart.bottom)}, 패널 ${Math.round(m.panel.left)}·${Math.round(m.panel.top)}~${Math.round(m.panel.bottom)})`)
  }
  report(`${id}-c`, m.scrollW <= m.clientW, `가로 넘침 ${m.scrollW - m.clientW}px`)
  const minRow = width > 600 ? 40 : 44
  const small = [...m.rows, m.heart].filter((r) => r !== null && r.height < minRow).map((r) => Math.round(r.height))
  report(`${id}-d`, m.rows.length === 2 && small.length === 0, `${minRow}px 못 미침 ${JSON.stringify(small)}`)
  report(`${id}-e`, m.canvasRight !== null && m.chart !== null && m.canvasRight <= m.chart.right + 0.5,
    `차트 그림 오른쪽 ${m.canvasRight === null ? '-' : Math.round(m.canvasRight)} ≤ 칸 오른쪽 ${m.chart === null ? '-' : Math.round(m.chart.right)}`)
  report(`${id}-f`, errors.length === 0, `페이지 예외 ${JSON.stringify(errors)}`)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${bname}-detail-${width}.png`, fullPage: true })
  await context.close()
}

async function layoutGroup() {
  for (const width of [1280, 900, 390, 320]) await layoutAt(chrome, 'chrome', width)

  // 창을 줄이면 차트가 칸을 따라 줄어든다
  {
    // 두 열이 유지되는 폭끼리 견준다(1100px 이하는 한 열이라 차트 칸이 도리어 넓어진다 — 2026-10-30 재정비)
    const { context, page } = await setup(chrome, { width: 1440 })
    await until(() => page.locator('[class*="_chartBox_"] canvas').first().isVisible(), 8000)
    await sleep(500)
    const wide = await measure(page)
    await page.setViewportSize({ width: 1200, height: 900 })
    await sleep(700)
    const narrow = await measure(page)
    const ok = narrow.chart !== null && narrow.panel !== null && narrow.chart.width < wide.chart.width &&
      narrow.canvasRight <= narrow.chart.right + 0.5 && narrow.chart.right <= narrow.clientW + 0.5
    report('L-resize', ok, `차트 칸 ${Math.round(wide.chart?.width ?? 0)} → ${Math.round(narrow.chart?.width ?? 0)}, 그림 오른쪽 ${Math.round(narrow.canvasRight ?? 0)} ≤ 칸 ${Math.round(narrow.chart?.right ?? 0)} ≤ 화면 ${narrow.clientW}`)
    await context.close()
  }

  // 키보드 포커스가 보인다
  {
    const { context, page } = await setup(chrome, { width: 1280 })
    await until(() => linkReady(btOf(page)), 8000)
    let style = null
    for (let i = 0; i < 40 && style === null; i++) {
      await page.keyboard.press('Tab')
      style = await page.evaluate(() => {
        const el = document.activeElement
        if (!(el instanceof HTMLButtonElement) || !/^관심종목 (추가|해제)$/.test(el.getAttribute('aria-label') ?? '')) return null
        const cs = getComputedStyle(el)
        return { visible: el.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}` }
      })
    }
    report('L-focus', style !== null && style.visible && !/^none/.test(style.outline) && !/ 0px$/.test(style.outline), `탭으로 닿은 하트 ${JSON.stringify(style)}`)
    await context.close()
  }

  // 형식이 틀린 코드·없는 종목에는 버튼이 없다
  for (const path of ['/stocks/abc', '/stocks/999999']) {
    const { context, page } = await setup(chrome, { path })
    await until(() => page.getByText('목록에 없는 종목입니다').isVisible(), 6000)
    const n = await page.locator('[class*="_actionPanel_"]').count()
    const shown = await page.getByText('목록에 없는 종목입니다').isVisible()
    report(`L-none ${path}`, shown && n === 0, `없는 종목 안내 ${shown}, 버튼 칸 ${n}개`)
    await context.close()
  }

  // 이름을 모르면 백테스트·AI는 잠긴다(응답 전, 실어 온 이름 없음). 이름이 오면 풀린다
  {
    const { context, page } = await setup(chrome, { opts: { detailDelay: 2500 } })
    await sleep(900)
    const early = { bt: await btOf(page).count(), ai: await aiOf(page).count(), disabled: await page.locator('[class*="_actionPanel_"] [aria-disabled="true"]').count(), heart: await heartOf(page).isDisabled().catch(() => null) }
    await until(() => linkReady(btOf(page)), 5000)
    const late = { bt: await btOf(page).count(), ai: await aiOf(page).count() }
    report('L-name', early.bt === 0 && early.ai === 0 && early.disabled === 2 && early.heart === false && late.bt === 1 && late.ai === 1,
      `응답 전 링크 ${JSON.stringify(early)}, 응답 뒤 링크 ${JSON.stringify(late)}`)
    await context.close()
  }

  // 목록에서 이름을 실어 왔으면 응답 전에도 누를 수 있다
  {
    const { context, page } = await setup(chrome, { path: '/', opts: { detailDelay: 2500 } })
    await until(() => page.getByRole('link', { name: '삼성전자', exact: true }).first().isVisible(), 6000)
    await page.getByRole('link', { name: '삼성전자', exact: true }).first().click()
    await until(() => linkReady(btOf(page)), 3000)
    await sleep(300)
    const early = { bt: await btOf(page).count(), ai: await aiOf(page).count() }
    report('L-preview', early.bt === 1 && early.ai === 1, `목록에서 온 상세, 응답 전 링크 ${JSON.stringify(early)}`)
    await context.close()
  }

  // 관심종목 목록을 받는 중에는 하트를 누를 수 없다
  {
    const { context, page } = await setup(chrome, { opts: { likeListDelay: 2500 } })
    await until(() => heartOf(page).isVisible(), 4000)
    await sleep(500)
    const early = await heartOf(page).isDisabled().catch(() => null)
    await until(() => heartOf(page).isEnabled(), 5000)
    const late = await heartOf(page).isDisabled().catch(() => null)
    report('L-likeLoading', early === true && late === false, `받는 중 잠김 ${early}, 받은 뒤 잠김 ${late}`)
    await context.close()
  }
}

/* ── 관심종목 ─────────────────────────────────────────────────────── */

async function heartGroup() {
  // H1 처음 상태가 관심종목 목록과 같다
  for (const [code, , pressed] of [['005930', '삼성전자', 'true'], ['207940', '삼성바이오로직스', 'false']]) {
    const { context, page, log } = await setup(chrome, { path: `/stocks/${code}` })
    await until(() => heartOf(page).isEnabled(), 6000)
    await until(() => linkReady(btOf(page)), 6000)
    const p = await heartOf(page).getAttribute('aria-pressed')
    const label = await heartOf(page).getAttribute('aria-label')
    report(`H1 ${code}`, p === pressed && label === `관심종목 ${pressed === 'true' ? '해제' : '추가'}` && count(log, LIKE_GET) === 1,
      `aria-pressed ${p}(기대 ${pressed}), 이름 "${label}", 목록 GET ${count(log, LIKE_GET)}`)
    await context.close()
  }

  // H2 누르면 POST 1건, 다시 누르면 DELETE 1건. 화면을 옮기지 않는다
  {
    const { context, page, log } = await setup(chrome, { path: '/stocks/207940' })
    await until(() => heartOf(page).isEnabled(), 6000)
    await heartOf(page).click()
    await sleep(600)
    const a = { post: count(log, /^POST \/api\/members\/me\/like-stocks$/), pressed: await heartOf(page).getAttribute('aria-pressed'), path: new URL(page.url()).pathname }
    await heartOf(page).click()
    await sleep(600)
    const b = { del: count(log, /^DELETE \/api\/members\/me\/like-stocks\/207940$/), pressed: await heartOf(page).getAttribute('aria-pressed') }
    report('H2', a.post === 1 && a.pressed === 'true' && a.path === '/stocks/207940' && b.del === 1 && b.pressed === 'false',
      `추가 ${JSON.stringify(a)}, 해제 ${JSON.stringify(b)}`)
    await context.close()
  }

  // H3 500이면 되돌리고 role=status로 알린다(홈과 같은 문구)
  for (const [code, before, text] of [
    ['207940', 'false', '관심종목에 추가하지 못했어요. 잠시 후 다시 시도해 주세요.'],
    ['005930', 'true', '관심종목을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ]) {
    const { context, page } = await setup(chrome, { path: `/stocks/${code}`, opts: { likeWrite: '500' } })
    await until(() => heartOf(page).isEnabled(), 6000)
    await heartOf(page).click()
    await sleep(800)
    const pressed = await heartOf(page).getAttribute('aria-pressed')
    const status = await page.getByRole('status').filter({ hasText: text }).count()
    report(`H3 ${code}`, pressed === before && status === 1, `되돌린 상태 ${pressed}(기대 ${before}), 안내 ${status}`)
    await context.close()
  }

  // H4 요청 중 연타는 막는다
  {
    const { context, page, log } = await setup(chrome, { path: '/stocks/207940', opts: { likeWriteDelay: 800 } })
    await until(() => heartOf(page).isEnabled(), 6000)
    await heartOf(page).click()
    await heartOf(page).click({ force: true })
    await heartOf(page).click({ force: true })
    await sleep(1400)
    const post = count(log, /^POST \/api\/members\/me\/like-stocks$/)
    const del = count(log, /^DELETE /)
    report('H4', post === 1 && del === 0 && (await heartOf(page).getAttribute('aria-pressed')) === 'true', `연타 세 번 → POST ${post}, DELETE ${del}`)
    await context.close()
  }

  // H5 목록을 못 받으면 토글하지 않고 실패 안내 + 다시 시도
  {
    const { context, page, log } = await setup(chrome, { opts: { likeList: (n) => (n === 1 ? '500' : 'ok') } })
    await until(() => page.getByText('관심종목을 불러오지 못했습니다.').isVisible(), 6000)
    const disabled = await heartOf(page).isDisabled().catch(() => null)
    const writes = count(log, /^(POST|DELETE) \/api\/members/)
    await page.getByRole('button', { name: '다시 시도' }).click()
    await until(() => heartOf(page).isEnabled(), 4000)
    const after = { get: count(log, LIKE_GET), pressed: await heartOf(page).getAttribute('aria-pressed'), notice: await page.getByText('관심종목을 불러오지 못했습니다.').count() }
    report('H5', disabled === true && writes === 0 && after.get === 2 && after.pressed === 'true' && after.notice === 0,
      `실패 때 잠김 ${disabled}, 다시 시도 뒤 ${JSON.stringify(after)}`)
    await context.close()
  }

  // H6 비로그인은 요청 없이 로그인 안내 모달. 로그인하면 이 상세로 돌아온다
  {
    const { context, page, log } = await setup(chrome, { login: false })
    await until(() => linkReady(btOf(page)), 6000)
    const pressed = await heartOf(page).getAttribute('aria-pressed')
    await heartOf(page).click()
    await sleep(400)
    const dialog = page.getByRole('dialog')
    const text = await dialog.innerText().catch(() => '')
    const href = await dialog.getByRole('link', { name: '로그인' }).getAttribute('href').catch(() => null)
    await page.keyboard.press('Escape')
    await sleep(200)
    const closed = (await page.getByRole('dialog').count()) === 0
    report('H6', /로그인 후 이용 가능한 기능입니다/.test(text) && href === '/login?next=%2Fstocks%2F005930' && count(log, LIKE_ANY) === 0 && pressed === 'false' && closed,
      `모달 "${text.replace(/\s+/g, ' ')}", 로그인 링크 ${href}, 관심종목 요청 ${count(log, LIKE_ANY)}, 닫힘 ${closed}`)
    await context.close()
  }

  // H7 상세의 기존 요청 수·순서는 그대로고, 늘어나는 건 로그인했을 때의 관심종목 목록 GET 1건뿐이다
  if (BEFORE) {
    for (const login of [true, false]) {
      const runs = []
      for (const base of [BEFORE, BASE]) {
        const { context, page, log } = await setup(chrome, { base, login })
        await until(() => page.locator('[class*="_chartBox_"] canvas').first().isVisible(), 8000)
        await sleep(1500)
        runs.push([...log])
        await context.close()
      }
      const [before, after] = runs
      const rest = after.filter((l) => !LIKE_GET.test(l))
      const same = JSON.stringify(rest) === JSON.stringify(before)
      report(`H7 ${login ? '로그인' : '비로그인'}`, same && count(after, LIKE_GET) === (login ? 1 : 0) && count(before, LIKE_GET) === 0,
        `전 ${JSON.stringify(before)} / 후 ${JSON.stringify(after)}`)
    }
  }
}

/* ── 이 종목 백테스트 ─────────────────────────────────────────────── */

async function toBacktest(opts = {}, login = true, base = BASE) {
  const s = await setup(chrome, { base, login, opts })
  await until(() => linkReady(btOf(s.page)), 8000)
  await btOf(s.page).click()
  await until(() => new URL(s.page.url()).pathname === '/backtest', 4000)
  await sleep(2200)
  return s
}
const formOf = (page) => page.evaluate(() => ({
  stock: document.querySelector('#backtest-stock')?.value ?? null,
  strategy: document.querySelector('#backtest-strategy')?.value ?? null,
  period: document.querySelector('#backtest-period')?.value ?? null,
}))

async function backtestGroup() {
  // 손으로 실행할 때의 요청(1년)
  let manual = []
  {
    const { context, page, log } = await setup(chrome, { path: '/backtest' })
    await until(() => page.locator('#backtest-strategy').inputValue().then((v) => v === '3'), 6000)
    await page.locator('#backtest-stock').fill('삼성전자')
    await page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
    await page.locator('#backtest-period').selectOption('ONE_YEAR')
    await page.locator('[class*="submit"]').first().click()
    await sleep(1500)
    manual = log.filter((l) => PRESET.test(l) || RUN.test(l)).sort()
    await context.close()
  }

  // QB1 로그인 + 성향: 종목·추천 전략·1년이 채워지고 손으로 할 때와 같은 요청이 한 번 나가 결과가 뜬다
  {
    const { context, page, log, errors } = await toBacktest()
    const form = await formOf(page)
    const auto = log.filter((l) => PRESET.test(l) || RUN.test(l)).sort()
    const ranks = await page.locator('[class*="rankScore"]').count()
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    const usr = await usrState(page)
    report('QB1-a', form.stock === '삼성전자' && form.strategy === '3' && form.period === 'ONE_YEAR', `채운 값 ${JSON.stringify(form)}`)
    report('QB1-b', auto.length === 5 && JSON.stringify(auto) === JSON.stringify(manual), `자동 ${auto.length}건 / 손 ${manual.length}건, 같음 ${JSON.stringify(auto) === JSON.stringify(manual)}`)
    report('QB1-c', ranks === 5 && /적합도/.test(text) && usr === null && errors.length === 0, `순위 ${ranks}, 결과 ${/적합도/.test(text)}, 남은 state ${JSON.stringify(usr)}, 예외 ${errors.length}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chrome-backtest-auto-1280.png`, fullPage: true })

    // QB2 새로고침해도 다시 나가지 않는다
    const n0 = count(log, PRESET)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2500)
    const reloaded = await formOf(page)
    report('QB2', count(log, PRESET) === n0 && reloaded.stock === '', `새로고침 뒤 추가 요청 ${count(log, PRESET) - n0}, 종목칸 "${reloaded.stock}"`)

    // QB3 뒤로 갔다 앞으로 와도 다시 나가지 않는다
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await sleep(1500)
    const backPath = new URL(page.url()).pathname
    await page.goForward({ waitUntil: 'domcontentloaded' })
    await sleep(2500)
    report('QB3', backPath === '/stocks/005930' && count(log, PRESET) === n0 && new URL(page.url()).pathname === '/backtest',
      `뒤로 ${backPath} → 앞으로, 추가 요청 ${count(log, PRESET) - n0}`)
    await context.close()
  }

  // QB4~6 성향 없음·성향 못 받음·비로그인: 종목만 채우고 멈춘다
  for (const [id, opts, login, banner] of [
    ['QB4 성향 없음', { personality: 'none' }, true, /투자성향테스트를 아직 안 하셨어요/],
    ['QB6 성향 실패', { personality: 'error' }, true, /성향을 불러오지 못했어요/],
  ]) {
    const { context, page, log } = await toBacktest(opts, login)
    const form = await formOf(page)
    const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
    report(id, form.stock === '삼성전자' && form.strategy === '' && count(log, PRESET) + count(log, RUN) === 0 && banner.test(text),
      `채운 값 ${JSON.stringify(form)}, 실행 요청 ${count(log, PRESET) + count(log, RUN)}, 배너 ${banner.test(text)}`)
    await context.close()
  }

  // QB5 비로그인은 행이 로그인으로 간다("로그인 필요", 2026-10-29 리디자인 U-3). 로그인하면 이 상세로 돌아온다
  {
    const s = await setup(chrome, { login: false })
    const row = s.page.locator('[class*="_actionPanel_"] a').filter({ hasText: BT })
    await until(() => linkReady(row), 6000)
    await row.click()
    await until(() => new URL(s.page.url()).pathname === '/login', 4000)
    const u = new URL(s.page.url())
    report('QB5 비로그인', u.pathname === '/login' && u.searchParams.get('next') === '/stocks/005930' && count(s.log, PRESET) + count(s.log, RUN) === 0,
      `이동 ${u.pathname}${u.search}, 실행 요청 ${count(s.log, PRESET) + count(s.log, RUN)}`)
    await s.context.close()
  }

  // QB7 실행 전에 사용자가 전략·종목을 건드리면 자동 실행은 취소한다
  for (const [id, touch] of [
    ['QB7 전략', (page) => page.locator('#backtest-strategy').selectOption('1')],
    ['QB7 종목', (page) => page.locator('#backtest-stock').fill('SK')],
  ]) {
    const s = await setup(chrome, { opts: { personalityDelay: 2500 } })
    await until(() => linkReady(btOf(s.page)), 8000)
    // 상세에서 받은 성향 요청이 없으니 지연은 백테스트 화면의 성향 요청에 걸린다
    await btOf(s.page).click()
    await until(() => new URL(s.page.url()).pathname === '/backtest', 4000)
    await sleep(300)
    await touch(s.page)
    await sleep(3500)
    const form = await formOf(s.page)
    report(id, count(s.log, PRESET) + count(s.log, RUN) === 0, `건드린 뒤 ${JSON.stringify(form)}, 실행 요청 ${count(s.log, PRESET) + count(s.log, RUN)}`)
    await s.context.close()
  }

  // QB8 추천 전략의 선택지에 1년이 없으면 기간을 비우고 실행하지 않는다
  {
    const { context, page, log } = await toBacktest({ optionsPeriods: (t) => (t === 3 ? ['ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS'] : ['ONE_YEAR']) })
    const form = await formOf(page)
    report('QB8', form.stock === '삼성전자' && form.strategy === '3' && form.period === '' && count(log, PRESET) + count(log, RUN) === 0,
      `채운 값 ${JSON.stringify(form)}, 실행 요청 ${count(log, PRESET) + count(log, RUN)}`)
    await context.close()
  }

  // QB9 개발 서버(StrictMode)에서도 한 번
  if (DEV) {
    const { context, page, log } = await toBacktest({}, true, DEV)
    await sleep(1500)
    const form = await formOf(page)
    report('QB9 개발', count(log, PRESET) === 5 && form.period === 'ONE_YEAR' && (await page.locator('[class*="rankScore"]').count()) === 5,
      `프리셋 ${count(log, PRESET)}건, ${JSON.stringify(form)}`)
    await context.close()
  }
}

/* ── AI에게 물어보기 ──────────────────────────────────────────────── */

async function toAi(opts = {}, login = true, base = BASE) {
  const s = await setup(chrome, { base, login, opts })
  await until(() => linkReady(aiOf(s.page)), 8000)
  await aiOf(s.page).click()
  await until(() => new URL(s.page.url()).pathname === '/ai', 4000)
  return s
}

async function aiGroup() {
  // QA1 로그인: 새 방 1건 + 질문 1건(문장·종목명). 다음 질문에는 종목명이 없다
  {
    const { context, page, log, errors } = await toAi()
    // AI 답 글. 뉴스 요약("짧은 요약입니다.")과 섞이지 않게 대화 칸 안에서 찾는다
    await until(() => log.asks.length === 1 && page.locator('section[class*="_chat_"]').getByText('요약입니다').first().isVisible(), 6000)
    const first = log.asks[0] ?? null
    const usr = await usrState(page)
    report('QA1-a', count(log, SESSION_POST) === 1 && count(log, ASK) === 1 && first?.question === QUESTION && first?.stockName === '삼성전자' && first?.chatSessionId === 2,
      `방 ${count(log, SESSION_POST)}건, 질문 ${count(log, ASK)}건, 본문 ${JSON.stringify(first)}`)
    // 사이드바의 방 제목도 같은 글이다(서버가 첫 질문 앞 30자로 짓는다). 대화 칸 안에서만 센다
    const bubble = await page.locator('section[class*="_chat_"]').getByText(QUESTION, { exact: true }).count()
    report('QA1-b', bubble === 1 && usr === null && errors.length === 0, `질문 말풍선 ${bubble}, 남은 state ${JSON.stringify(usr)}, 예외 ${errors.length}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chrome-ai-auto-1280.png`, fullPage: true })
    await page.getByRole('textbox', { name: '질문 입력' }).fill('그 종목 전망은?')
    await page.getByRole('button', { name: '보내기' }).click()
    await until(() => log.asks.length === 2, 5000)
    const second = log.asks[1] ?? null
    report('QA1-c', second?.stockName === null && second?.chatSessionId === 2 && count(log, SESSION_POST) === 1, `다음 질문 본문 ${JSON.stringify(second)}`)
    await context.close()
  }

  // QA2·QA3 새로고침·뒤로 갔다 앞으로 와도 방이 또 생기거나 AI가 또 불리지 않는다
  {
    const { context, page, log } = await toAi()
    await until(() => log.asks.length === 1, 6000)
    await sleep(500)
    const n = [count(log, SESSION_POST), count(log, ASK)]
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2500)
    const r = [count(log, SESSION_POST), count(log, ASK)]
    const input = await page.getByRole('textbox', { name: '질문 입력' }).inputValue()
    report('QA2', JSON.stringify(r) === JSON.stringify(n) && input === '', `새로고침 전 ${JSON.stringify(n)} → 뒤 ${JSON.stringify(r)}, 입력칸 "${input}"`)
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await sleep(1500)
    await page.goForward({ waitUntil: 'domcontentloaded' })
    await sleep(2500)
    const f = [count(log, SESSION_POST), count(log, ASK)]
    report('QA3', JSON.stringify(f) === JSON.stringify(n) && new URL(page.url()).pathname === '/ai', `뒤로·앞으로 뒤 ${JSON.stringify(f)}`)
    await context.close()
  }

  // QA4 비로그인은 행이 로그인으로 간다(U-3). 대화 요청은 없다
  {
    const s = await setup(chrome, { login: false })
    const row = s.page.locator('[class*="_actionPanel_"] a').filter({ hasText: AI })
    await until(() => linkReady(row), 6000)
    await row.click()
    await until(() => new URL(s.page.url()).pathname === '/login', 4000)
    const u = new URL(s.page.url())
    const chat = count(s.log, /chat-sessions|open-ai/)
    report('QA4', u.pathname === '/login' && u.searchParams.get('next') === '/stocks/005930' && chat === 0, `이동 ${u.pathname}${u.search}, 대화 요청 ${chat}`)
    await s.context.close()
  }

  // QA5 대화방 목록을 받는 중에는 보내지 않고, 목록이 오면 보낸다
  {
    const { context, page, log } = await toAi({ sessionsDelay: 2000 })
    await sleep(900)
    const early = [count(log, SESSION_POST), count(log, ASK)]
    await until(() => log.asks.length === 1, 6000)
    await sleep(300)
    const late = [count(log, SESSION_POST), count(log, ASK)]
    const listed = await page.getByText(QUESTION.slice(0, 10)).count()
    report('QA5', JSON.stringify(early) === '[0,0]' && JSON.stringify(late) === '[1,1]', `목록 오기 전 ${JSON.stringify(early)}, 온 뒤 ${JSON.stringify(late)}, 화면의 질문 글 ${listed}`)
    await context.close()
  }

  // QA6 개발 서버(StrictMode)에서도 1건씩
  if (DEV) {
    const { context, log } = await toAi({}, true, DEV)
    await until(() => log.asks.length >= 1, 8000)
    await sleep(2000)
    report('QA6 개발', count(log, SESSION_POST) === 1 && count(log, ASK) === 1 && log.asks[0]?.stockName === '삼성전자',
      `방 ${count(log, SESSION_POST)}건, 질문 ${count(log, ASK)}건`)
    await context.close()
  }
}

/* ── 기존 동작 ───────────────────────────────────────────────────── */

async function regressGroup() {
  // 상세의 기간 탭·뉴스·차트
  {
    const { context, page, errors, log } = await setup(chrome)
    await until(() => page.locator('[class*="_chartBox_"] canvas').first().isVisible(), 8000)
    await page.getByRole('tab', { name: '1년' }).click()
    await sleep(300)
    const selected = await page.getByRole('tab', { name: '1년' }).getAttribute('aria-selected')
    // 뉴스는 6건씩 펼친다(2026-10-29 리디자인 U-4는 5건 — 2026-11-02 넓은 칸 두 줄이 둘씩 짝이 맞게 6건). 받아 둔 10건을 다 펼친 뒤에야 다음 페이지를 묻는다
    await until(() => page.getByText('관련 기사 6', { exact: true }).isVisible(), 5000)
    const first = await page.getByText(/^관련 기사 \d+$/).count()
    const newsReq = () => log.filter((l) => /\/news\?/.test(l)).length
    const r0 = newsReq()
    await page.getByRole('button', { name: '뉴스 더 보기' }).click()
    await sleep(400)
    const second = { shown: await page.getByText(/^관련 기사 \d+$/).count(), req: newsReq() - r0 }
    await page.getByRole('button', { name: '뉴스 더 보기' }).click()
    await sleep(800)
    const third = { shown: await page.getByText(/^관련 기사 \d+$/).count(), req: newsReq() - r0, page1: log.some((l) => /\/news\?sort=LATEST&page=1/.test(l)) }
    report('R1 상세', selected === 'true' && first === 6 && second.shown === 10 && second.req === 0 && third.req === 1 && third.page1 && third.shown === 18 && errors.length === 0,
      `1년 탭 ${selected}, 기사 처음 ${first} → 더 보기 ${JSON.stringify(second)} → 다시 ${JSON.stringify(third)}, 예외 ${errors.length}`)
    const canvas = page.locator('[class*="_chartBox_"] canvas').first()
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(200)
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4)
    await sleep(300)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/legend-hover.png`, clip: { x: box.x - 20, y: box.y - 20, width: 520, height: 120 } })
    await context.close()
  }
  // AI 손으로 질문: 종목명은 싣지 않는다
  {
    const { context, page, log } = await setup(chrome, { path: '/ai' })
    await until(() => page.getByText('삼성전자 주가 어때?').first().isVisible(), 5000)
    await page.getByRole('textbox', { name: '질문 입력' }).fill('삼성전자 주가 어때?')
    await page.getByRole('button', { name: '보내기' }).click()
    await until(() => log.asks.length === 1, 5000)
    report('R2 AI', count(log, SESSION_POST) === 1 && log.asks[0]?.stockName === null && log.asks[0]?.question === '삼성전자 주가 어때?', `본문 ${JSON.stringify(log.asks[0] ?? null)}`)
    await context.close()
  }
  // 홈 하트
  {
    const { context, page, log } = await setup(chrome, { path: '/' })
    await until(() => page.getByRole('button', { name: '삼성전자 관심종목 해제' }).isVisible(), 6000)
    await page.getByRole('button', { name: '삼성전자 관심종목 해제' }).click()
    await sleep(600)
    report('R3 홈 하트', count(log, /^DELETE \/api\/members\/me\/like-stocks\/005930$/) === 1 && (await page.getByRole('button', { name: '삼성전자 관심종목 추가' }).count()) === 1,
      `DELETE ${count(log, /^DELETE /)}`)
    await context.close()
  }
}

/* ── 그 밖의 경우 ─────────────────────────────────────────────────── */

async function extraGroup() {
  // E1 관심종목 목록이 401(토큰 만료)이어도 공개 화면이라 로그인 화면으로 끌고 가지 않는다. 토큰을 지우고 비로그인이 된다
  {
    const { context, page, log } = await setup(chrome, { opts: { likeList: '401' } })
    await sleep(2500)
    const path = new URL(page.url()).pathname
    const token = await page.evaluate(() => localStorage.getItem('accessToken'))
    const enabled = await heartOf(page).isEnabled().catch(() => null)
    await heartOf(page).click().catch(() => {})
    await sleep(300)
    const dialog = await page.getByRole('dialog').count()
    report('E1', path === '/stocks/005930' && token === null && enabled === true && dialog === 1 && count(log, LIKE_GET) === 1,
      `주소 ${path}, 토큰 ${token}, 하트 누를 수 있음 ${enabled}, 누르면 로그인 안내 ${dialog}, 목록 GET ${count(log, LIKE_GET)}`)
    await context.close()
  }
  // E2 상세가 실패해도(4xx) 바로 가기는 실패 상자 옆에 있고, 목록에서 이름을 실어 왔으면 백테스트·AI를 누를 수 있다
  for (const width of [1280, 390]) {
    const { context, page } = await setup(chrome, { path: '/', width, opts: { detailStatus: 400 } })
    await until(() => page.getByRole('link', { name: '삼성전자', exact: true }).first().isVisible(), 6000)
    await page.getByRole('link', { name: '삼성전자', exact: true }).first().click()
    await until(() => page.getByText('차트를 불러오지 못했습니다').isVisible(), 6000)
    await sleep(300)
    const m = await measure(page)
    const placed = m.panel !== null && m.chart !== null && m.panel.bottom <= m.chart.top + 0.5
    report(`E2 ${width}`, m.rows.length === 2 && m.heart !== null && placed && m.scrollW <= m.clientW, `바로 가기 링크 ${m.rows.length}, 관심 토글 ${m.heart !== null}, 자리 ${placed}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chrome-detail-failed-${width}.png` })
    await context.close()
  }
}

/* ── WebKit ──────────────────────────────────────────────────────── */

async function webkitGroup() {
  wk = await webkit.launch()
  for (const width of [1280, 900, 390, 320]) await layoutAt(wk, 'webkit', width)
  {
    const { context, page, log } = await setup(wk, { path: '/stocks/207940' })
    await until(() => heartOf(page).isEnabled(), 6000)
    await heartOf(page).click()
    await sleep(600)
    report('W-heart', count(log, /^POST \/api\/members\/me\/like-stocks$/) === 1 && (await heartOf(page).getAttribute('aria-pressed')) === 'true', `POST ${count(log, /^POST /)}`)
    await context.close()
  }
  {
    const { context, page, log } = await setup(wk)
    await until(() => linkReady(btOf(page)), 8000)
    await btOf(page).click()
    await until(() => new URL(page.url()).pathname === '/backtest', 4000)
    await sleep(2200)
    const form = await formOf(page)
    report('W-backtest', count(log, PRESET) === 5 && form.period === 'ONE_YEAR' && form.strategy === '3', `프리셋 ${count(log, PRESET)}, ${JSON.stringify(form)}`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/webkit-backtest-auto-1280.png` })
    await context.close()
  }
  {
    const { context, page, log } = await setup(wk)
    await until(() => linkReady(aiOf(page)), 8000)
    await aiOf(page).click()
    await until(() => log.asks.length === 1, 6000)
    await sleep(500)
    report('W-ai', count(log, SESSION_POST) === 1 && count(log, ASK) === 1 && log.asks[0]?.stockName === '삼성전자', `방 ${count(log, SESSION_POST)}, 질문 ${count(log, ASK)}`)
    await context.close()
  }
}

const GROUPS = { layout: layoutGroup, heart: heartGroup, backtest: backtestGroup, ai: aiGroup, regress: regressGroup, extra: extraGroup, webkit: webkitGroup }
for (const [name, run] of Object.entries(GROUPS)) {
  if (!ONLY.includes(name)) continue
  try {
    await run()
  } catch (error) {
    report(`${name} 묶음`, false, `도중에 멈춤: ${String(error.message ?? error).split('\n')[0]}`)
  }
}

await chrome.close()
await wk?.close()
console.log(`quick PASS ${out.filter((l) => l.startsWith('PASS')).length} FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`)
