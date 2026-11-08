// 색 테마 — 밤하늘 + 호박(2026-11-08 사용자 "모든 테마를 2번 밤하늘+호박 으로 바꿔줘"). 초록은 주식 화면 같지 않다는 의견으로 바꿨다.
//  T1 머리글 띠·아래 지수 띠·휴대폰 주소창(theme-color)이 밤하늘(--color-band #14213d)이다
//  T2 주 단추(buttons.module.css primary)는 호박 채움(--color-brand-400 #f5a524)에 어두운 글자(대비 4.5:1 이상)다 — 흰 글자는 호박 위에서 2.0:1이다
//  T3 23화면 × 1440·390 어디에도 초록 기운의 색이 없다. 요소·::before·::after의 글자·바탕·테두리·그림자·SVG 칠, 그리고 받아 온 CSS 규칙 전부
//     (마우스를 올렸을 때·포커스 색까지) — 옛 초록 회색(#5f6b66·#e4e8e6 같은 초록 기운 회색)도 센다. 네이버 로그인 아이콘은 회사 색이라 뺀다
//  T5 구역을 여는 굵은 선(2px 이상 실선 — 화면 제목·구역 제목 아래, --color-rule)이 먹이 아니라 밤하늘이다(2026-11-08 사용자 "검은색 선들을 메인 테마색인 남색으로").
//     단추·입력칸 테두리는 빼고 센다
//  T6 보조 단추(secondary) 테두리와 관심종목 지도 칸의 키보드 포커스 테두리도 먹이 아니라 밤하늘이다(같은 날 사용자 "그것도 바꾸고")
//  T4 탭 아이콘(favicon.svg)·링크 미리보기(og.png)·홈 화면 아이콘(apple-touch-icon.png)의 바탕이 밤하늘이다
//   node theme.mjs <BASE>
import { judge, sleep } from './lib.mjs'

const BASE = process.argv[2]
const j = await judge({ BASE })
const BAND = 'rgb(20, 33, 61)'
const AMBER = 'rgb(245, 165, 36)'

const at = (path, wait = 1500) => async (t) => t.goto(path, wait)
/** [이름, 로그인, 여는 법] — snapshot.mjs와 같은 화면들 */
const SCREENS = [
  ['home', true, at('/', 2000)], ['home-out', false, at('/', 2000)],
  ['stock', true, at('/stocks/005930', 2200)], ['stock-out', false, at('/stocks/005930', 2200)],
  ['likes', true, at('/likes', 1800)], ['likes-out', false, at('/likes')],
  ['backtest', true, at('/backtest')], ['backtest-out', false, at('/backtest')],
  ['ai', true, at('/ai', 1800)], ['ai-out', false, at('/ai')],
  ['guide', true, at('/guide')], ['guide-backtest', true, at('/guide/backtest')],
  ['community', true, at('/community', 1800)], ['community-out', false, at('/community', 1800)],
  ['community-post', true, at('/community/1', 1800)], ['community-write', true, at('/community/write')],
  ['mypage', true, at('/mypage', 1800)], ['mypage-personality', true, at('/mypage/personality')], ['mypage-profile', true, at('/mypage/profile')],
  ['personality-test', true, at('/personality-test')], ['personality-out', false, at('/personality-test')],
  ['login', false, at('/login', 1000)], ['not-found', false, at('/nope', 1000)],
]

