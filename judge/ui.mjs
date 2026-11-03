// UI 리디자인 판정(2026-10-29 지시서 U-1~U-7). /api는 전부 가짜(mock.mjs), 백엔드 호스트는 막는다.
// node ui.mjs <BASE> [--only u1,u2,u3,u4,u5,u6,u7,shots] [--shots <DIR>] [--repo <저장소>]
// 기대값은 docs/UI-리디자인-결과-2026-10-29.md 1절. 2026-10-30 재정비(흰 바탕·바로 가기는 머리 띠·큰 가격은 넓은 글꼴)와 주식 모아보기 지도 칸·
// 등락 수("N개")는 2026-10-31에 그 규칙대로 기대값을 고쳤다(CLAUDE.md "잔가지"). 실제 응답이 섞이면 "!! 실제 응답"을 찍는다.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { mock, seedLogin } from './mock.mjs'

const args = process.argv.slice(2)
const BASE = args[0]
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1] }
const ONLY = (flag('--only') ?? 'u1,u2,u3,u4,u5,u6,u7').split(',')
const SHOTS = flag('--shots')
const REPO = flag('--repo') ?? fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const realHits = []
let blocked = 0
function report(id, ok, msg) {
  const line = `${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`
  out.push(line)
  console.log(line)
}
const browser = await chromium.launch({ channel: 'chrome' })

const LOGGED_OUT_PAGES = [['home', '/'], ['stock', '/stocks/005930'], ['backtest', '/backtest'], ['ai', '/ai'], ['guide', '/guide'],
  ['personality-test', '/personality-test'], ['login', '/login'], ['not-found', '/nope']]
const LOGGED_IN_PAGES = [['mypage-personality', '/mypage/personality'], ['mypage-likes', '/mypage/likes'], ['mypage-profile', '/mypage/profile'],
  ['ai-in', '/ai'], ['backtest-in', '/backtest']]

async function open(path, { width = 1440, height = 900, login = false, opts = {}, wait = 1500 } = {}) {
  const context = await browser.newContext({ viewport: { width, height } })
  await seedLogin(context, login)
  const log = await mock(context, opts)
  const page = await context.newPage()
  page.setDefaultTimeout(4000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith('/api/') && r.headers()['x-vercel-id']) { realHits.push(u.pathname); console.log('!! 실제 응답:', u.pathname) }
  })
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await sleep(wait)
  await page.evaluate(() => document.fonts.ready)
  return { context, page, log, errors, close: async () => { blocked += log.filter((l) => l.startsWith('BLOCKED')).length; await context.close() } }
}

/* 브라우저 안에서 쓰는 도구(문자열로 넣는다) */
const TOOLS = `
window.__lum = (rgb) => {
  const m = rgb.match(/[\\d.]+/g).map(Number)
  const [r, g, b] = m.slice(0, 3).map((v) => v / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
window.__alpha = (rgb) => { const m = rgb.match(/[\\d.]+/g).map(Number); return m.length > 3 ? m[3] : 1 }
window.__bgOf = (el) => {
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor
    if (window.__alpha(c) > 0) return c
  }
  return getComputedStyle(document.body).backgroundColor
}
window.__visible = (el) => {
  const cs = getComputedStyle(el)
  if (cs.visibility === 'hidden' || cs.display === 'none' || el.getClientRects().length === 0) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
`
async function tools(page) { await page.addScriptTag({ content: TOOLS }) }

/* ── U-1 ─────────────────────────────────────────────────────────── */

function literalCount() {
  const files = []
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(css|tsx?|)$/.test(f) && /\.(css|ts|tsx)$/.test(f)) files.push(p) } }
  walk(join(REPO, 'src'))
  const hits = []
  for (const f of files) {
    if (f.endsWith('/src/index.css')) continue
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const found = text.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []
    for (const x of found) hits.push(`${f.replace(REPO + '/', '')} ${x}`)
  }
  return hits
}

