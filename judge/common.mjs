// 16화면 공통 판정(2026-10-30 디자인 재정비 D-1~D-5 때 만듦) — 색 리터럴·대비·포커스·누르는 넓이·가로 넘침·등락 색 오용·요청 순서·실제 백엔드.
// /api는 전부 가짜(mock.mjs), 백엔드 호스트는 막는다.
// node common.mjs <BASE> <MODE> [--out DIR] [--repo DIR] [--only 화면,화면] [--api 기록.json]
//   MODE shots  : 화면마다 1920·1440·375(첫 화면 + 전체 길이) 캡처를 --out에 남긴다
//   MODE apilog : 화면마다 /api 요청 순서를 --api JSON(기본 expect/api-order.json)에 남긴다 — 구조를 바꾸기 전에 기록해 둔다
//   MODE judge  : 공통 판정 1~8. 7번은 --api 기록과 요청 순서를 견준다(글자까지 같아야 한다)
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mock, seedLogin } from './mock.mjs'
import { REPO as REPO_ROOT } from './lib.mjs'

const args = process.argv.slice(2)
const [BASE, MODE] = args
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const OUT = flag('--out')
const REPO = flag('--repo') ?? REPO_ROOT.replace(/\/$/, '')
/** 화면 아래 지수 띠의 요청(지수·실시간 연결)은 모든 화면 뒤에서 돌아 순서 비교에서 뺀다(market.mjs가 따로 본다) */
const STREAM_LINE = /^GET \/api\/(stream\/|market-indices)/
const API = flag('--api') ?? join(REPO_ROOT, 'judge/expect/api-order.json')
const ONLY = flag('--only')?.split(',') ?? null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const realHits = []
let blockedTotal = 0
const report = (id, ok, msg) => { const line = `${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`; results.push(line); console.log(line) }

// [이름, 로그인, 경로, 여는 동작]. 홈·상세는 로그인(관심종목·토큰 심기 포함), 로그인·성향테스트는 비로그인도 본다
const handoff = (label) => async (page) => {
  await page.goto(BASE + '/stocks/005930', { waitUntil: 'domcontentloaded' }); await sleep(1500)
  await page.getByRole('link', { name: label }).first().click(); await sleep(2500)
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(200)
}
const go = (path, wait = 1600) => async (page) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await sleep(wait) }
const SCREENS = [
  ['home', true, go('/')],
  ['stock', true, go('/stocks/005930', 2000)],
  ['likes', true, go('/likes')],
  ['backtest', true, handoff('이 종목 백테스트')],
  ['backtest-empty', true, go('/backtest')],
  ['ai', true, handoff('AI에게 물어보기')],
  ['guide', true, go('/guide')],
  ['mypage-personality', true, go('/mypage/personality')],
  ['mypage-likes', true, go('/mypage/likes')],
  ['mypage-profile', true, go('/mypage/profile')],
  ['personality-test', true, go('/personality-test')],
  ['home-out', false, go('/')],
  ['backtest-out', false, go('/backtest')],
  ['ai-out', false, go('/ai')],
  ['login', false, go('/login', 1200)],
  ['not-found', false, go('/nope', 1200)],
].filter(([name]) => ONLY === null || ONLY.includes(name))

const browser = await chromium.launch({ channel: 'chrome' })
async function open([name, login, run], width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: MODE === 'shots' ? 2 : 1 })
  await seedLogin(context, login)
  const log = await mock(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.headers()['x-vercel-id']) { realHits.push(`${name} ${u.pathname}`); console.log('!! 실제 응답:', u.pathname) } })
  await run(page)
  await page.evaluate(() => document.fonts.ready)
  return { page, log, errors, close: async () => { blockedTotal += log.filter((l) => l.startsWith('BLOCKED')).length; await context.close() } }
}

const TOOLS = `
window.__lum = (rgb) => { const m = rgb.match(/[\\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
window.__alpha = (rgb) => { const m = rgb.match(/[\\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1 }
window.__bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (window.__alpha(c) > 0) return c } return getComputedStyle(document.body).backgroundColor }
window.__visible = (el) => { const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || el.getClientRects().length === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
`
const tools = (page) => page.addScriptTag({ content: TOOLS })

/* 1. 토큰 파일 밖 색 리터럴 */
function literals() {
  const files = []
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(css|ts|tsx)$/.test(f)) files.push(p) } }
  walk(join(REPO, 'src'))
  const hits = []
  for (const f of files) {
    if (f.endsWith('/src/index.css')) continue
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    for (const x of text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) ?? []) hits.push(`${f.replace(REPO + '/', '')} ${x}`)
  }
  return hits
}