/** 페이지 안에서 쓰는 색 도구 — 초록 기운(색상 75°~175°, 채도 폭 3 이상)과 대비 */
const TOOLS = () => {
  window.__rgbs = (text) => [...String(text).matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(/[\s,/]+/).filter(Boolean).map(Number))
  window.__hexes = (text) => [...String(text).matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => {
    const h = m[1].length <= 4 ? m[1].split('').map((c) => c + c).join('') : m[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]
  })
  window.__green = ([r, g, b, a = 1]) => {
    if (a === 0) return false
    const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min
    if (c < 3) return false
    let h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4
    h *= 60
    if (h < 0) h += 360
    return h >= 75 && h <= 175
  }
  window.__lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  window.__ratio = (a, b) => { const x = window.__lum(a), y = window.__lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
}

/** 화면 하나: 초록 기운 색을 쓴 곳(요소·가상 요소)과 주 단추 */
async function scan(page) {
  await page.evaluate(TOOLS)
  return page.evaluate(() => {
    const hits = []
    const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0].replace(/^_|_[a-z0-9]{5}$/gi, '') : ''}`
    const check = (el, cs, where) => {
      const props = ['color', 'backgroundColor', 'boxShadow', 'fill', 'stroke']
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(cs[`border${side}Width`]) > 0) props.push(`border${side}Color`)
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) props.push('outlineColor')
      if (cs.textDecorationLine !== 'none') props.push('textDecorationColor')
      for (const p of props) {
        const value = cs[p]
        if (!value || value === 'none') continue
        if (window.__rgbs(value).some(window.__green)) hits.push(`${name(el)}${where} ${p} ${value.slice(0, 40)}`)
      }
    }
    for (const el of document.querySelectorAll('body *')) {
      // 네이버는 회사 지침 색(초록 N)이라 뺀다(로그인 화면·마이페이지 가입 경로)
      if (/naver/i.test(el.className?.baseVal ?? el.className ?? '') || el.closest('[class*="naver" i]')) continue
      check(el, getComputedStyle(el), '')
      for (const pseudo of ['::before', '::after']) {
        const cs = getComputedStyle(el, pseudo)
        if (cs.content && cs.content !== 'none') check(el, cs, pseudo)
      }
    }
    const primaries = [...document.querySelectorAll('[class*="_primary_"]')]
      .filter((el) => el.getClientRects().length > 0 && !el.matches(':disabled, [aria-disabled="true"]'))
      .map((el) => {
        const cs = getComputedStyle(el)
        const bg = window.__rgbs(cs.backgroundColor)[0], fg = window.__rgbs(cs.color)[0]
        return { text: el.textContent.trim().slice(0, 14), bg: cs.backgroundColor, color: cs.color, ratio: Math.round(window.__ratio(bg, fg) * 10) / 10 }
      })
    const rules = { band: 0, other: [] }
    for (const el of document.querySelectorAll('body *')) {
      if (el.matches('button, a, input, textarea, select, [role="button"], [role="tab"]') || el.getClientRects().length === 0) continue
      const cs = getComputedStyle(el)
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (parseFloat(cs[`border${side}Width`]) < 2 || cs[`border${side}Style`] !== 'solid') continue
        const color = cs[`border${side}Color`]
        // 흰 테두리는 선이 아니라 칸 사이 틈이다(투자성향 자 막대 사이 2px)
        if (color === 'rgb(255, 255, 255)') continue
        if (color === 'rgb(20, 33, 61)') rules.band += 1
        else rules.other.push(`${name(el)} border${side} ${color}`)
      }
    }
    const secondaries = [...document.querySelectorAll('[class*="_secondary_"]')].filter((el) => el.getClientRects().length > 0 && !el.matches(':disabled')).map((el) => getComputedStyle(el).borderTopColor)
    return { hits: [...new Set(hits)], primaries, rules, secondaries }
  })
}

const allHits = []
const allPrimaries = []
let ruleBand = 0
const secondaryColors = []
let tileOutline = null
const ruleOther = []
let sheetHits = null
let chrome = null
for (const [screen, loggedIn, open] of SCREENS) {
  for (const width of [1440, 390]) {
    const t = await j.open({ loggedIn, width, height: width === 390 ? 844 : 900 })
    await open(t)
    const r = await scan(t.page)
    for (const h of r.hits) allHits.push(`${screen}@${width} ${h}`)
    for (const p of r.primaries) allPrimaries.push({ screen: `${screen}@${width}`, ...p })
    ruleBand += r.rules.band
    secondaryColors.push(...r.secondaries)
    if (screen === 'likes' && width === 1440) {
      await t.page.keyboard.press('Tab')
      tileOutline = await t.page.evaluate(() => { const tile = document.querySelector('a[data-market]'); if (!tile) return null; tile.focus(); return getComputedStyle(tile).outlineColor })
    }
    for (const o of r.rules.other) ruleOther.push(`${screen}@${width} ${o}`)
    if (screen === 'home' && width === 1440) {
      chrome = await t.page.evaluate(() => ({
        header: getComputedStyle(document.querySelector('header')).backgroundColor,
        index: getComputedStyle(document.querySelector('[data-index-bar]')).backgroundColor,
        meta: document.querySelector('meta[name="theme-color"]')?.content ?? null,
      }))
      // 받아 온 CSS 규칙 전부 — 마우스를 올렸을 때·포커스·고른 칸 색처럼 지금 화면에 안 보이는 색까지
      sheetHits = await t.page.evaluate(() => {
        const out = []
        for (const sheet of document.styleSheets) {
          let rules
          try { rules = sheet.cssRules } catch { continue }
          const walk = (list) => {
            for (const rule of list) {
              if (rule.cssRules) walk(rule.cssRules)
              if (!rule.style) continue
              const text = rule.style.cssText
              if ([...window.__hexes(text), ...window.__rgbs(text)].some(window.__green)) out.push(`${rule.selectorText ?? '(규칙)'} { ${text.slice(0, 90)} }`)
            }
          }
          walk(rules)
        }
        return out.filter((line) => !/naver/i.test(line))
      })
    }
    await t.close()
  }
}

j.report('T1', chrome?.header === BAND && chrome?.index === BAND && chrome?.meta?.toLowerCase() === '#14213d',
  `머리글 ${chrome?.header}, 지수 띠 ${chrome?.index}, theme-color ${chrome?.meta} (밤하늘 ${BAND})`)

const badPrimaries = allPrimaries.filter((p) => p.bg !== AMBER || p.ratio < 4.5)
j.report('T2', allPrimaries.length > 0 && badPrimaries.length === 0,
  `주 단추 ${allPrimaries.length}개(${[...new Set(allPrimaries.map((p) => p.text))].slice(0, 8).join(' · ')}) 중 호박 채움·대비 4.5 아님 ${badPrimaries.length}` +
  (badPrimaries.length ? ` ${JSON.stringify(badPrimaries.slice(0, 4))}` : ''))

j.report('T3a', allHits.length === 0, `화면에 보이는 초록 기운 색 ${allHits.length}곳${allHits.length ? '\n    ' + allHits.slice(0, 14).join('\n    ') : ''}`)
j.report('T3b', sheetHits?.length === 0, `CSS 규칙 안 초록 기운 색 ${sheetHits?.length}개${sheetHits?.length ? '\n    ' + sheetHits.slice(0, 10).join('\n    ') : ''}`)

j.report('T5', ruleBand > 0 && ruleOther.length === 0, `굵은 선 밤하늘 ${ruleBand}개, 다른 색 ${ruleOther.length}개${ruleOther.length ? '\n    ' + [...new Set(ruleOther.map((o) => o.replace(/^\S+ /, '')))].slice(0, 8).join('\n    ') : ''}`)

const badSecondary = secondaryColors.filter((c) => c !== 'rgb(20, 33, 61)')
j.report('T6', secondaryColors.length > 0 && badSecondary.length === 0 && tileOutline === 'rgb(20, 33, 61)', `보조 단추 ${secondaryColors.length}개 중 밤하늘 아님 ${badSecondary.length}(${[...new Set(badSecondary)].join(', ')}), 지도 칸 포커스 테두리 ${tileOutline}`)

// T4 아이콘 세 개 — 그림을 캔버스에 그려 바탕 자리의 색을 읽는다(밤하늘에서 ±6 안)
{
  const t = await j.open({ loggedIn: false, width: 800, height: 600 })
  await t.goto('/nope', 600)
  await t.page.evaluate(TOOLS)
  const icons = await t.page.evaluate(async () => {
    const svg = await (await fetch('/favicon.svg')).text()
    const pixel = (src, x, y) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const g = c.getContext('2d')
        g.drawImage(img, 0, 0)
        resolve([...g.getImageData(x, y, 1, 1).data.slice(0, 3)])
      }
      img.onerror = () => resolve(null)
      img.src = src
    })
    return {
      svgGreen: window.__hexes(svg.replace(/<!--[\s\S]*?-->/g, '')).some(window.__green),
      svgBand: /#14213d/i.test(svg),
      // 둥근 네모 왼쪽 가운데(모서리 둥근 곳·캔들은 피한다)
      favicon: await pixel('/favicon.svg', 6, 32),
      touch: await pixel('/apple-touch-icon.png', 12, 90),
      og: await pixel('/og.png', 262, 226),
    }
  })
  await t.close()
  const near = (px) => px !== null && Math.max(Math.abs(px[0] - 20), Math.abs(px[1] - 33), Math.abs(px[2] - 61)) <= 6
  j.report('T4', !icons.svgGreen && icons.svgBand && near(icons.favicon) && near(icons.touch) && near(icons.og),
    `favicon 초록 ${icons.svgGreen}·밤하늘 ${icons.svgBand} 바탕 ${icons.favicon}, apple-touch-icon ${icons.touch}, og.png ${icons.og} (밤하늘 20,33,61)`)
}

await sleep(0)
await j.finish()