async function contrastOf(page) {
  return page.evaluate(() => {
    const low = []
    const disabledLow = []
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
      if (ratio < need) {
        const item = `${label.slice(0, 18)}(${ratio.toFixed(2)}, ${color} on ${bg}, ${size}px)`
        if (el.closest('[disabled], [aria-disabled="true"]')) disabledLow.push(item)
        else low.push(item)
      }
    }
    for (const el of document.querySelectorAll('body *')) {
      // 그림과 꾸밈(aria-hidden, 로고 글자)은 글자 대비 대상이 아니다(WCAG 1.4.3 예외)
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

const DOWNS = ['rgb(49, 130, 246)', 'rgb(27, 100, 218)']
async function downMisuse(page) {
  return page.evaluate((downs) => {
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor', 'fill', 'stroke']
    // 숫자(등락률·가격·봉 값·내린 종목 수 "N개")와 지도 칸([data-market])은 등락 색이 맞다. 버튼·링크·탭·선택 자체를 파랑으로 칠한 것만 센다
    const RATE = /^([+\-−]?\s?[\d,.]+\s?(%|원|주|만주|개)?\s?[()]?\s?)+$/
    const elems = []
    for (const el of document.querySelectorAll('body *')) {
      if (!window.__visible(el) || el.closest('canvas')) continue
      const cs = getComputedStyle(el)
      const hit = props.filter((p) => {
        if (!downs.includes(cs[p])) return false
        if (p.startsWith('border') && parseFloat(cs[p.replace('Color', 'Width')]) === 0) return false
        if (p === 'outlineColor' && (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0)) return false
        return true
      })
      if (hit.length === 0) continue
      const text = el.textContent.trim()
      const isRate = RATE.test(text) || el.closest('svg') !== null || el.closest('[data-market]') !== null
      if (!isRate) elems.push(`${el.tagName.toLowerCase()} "${text.slice(0, 14)}" ${hit.join('/')}`)
    }
    // 스타일 규칙도 본다: 포커스·마우스 올림처럼 지금 안 보이는 상태의 파랑
    const rules = []
    for (const sheet of document.styleSheets) {
      let list
      try { list = sheet.cssRules } catch { continue }
      const walk = (rs) => { for (const r of rs) { if (r.cssRules) walk(r.cssRules); if (!r.selectorText) continue
        const t = r.style.cssText.toLowerCase()
        if (!/#3182f6|rgb\(49, 130, 246\)|#1b64da|rgb\(27, 100, 218\)|var\(--color-down/.test(t)) continue
        if (r.selectorText === ':root') continue
        if (/_(down|sell|fall)_/i.test(r.selectorText) && !/(focus|hover|active|selected|pressed|button|tab|link|\ba\b)/i.test(r.selectorText)) continue
        rules.push(r.selectorText.slice(0, 60)) } }
      walk(list)
    }
    return { elems, rules }
  }, DOWNS)
}

async function u1() {
  const lits = literalCount()
  report('U1-1', lits.length === 0, `리터럴 ${lits.length}건 ${JSON.stringify(lits.slice(0, 40))}`)
  let beigePages = []
  let lowTotal = 0
  const downAll = []
  for (const [name, path] of LOGGED_OUT_PAGES) {
    const s = await open(path)
    await tools(s.page)
    // 바탕은 토큰 --color-page-bg 그대로(2026-10-30부터 흰색)이고 예전 베이지는 어디에도 없다
    const bg = await s.page.evaluate(() => {
      const probe = document.createElement('div'); probe.style.background = 'var(--color-page-bg)'; document.body.append(probe)
      const token = getComputedStyle(probe).backgroundColor; probe.remove()
      return { body: getComputedStyle(document.body).backgroundColor, token,
        beige: [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).backgroundColor === 'rgb(248, 246, 240)').length }
    })
    if (bg.body !== bg.token || bg.beige > 0) beigePages.push(`${name}(${bg.body}, 토큰 ${bg.token}, 베이지 ${bg.beige})`)
    for (const width of [1440, 375]) {
      if (width === 375) await s.page.setViewportSize({ width: 375, height: 812 })
      await sleep(300)
      const c = await contrastOf(s.page)
      lowTotal += c.low.length
      report(`U1-3 ${name}-${width}`, c.low.length === 0, `글자 ${c.checked}개 중 4.5:1(큰 글자 3:1) 미만 ${c.low.length} ${JSON.stringify(c.low.slice(0, 8))}${c.disabledLow.length ? ` · 비활성(WCAG 예외) ${c.disabledLow.length}` : ''}`)
    }
    await s.page.setViewportSize({ width: 1440, height: 900 })
    await sleep(200)
    const d = await downMisuse(s.page)
    if (d.elems.length || d.rules.length) downAll.push(`${name}: 요소 ${JSON.stringify(d.elems.slice(0, 12))} 규칙 ${JSON.stringify([...new Set(d.rules)].slice(0, 10))}`)
    if (name === 'home') report('INFO U1-4 home', null, `홈에서 하락 파랑을 칠한 요소(등락 포함) ${await s.page.evaluate((downs) => [...document.querySelectorAll('body *')].filter((e) => window.__visible(e) && ['color', 'backgroundColor', 'outlineColor', 'fill', 'stroke'].some((p) => downs.includes(getComputedStyle(e)[p]))).length, DOWNS)}개`)
    await s.close()
  }
  for (const [name, path] of LOGGED_IN_PAGES) {
    const s = await open(path, { login: true })
    await tools(s.page)
    const c = await contrastOf(s.page)
    lowTotal += c.low.length
    report(`U1-3 ${name}-1440`, c.low.length === 0, `글자 ${c.checked}개 중 미만 ${c.low.length} ${JSON.stringify(c.low.slice(0, 8))}`)
    const d = await downMisuse(s.page)
    if (d.elems.length || d.rules.length) downAll.push(`${name}: 요소 ${JSON.stringify(d.elems.slice(0, 12))} 규칙 ${JSON.stringify([...new Set(d.rules)].slice(0, 10))}`)
    await s.close()
  }
  report('U1-2', beigePages.length === 0, `bg 토큰이 아닌 화면 ${JSON.stringify(beigePages)}`)
  report('U1-3 합계', lowTotal === 0, `대비 미만 ${lowTotal}`)
  report('U1-4', downAll.length === 0, `등락 아닌 파랑 ${downAll.length === 0 ? '0' : '\n      ' + downAll.join('\n      ')}`)
}

/* ── U-2 ─────────────────────────────────────────────────────────── */

const BRAND = 'rgb(21, 128, 61)'
async function buttonStyles(page) {
  return page.evaluate((brand) => {
    const kinds = {}
    const odd = []
    for (const el of document.querySelectorAll('button, [role="button"], a')) {
      if (!window.__visible(el)) continue
      // 주식 모아보기 지도 칸은 등락 색으로 칠한 링크다(단추가 아니다)
      if (el.closest('[data-market]') !== null) continue
      const cs = getComputedStyle(el)
      const bg = cs.backgroundColor
      const border = parseFloat(cs.borderTopWidth) > 0 && window.__alpha(cs.borderTopColor) > 0
      const transparent = window.__alpha(bg) === 0
      const isButton = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || !transparent || border
      if (!isButton) continue
      // 지금 단계(aria-current="step" — 백테스트 진행 단계 줄, 2026-11-03)도 고른 칸이다
      const on = el.matches('[aria-selected="true"], [aria-pressed="true"], [aria-current="page"], [aria-current="step"]')
      let kind = null
      // 소셜 로그인 단추는 각 회사 지침의 색이라 3종에서 뺀다(카카오 노랑·네이버 초록). 결과 보고서 예외 목록에 적는다
      if (/_(kakao|naver)_/.test(el.className)) kind = 'brand-exception'
      else if (el.matches(':disabled, [aria-disabled="true"]')) kind = 'disabled'
      else if (bg === brand && cs.color === 'rgb(255, 255, 255)') kind = 'primary'
      else if (bg === 'rgb(255, 255, 255)' && border) kind = 'secondary'
      else if (transparent && !border) kind = 'ghost'
      else if (on) kind = 'selected'
      if (kind === null) odd.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 12)}" bg ${bg} border ${border ? cs.borderTopColor : '없음'} color ${cs.color}`)
      else kinds[kind] = (kinds[kind] ?? 0) + 1
    }
    return { kinds, odd }
  }, BRAND)
}

async function focusRings(page, max = 80) {
  await page.evaluate(() => {
    const SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const snap = (e) => { const cs = getComputedStyle(e); return `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}|${cs.boxShadow}|${cs.borderTopColor}|${cs.backgroundColor}` }
    window.__snaps = new Map()
    document.querySelectorAll(SEL).forEach((el, i) => {
      el.dataset.fi = String(i)
      const chain = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean)
      window.__snaps.set(String(i), chain.map(snap))
    })
  })
  const seen = new Set()
  const bad = []
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
      // 홈 시세표 종목명처럼 ::after가 행을 덮는 링크는 테두리를 가상 요소에 그린다
      const pseudo = ['::before', '::after'].some((p) => { const ps = getComputedStyle(el, p); return ps.outlineStyle !== 'none' && parseFloat(ps.outlineWidth) > 0 })
      const changed = chain.some((e, k) => before && snap(e) !== before[k])
      return { id: el.dataset.fi, ok: own || pseudo || changed, label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? el.placeholder ?? '').trim().slice(0, 14)}"` }
    })
    if (r === null) continue
    if (seen.has(r.id)) break
    seen.add(r.id)
    if (!r.ok) bad.push(r.label)
  }
  return { count: seen.size, bad }
}