/* 2. 보이는 글자의 대비 */
async function contrast(page) {
  return page.evaluate(() => {
    const low = [], disabledLow = []
    let checked = 0
    const consider = (el, color, label) => {
      const cs = getComputedStyle(el)
      let opacity = 1
      for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity)
      const bg = window.__bgOf(el)
      const a = window.__lum(color), b = window.__lum(bg)
      let ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const alpha = window.__alpha(color) * opacity
      if (alpha < 1) ratio = 1 + (ratio - 1) * alpha
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
      checked += 1
      if (ratio < need) (el.closest('[disabled], [aria-disabled="true"]') ? disabledLow : low).push(`${label.slice(0, 16)}(${ratio.toFixed(2)}, ${color} on ${bg}, ${size}px)`)
    }
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg, canvas, [aria-hidden="true"]')) continue
      if (/^JUBY$/.test(el.textContent.trim())) continue
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')) continue
      if (!window.__visible(el)) continue
      consider(el, getComputedStyle(el).color, el.textContent.trim())
    }
    for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
      if (!window.__visible(el) || el.value !== '') continue
      consider(el, getComputedStyle(el, '::placeholder').color, `[안내] ${el.placeholder}`)
    }
    return { checked, low, disabledLow }
  })
}

/* 3. 키보드 Tab 포커스가 보인다 */
async function focusRings(page, max = 90) {
  await page.evaluate(() => {
    const SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const snap = (e) => { const cs = getComputedStyle(e); return `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}|${cs.boxShadow}|${cs.borderTopColor}|${cs.backgroundColor}` }
    window.__snaps = new Map()
    document.querySelectorAll(SEL).forEach((el, i) => { el.dataset.fi = String(i); window.__snaps.set(String(i), [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean).map(snap)) })
  })
  const seen = new Set(), bad = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body || !el.dataset.fi) return null
      const snap = (e) => { const cs = getComputedStyle(e); return `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}|${cs.boxShadow}|${cs.borderTopColor}|${cs.backgroundColor}` }
      const chain = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean)
      const before = window.__snaps.get(el.dataset.fi)
      const cs = getComputedStyle(el)
      const own = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && window.__alpha(cs.outlineColor) > 0
      const pseudo = ['::before', '::after'].some((p) => { const ps = getComputedStyle(el, p); return ps.outlineStyle !== 'none' && parseFloat(ps.outlineWidth) > 0 })
      return { id: el.dataset.fi, ok: own || pseudo || chain.some((e, k) => before && snap(e) !== before[k]), label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? el.placeholder ?? '').trim().slice(0, 14)}"` }
    })
    if (r === null) continue
    if (seen.has(r.id)) break
    seen.add(r.id)
    if (!r.ok) bad.push(r.label)
  }
  return { count: seen.size, bad }
}

/* 4. 375 폭에서 누르는 대상 높이 */
async function targets(page, min = 44) {
  return page.evaluate(async (min) => {
    const small = []
    let n = 0
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="tab"]')) {
      if (!window.__visible(el)) continue
      const p = el.parentElement
      if (el.tagName === 'A' && p && ['P', 'LI', 'SPAN'].includes(p.tagName) && [...p.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() !== '')) continue
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = r.top + r.height / 2
      const inside = (y) => { const hit = document.elementFromPoint(x, y); return hit !== null && (hit === el || el.contains(hit)) }
      if (!inside(cy)) continue
      let up = 0, down = 0
      while (up < 40 && inside(cy - up - 1)) up += 1
      while (down < 40 && inside(cy + down + 1)) down += 1
      n += 1
      if (up + down + 1 < min) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? el.placeholder ?? '').trim().slice(0, 12)}" ${up + down + 1}px`)
    }
    window.scrollTo(0, 0)
    return { n, small }
  }, min)
}

/* 6. 등락 빨강·파랑이 등락이 아닌 곳 */
const MARKET = ['rgb(240, 68, 82)', 'rgb(217, 40, 58)', 'rgb(49, 130, 246)', 'rgb(27, 100, 218)', 'rgb(255, 163, 171)', 'rgb(156, 195, 255)']
async function marketMisuse(page) {
  return page.evaluate((colors) => {
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor', 'fill', 'stroke']
    // 숫자(등락률·가격)와 그림(차트·지도 칸)·등락 낱말은 등락 색이 맞다. 단추·링크·탭·하트·안내를 칠한 것만 센다
    // 지수 띠의 "-74.78(-1.24%)"처럼 숫자 여럿이 붙은 글도 숫자로 본다
    const RATE = /^([+\-−]?\s?[\d,.]+\s?(%|원|주|만주|개)?\s?[()]?\s?)+$/
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (!window.__visible(el) || el.closest('canvas, svg[aria-hidden="true"]')) continue
      const cs = getComputedStyle(el)
      const hit = props.filter((p) => colors.includes(cs[p]) && !(p.startsWith('border') && parseFloat(cs[p.replace('Color', 'Width')]) === 0) && !(p === 'outlineColor' && (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0)))
      if (hit.length === 0) continue
      const text = el.textContent.trim()
      if (RATE.test(text) || el.closest('[data-market]') !== null) continue
      out.push(`${el.tagName.toLowerCase()} "${text.slice(0, 14)}" ${hit.join('/')}`)
    }
    return out
  }, MARKET)
}