async function targetSizes(page, min) {
  return page.evaluate(async (min) => {
    const small = []
    let n = 0
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="tab"]')) {
      if (!window.__visible(el)) continue
      // 글 문단 안의 링크는 예외(WCAG 2.5.8 inline)
      const p = el.parentElement
      if (el.tagName === 'A' && p && ['P', 'LI', 'SPAN'].includes(p.tagName) && [...p.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() !== '')) continue
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1)
      const cy = r.top + r.height / 2
      const inside = (y) => { const hit = document.elementFromPoint(x, y); return hit !== null && (hit === el || el.contains(hit)) }
      if (!inside(cy)) continue
      let up = 0, down = 0
      while (up < 40 && inside(cy - up - 1)) up += 1
      while (down < 40 && inside(cy + down + 1)) down += 1
      const h = up + down + 1
      n += 1
      if (h < min) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? el.placeholder ?? '').trim().slice(0, 12)}" ${h}px`)
    }
    window.scrollTo(0, 0)
    return { n, small }
  }, min)
}

async function u2() {
  for (const [name, path, login] of [...LOGGED_OUT_PAGES.map(([n, p]) => [n, p, false]), ...LOGGED_IN_PAGES.map(([n, p]) => [n, p, true])]) {
    const s = await open(path, { login })
    await tools(s.page)
    const b = await buttonStyles(s.page)
    report(`U2-1 ${name}`, b.odd.length === 0, `종류 ${JSON.stringify(b.kinds)} · 3종 밖 ${b.odd.length} ${JSON.stringify(b.odd.slice(0, 6))}`)
    const f = await focusRings(s.page)
    report(`U2-2 ${name}`, f.bad.length === 0, `탭 ${f.count}곳 중 링 안 보임 ${f.bad.length} ${JSON.stringify(f.bad.slice(0, 6))}`)
    const t = await targetSizes(s.page, 40)
    report(`U2-3 ${name}-1440`, t.small.length === 0, `${t.n}개 중 40px 미만 ${t.small.length} ${JSON.stringify(t.small.slice(0, 8))}`)
    await s.page.setViewportSize({ width: 375, height: 812 })
    await sleep(400)
    const m = await targetSizes(s.page, 44)
    report(`U2-3 ${name}-375`, m.small.length === 0, `${m.n}개 중 44px 미만 ${m.small.length} ${JSON.stringify(m.small.slice(0, 8))}`)
    await s.close()
  }
}

/* ── U-3 ─────────────────────────────────────────────────────────── */

const UPS = ['rgb(240, 68, 82)', 'rgb(217, 40, 58)']
async function u3() {
  const s = await open('/stocks/005930', { login: true, wait: 2500 })
  await tools(s.page)
  const m = await s.page.evaluate(() => {
    const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
    const panel = document.querySelector('[class*="_actionPanel_"]')
    const rows = panel ? [...panel.querySelectorAll('a')] : []
    const heart = [...document.querySelectorAll('button')].find((b) => /^관심종목 (추가|해제)$/.test(b.getAttribute('aria-label') ?? ''))
    const summary = document.querySelector('[class*="_summaryCard_"]') ?? [...document.querySelectorAll('dl')].find((d) => d.textContent.includes('시가'))
    const chart = document.querySelector('[class*="_chartBox_"]')
    const side = panel?.parentElement
    const lastInSide = side ? [...side.children].filter((c) => window.__visible(c)).at(-1) : null
    const inView = (b) => b !== null && b.top >= 0 && b.bottom <= innerHeight
    return {
      // 이름·설명은 aria-labelledby·aria-describedby가 가리키는 글(2026-10-30 M-8 머리 띠 — 설명은 화면에 숨긴 글)
      rows: rows.map((a) => { const by = (attr) => document.getElementById(a.getAttribute(attr) ?? '')?.textContent.trim() ?? null
        return { name: by('aria-labelledby') ?? (a.getAttribute('aria-label') ?? a.textContent).trim(), href: a.getAttribute('href'), desc: by('aria-describedby') ?? a.querySelector('[class*="_actionDesc_"]')?.textContent.trim() ?? '', rect: r(a) } }),
      view: { backtest: inView(r(rows[0] ?? null)), ai: inView(r(rows[1] ?? null)), heart: inView(r(heart ?? null)), summary: inView(r(summary ?? null)) },
      heartColors: heart ? [getComputedStyle(heart).color, ...[...heart.querySelectorAll('svg, path')].flatMap((e) => [getComputedStyle(e).fill, getComputedStyle(e).stroke])] : null,
      gap: chart && lastInSide ? Math.round(r(chart).bottom - r(lastInSide).bottom) : null,
      chartH: chart ? Math.round(r(chart).height) : null,
      panelAboveChart: panel && chart ? r(panel).bottom <= r(chart).top + 0.5 : null,
      pressed: heart?.getAttribute('aria-pressed') ?? null,
    }
  })
  report('U3-1', Object.values(m.view).every(Boolean), `첫 화면 ${JSON.stringify(m.view)}`)
  const ring = await focusRings(s.page, 60)
  const rowsOk = m.rows.length === 2 && m.rows.every((row) => row.name !== '' && row.desc !== '')
  report('U3-2', rowsOk && ring.bad.length === 0, `행 ${JSON.stringify(m.rows.map((row) => `${row.name.slice(0, 20)} / ${row.desc}`))}, 링 안 보임 ${JSON.stringify(ring.bad.slice(0, 4))}`)
  report('U3-3', m.heartColors !== null && !m.heartColors.some((c) => UPS.includes(c)), `하트 색 ${JSON.stringify(m.heartColors ? [...new Set(m.heartColors)] : null)}`)
  // 2026-10-29엔 오른쪽 열 아래 빈 곳(차트의 15% 미만)을 쟀다. 10-30 재정비(M-8)부터 바로 가기는 머리 띠 안이라 차트 위에 있어야 한다
  report('U3-4', m.panelAboveChart === true, `바로 가기는 머리 띠 안(차트 위) ${m.panelAboveChart}, 옛 기준 빈 곳 ${m.gap}px / 차트 ${m.chartH}px`)
  // 5: 누르면 aria-pressed가 바뀌고 관심 API는 한 번 누를 때 1건(고치기 전과 같다)
  const heart = s.page.getByRole('button', { name: /^관심종목 (추가|해제)$/ })
  const before = s.log.filter((l) => /^(POST|DELETE) \/api\/members\/me\/like-stocks/.test(l)).length
  const p0 = await heart.getAttribute('aria-pressed').catch(() => null)
  await heart.click().catch(() => {})
  await sleep(700)
  const p1 = await heart.getAttribute('aria-pressed').catch(() => null)
  const after = s.log.filter((l) => /^(POST|DELETE) \/api\/members\/me\/like-stocks/.test(l)).length
  report('U3-5', p0 !== null && p0 !== p1 && after - before === 1, `aria-pressed ${p0} → ${p1}, 관심 요청 ${after - before}건(고치기 전 1건)`)
  if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/u3-stock-1440-in.png` })
  await s.close()

  const o = await open('/stocks/005930', { wait: 2500 })
  const lo = await o.page.evaluate(() => {
    const panel = document.querySelector('[class*="_actionPanel_"]')
    return { badges: [...document.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === '로그인 필요').length,
      hrefs: panel ? [...panel.querySelectorAll('a')].map((a) => a.getAttribute('href')) : [] }
  })
  report('U3-6', lo.badges === 2 && lo.hrefs.length === 2 && lo.hrefs.every((h) => /^\/login\?next=/.test(h ?? '')), `배지 ${lo.badges}, href ${JSON.stringify(lo.hrefs)}`)
  if (SHOTS) await o.page.screenshot({ path: `${SHOTS}/u3-stock-1440-out.png` })
  await o.close()

  const n = await open('/stocks/005930', { width: 375, height: 812, login: true, wait: 2500 })
  const nm = await n.page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows: [...document.querySelectorAll('[class*="_actionPanel_"] a')].map((a) => Math.round(a.getBoundingClientRect().height)),
  }))
  report('U3-7', nm.overflow <= 0 && nm.rows.length === 2 && nm.rows.every((h) => h >= 44), `가로 넘침 ${nm.overflow}px, 행 높이 ${JSON.stringify(nm.rows)}`)
  await n.close()
}

/* ── U-4 ─────────────────────────────────────────────────────────── */

async function u4() {
  const s = await open('/stocks/005930', { login: true, wait: 2500 })
  const m = await s.page.evaluate(() => {
    // 큰 가격은 넓은 글꼴의 숫자 칸(.priceNumber)이고 "원"은 작은 글자로 따로 둔다(2026-10-30 D-1). 첫 화면 안에 하나다
    const big = [...document.querySelectorAll('[class*="_priceNumber_"]')].filter((e) => {
      const r = e.getBoundingClientRect()
      return /\d/.test(e.textContent) && parseFloat(getComputedStyle(e).fontSize) >= 24 && r.top >= 0 && r.bottom <= innerHeight && r.width > 0
    }).map((e) => e.textContent.trim())
    const asOf = /\d+월 \d+일 \d{1,2}:\d{2} 기준/.test(document.querySelector('main')?.innerText ?? '')
    const legend = document.querySelector('[class*="_legend_"]')
    const chart = document.querySelector('[class*="_chartBox_"]')?.getBoundingClientRect()
    const belowChart = chart ? [...document.querySelectorAll('dt, [class*="summaryLabel"]')].filter((e) => e.textContent.trim() === '시가' && e.getBoundingClientRect().top > chart.bottom && e.getBoundingClientRect().left < chart.right).length : null
    return { big, asOf, legendShown: legend !== null && getComputedStyle(legend).display !== 'none' && legend.getBoundingClientRect().height > 0, belowChart }
  })
  report('U4-1', m.big.length === 1 && m.asOf, `큰 가격 ${JSON.stringify(m.big)}, 기준 시각 ${m.asOf}`)
  const canvas = s.page.locator('[class*="_chartBox_"] canvas').first()
  const box = await canvas.boundingBox().catch(() => null)
  let hoverShown = false
  if (box) {
    await s.page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4)
    await sleep(400)
    hoverShown = await s.page.evaluate(() => { const l = document.querySelector('[class*="_legend_"]'); return l !== null && l.getBoundingClientRect().height > 0 })
    await s.page.mouse.move(5, 5)
  }
  report('U4-2', !m.legendShown && hoverShown, `기본 상태 범례 보임 ${m.legendShown}, 봉 위에서 보임 ${hoverShown}`)
  report('U4-3', m.belowChart === 0, `차트 아래 요약 박스 ${m.belowChart}`)
  const news = await s.page.evaluate(() => {
    const titles = [...document.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && /^관련 기사 \d+$/.test(e.textContent.trim()) && e.getBoundingClientRect().height > 0)
    const descs = titles.map((t) => t.parentElement?.querySelector('p:last-of-type, [class*="_description_"]')).filter(Boolean)
    const lines = descs.map((d) => { const cs = getComputedStyle(d); return Math.round(d.getBoundingClientRect().height / parseFloat(cs.lineHeight === 'normal' ? String(parseFloat(cs.fontSize) * 1.5) : cs.lineHeight)) })
    return { count: titles.length, lines, clamp: descs.map((d) => getComputedStyle(d).webkitLineClamp) }
  })
  // 2026-11-02부터 6건씩 펼친다(넓은 칸 두 줄이 둘씩 짝이 맞게, feature.mjs S-5) — U-4 때는 5건
  report('U4-4', news.count === 6 && news.lines.every((l) => l <= 2), `첫 로드 ${news.count}건, 요약 줄 수 ${JSON.stringify(news.lines)}, line-clamp ${JSON.stringify([...new Set(news.clamp)])}`)
  if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/u4-stock-1440.png`, fullPage: true })
  await s.close()
}