const before = API && existsSync(API) ? JSON.parse(readFileSync(API, 'utf8')) : null
const apiLogs = {}

if (MODE === 'judge') {
  const lits = literals()
  report('1 리터럴', lits.length === 0, `${lits.length}건 ${JSON.stringify(lits.slice(0, 30))}`)
}
for (const screen of SCREENS) {
  const [name] = screen
  if (MODE === 'shots') {
    mkdirSync(OUT, { recursive: true })
    for (const [w, h] of [[1920, 1080], [1440, 900], [375, 812]]) {
      const s = await open(screen, w, h)
      await s.page.screenshot({ path: `${OUT}/${name}-${w}-first.png` })
      await s.page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true })
      console.log(`${name}-${w}: ${s.errors.length ? 'ERRORS ' + JSON.stringify(s.errors) : 'ok'}`)
      await s.close()
    }
    continue
  }
  if (MODE === 'apilog') {
    const s = await open(screen, 1440, 900)
    apiLogs[name] = s.log.filter((l) => !l.startsWith('BLOCKED') && !STREAM_LINE.test(l))
    console.log(`${name}: ${apiLogs[name].length}건 ${JSON.stringify(apiLogs[name])}`)
    await s.close()
    continue
  }
  // judge
  const s = await open(screen, 1440, 900)
  await tools(s.page)
  if (s.errors.length) report(`0 ${name}`, false, `페이지 오류 ${JSON.stringify(s.errors)}`)
  const c1440 = await contrast(s.page)
  const f = await focusRings(s.page)
  const m = await marketMisuse(s.page)
  const log = s.log.filter((l) => !l.startsWith('BLOCKED') && !STREAM_LINE.test(l))
  await s.close()
  const s375 = await open(screen, 375, 812)
  await tools(s375.page)
  const c375 = await contrast(s375.page)
  const t = await targets(s375.page)
  await s375.close()
  const low = [...c1440.low.map((x) => '1440 ' + x), ...c375.low.map((x) => '375 ' + x)]
  report(`2 대비 ${name}`, low.length === 0, `글자 ${c1440.checked}+${c375.checked}개 중 미만 ${low.length} ${JSON.stringify(low.slice(0, 6))}${c1440.disabledLow.length + c375.disabledLow.length ? ` · 비활성(예외) ${c1440.disabledLow.length + c375.disabledLow.length}` : ''}`)
  report(`3 포커스 ${name}`, f.bad.length === 0 && f.count > 0, `Tab ${f.count}곳 중 안 보임 ${f.bad.length} ${JSON.stringify(f.bad.slice(0, 6))}`)
  report(`4 누르는 넓이 ${name}`, t.small.length === 0, `375 폭 ${t.n}곳 중 44px 미만 ${t.small.length} ${JSON.stringify(t.small.slice(0, 8))}`)
  const over = []
  for (const [w, h] of [[320, 640], [375, 812], [1440, 900], [1920, 1080]]) {
    const o = await open(screen, w, h)
    const px = await o.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    if (px > 0) over.push(`${w}:${px}px`)
    await o.close()
  }
  report(`5 가로 넘침 ${name}`, over.length === 0, over.length ? over.join(' ') : '320·375·1440·1920 모두 0')
  report(`6 등락 색 오용 ${name}`, m.length === 0, `${m.length} ${JSON.stringify(m.slice(0, 8))}`)
  // 2026-10-30의 "예정된 차이"(주식 모아보기 1건) 분기는 기록이 그 뒤로 갱신돼 걷었다(2026-10-31)
  if (before) {
    const was = before[name]
    if (was === undefined) report(`7 요청 ${name}`, null, `고치기 전 기록 없음(새 화면) — 지금 ${JSON.stringify(log)}`)
    else report(`7 요청 ${name}`, JSON.stringify(was) === JSON.stringify(log), JSON.stringify(was) === JSON.stringify(log) ? `${log.length}건 같음` : `전 ${JSON.stringify(was)} → 후 ${JSON.stringify(log)}`)
  }
}
if (MODE === 'apilog') writeFileSync(API, JSON.stringify(apiLogs, null, 1))
if (MODE === 'judge') {
  report('8 실제 백엔드', realHits.length === 0, `실제 응답 ${realHits.length} ${JSON.stringify(realHits)} · 백엔드 호스트로 나가려다 막힘 ${blockedTotal}`)
  const fails = results.filter((l) => l.startsWith('FAIL')).length
  console.log(`\n합계: PASS ${results.filter((l) => l.startsWith('PASS')).length} · FAIL ${fails} · INFO ${results.filter((l) => l.startsWith('INFO')).length}`)
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/judge.txt`, results.join('\n') + '\n') }
}
await browser.close()