/* ── U-5 ─────────────────────────────────────────────────────────── */

async function u5() {
  const s = await open('/', { wait: 2000 })
  const m = await s.page.evaluate(() => {
    const rows = [...document.querySelectorAll('ul li')].filter((li) => li.querySelector('a[href^="/stocks/"]') && li.closest('[class*="_table_"]'))
    const visibleRows = rows.filter((li) => li.getBoundingClientRect().bottom <= innerHeight && li.getBoundingClientRect().top >= 0).length
    const headings = [...document.querySelectorAll('main h1, main h2')].map((h) => `${h.textContent.trim().slice(0, 10)} ${getComputedStyle(h).fontSize}`)
    const placeholder = document.querySelector('input[type="search"], input[placeholder]')?.getAttribute('placeholder') ?? null
    // 칸 글 전체가 숫자인 칸(가격·등락률·거래대금). 종목명 칸은 아래 줄 종목코드로 끝나 숫자로 보이지만 숫자 칸이 아니다
    const numeric = rows.slice(0, 3).flatMap((li) => [...li.children].filter((c) => /^[+\-−]?[\d,.]+(원|%|억|조)?$/.test(c.textContent.trim())).map((c) => getComputedStyle(c).fontVariantNumeric))
    return { visibleRows, headings, placeholder, numeric }
  })
  report('U5-1', m.visibleRows >= 3, `첫 화면 시세표 행 ${m.visibleRows}`)
  report('U5-2', m.headings.every((h) => parseFloat(h.split(' ').at(-1)) <= 28), `섹션 제목 ${JSON.stringify(m.headings)}`)
  report('U5-3', m.placeholder === '종목명이나 종목코드로 검색 (예: 삼성전자)', `placeholder "${m.placeholder}"`)
  report('U5-4', m.numeric.length > 0 && m.numeric.every((v) => v.includes('tabular-nums')), `숫자 칸 ${JSON.stringify([...new Set(m.numeric)])} (${m.numeric.length}칸)`)
  if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/u5-home-1440.png` })
  await s.close()
}

/* ── U-6 ─────────────────────────────────────────────────────────── */

async function u6() {
  {
    const s = await open('/ai')
    const chips = s.page.locator('[class*="_exampleChip_"]')
    const n = await chips.count()
    let filled = null
    if (n > 0) {
      const text = (await chips.first().innerText()).trim()
      await chips.first().click()
      await sleep(500)
      filled = (await s.page.getByRole('textbox', { name: '질문 입력' }).inputValue()) === text
    }
    const asks = s.log.filter((l) => /^POST \/api\/open-ai\/ask/.test(l)).length
    report('U6-1', n >= 3 && filled === true && asks === 0, `예시 칩 ${n}개, 누르면 입력칸에 채워짐 ${filled}, 질문 요청 ${asks}`)
    await s.close()
  }
  {
    const s = await open('/backtest')
    const shown = await s.page.evaluate(() => [...document.querySelectorAll('main *')].some((e) => e.childElementCount <= 2 && /로그인하면[^.]{0,20}결과/.test(e.textContent) && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top < innerHeight))
    report('U6-2', shown, `고르기 전 로그인 안내 ${shown}`)
    const names = []
    const buttons = s.page.locator('[class*="_strategyList_"] button')
    for (let i = 0; i < (await buttons.count()); i++) {
      const snap = await buttons.nth(i).ariaSnapshot().catch(() => '')
      names.push(snap.match(/button "([^"]*)"/)?.[1] ?? '(이름 없음)')
    }
    report('U6-3', names.length === 5 && names.every((n) => n !== '(이름 없음)' && n.length <= 30), `전략 버튼 이름 ${JSON.stringify(names)}`)
    await s.close()
  }
  {
    const s = await open('/personality-test')
    const text = await s.page.locator('main').innerText()
    const old = /지금은 임시 문항으로 진행해요/.test(text)
    const neu = /간단 버전\(7문항\)/.test(text)
    const l = await open('/login')
    const lt = await l.page.locator('main').innerText()
    report('U6-4', !old && neu && !/Create Your Own JUBY!/.test(lt) && /백테스트/.test(lt) && /AI/.test(lt) && /성향/.test(lt), `성향테스트 옛 문구 ${old}·새 문구 ${neu}, 로그인 영어 문구 ${/Create Your Own JUBY!/.test(lt)}, 가치 3줄 ${/백테스트/.test(lt) && /AI/.test(lt) && /성향/.test(lt)}`)
    await s.close()
    await l.close()
  }
}

/* ── U-7 ─────────────────────────────────────────────────────────── */

async function u7() {
  for (const [name, path] of [['home', '/'], ['stock', '/stocks/005930'], ['backtest', '/backtest'], ['ai', '/ai']]) {
    const s = await open(path, { width: 1920, height: 1080, login: true, wait: 2000 })
    const m = await s.page.evaluate(() => {
      const main = document.querySelector('main')
      const cs = getComputedStyle(main)
      const content = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      // 글 문단마다 실제로 그려진 줄의 폭(상자 폭이 아니라 글자가 차지한 폭)을 글자 크기로 나눈다 — 한글은 한 글자가 거의 1em이다
      const lines = [...document.querySelectorAll('main p')].filter((p) => p.getBoundingClientRect().height > 0 && p.textContent.trim().length > 20)
        .map((p) => {
          const range = document.createRange()
          range.selectNodeContents(p)
          const widest = Math.max(0, ...[...range.getClientRects()].map((r) => r.width))
          return Math.round(widest / parseFloat(getComputedStyle(p).fontSize))
        })
      return { content: Math.round(content), ratio: (content / innerWidth).toFixed(3), maxLine: Math.max(0, ...lines) }
    })
    report(`U7 ${name}`, m.maxLine <= 75 ? null : false, `콘텐츠 폭 ${m.content}px ÷ 1920 = ${m.ratio}, 본문 글줄 최대 ${m.maxLine}자(글자 크기 기준)`)
    await s.close()
  }
}

/* ── 캡처 ────────────────────────────────────────────────────────── */

async function shots() {
  mkdirSync(SHOTS, { recursive: true })
  for (const [w, h] of [[1440, 900], [1920, 1080], [375, 812]]) {
    for (const [name, path, login] of [...LOGGED_OUT_PAGES.map(([n, p]) => [n, p, false]), ...LOGGED_IN_PAGES.map(([n, p]) => [n, p, true])]) {
      const s = await open(path, { width: w, height: h, login, wait: 1800 })
      await s.page.screenshot({ path: `${SHOTS}/${name}-${w}.png`, fullPage: true })
      if (['home', 'stock'].includes(name)) await s.page.screenshot({ path: `${SHOTS}/${name}-${w}-first.png` })
      await s.close()
    }
  }
  console.log('captured', SHOTS)
}

const GROUPS = { u1, u2, u3, u4, u5, u6, u7, shots }
for (const [name, run] of Object.entries(GROUPS)) {
  if (!ONLY.includes(name)) continue
  try { await run() } catch (error) { report(`${name} 묶음`, false, `도중에 멈춤: ${String(error.message ?? error).split('\n')[0]}`) }
}
await browser.close()
console.log(`실제 백엔드 응답 ${realHits.length}건, 막은 백엔드 호스트 요청 ${blocked}건`)
console.log(`ui PASS ${out.filter((l) => l.startsWith('PASS')).length} FAIL ${out.filter((l) => l.startsWith('FAIL')).length} INFO ${out.filter((l) => l.startsWith('INFO')).length}`)
