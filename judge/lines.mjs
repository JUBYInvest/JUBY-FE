// 나란한 열의 가로선 판정(2026-11-02 사용자 "묘하게 선의 위치가 맞지 않는 것들을 찾아서 다 정리해줘" — 홈 '현재 주가 보기'와
// '커뮤니티'의 굵은 먹 선이 3px 어긋난 캡처). 두 열이 나란한 폭(1101px 이상)에서 본다. /api는 전부 가짜(mock.mjs).
// node lines.mjs <BASE> [--only A1,G] [--headed]
import { cli, judge } from './lib.mjs'

const j = await judge(cli())
const WIDTHS = [1920, 1600, 1440, 1280, 1101]
/** 선 아래 끝이 이만큼 안이면 같은 선으로 본다(2px 먹 선과 1px 가는 선을 아래 끝으로 맞춘다) */
const SAME = 0.6

/** 화면을 열고 fn(page)이 돌려준 [이름, 아래 끝 y] 쌍들이 같은 높이인지 폭마다 본다 */
async function pairs(id, path, label, fn, { wait = 1800, loggedIn = true } = {}) {
  const bad = []
  let shown = ''
  for (const width of WIDTHS) {
    const t = await j.open({ width, height: 1080, loggedIn })
    await t.goto(path, wait)
    await t.page.evaluate(() => document.fonts.ready)
    const got = await t.page.evaluate(fn)
    if (got === null || got.some(([, y]) => y === null)) bad.push(`${width}: 못 찾음 ${JSON.stringify(got)}`)
    else {
      const ys = got.map(([, y]) => y)
      const spread = Math.max(...ys) - Math.min(...ys)
      if (spread > SAME) bad.push(`${width}: ${got.map(([n, y]) => `${n} ${y.toFixed(1)}`).join(' / ')} (${spread.toFixed(1)}px)`)
      if (width === 1920) shown = got.map(([n, y]) => `${n} ${y.toFixed(1)}`).join(' / ')
    }
    await t.close()
  }
  j.report(id, bad.length === 0, `${label} — 1920: ${shown}${bad.length ? '\n    어긋남 ' + bad.join('\n    어긋남 ') : ''}`)
}

/** 요소의 아래 테두리 아래 끝(페이지 기준). 없으면 null */
const BOTTOM = `(el) => el ? el.getBoundingClientRect().bottom + scrollY : null`

await j.run('A1', () => pairs('A1', '/', '홈: 검색창 아래 끝 = 사용설명서 제목 줄 먹 선', new Function(`
  const bottom = ${BOTTOM}
  let box = document.querySelector('main input')
  while (box && parseFloat(getComputedStyle(box).borderBottomWidth) === 0) box = box.parentElement
  return [['검색창', bottom(box)], ['사용설명서 머리', bottom(document.getElementById('home-guide-title')?.parentElement)]]`)))

await j.run('A2', () => pairs('A2', '/', '홈: 대표 종목 세 칸 아래 선 = 사용설명서 4단계 아래 선', new Function(`
  const bottom = ${BOTTOM}
  const themes = document.querySelector('main h1')?.closest('section')
  const cards = themes && [...themes.querySelectorAll('div')].find((d) => parseFloat(getComputedStyle(d).borderBottomWidth) === 1)
  return [['세 칸', bottom(cards)], ['4단계', bottom(document.querySelector('section[aria-labelledby="home-guide-title"] ol > li:last-child'))]]`)))

await j.run('A3', () => pairs('A3', '/', '홈: 현재 주가 보기 먹 선 = 커뮤니티 먹 선(사용자 캡처)', new Function(`
  const bottom = ${BOTTOM}
  const list = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '현재 주가 보기')
  return [['현재 주가 보기', bottom(list?.parentElement)], ['커뮤니티', bottom(document.getElementById('home-community-title')?.parentElement)]]`)))

await j.run('A4', () => pairs('A4', '/backtest', '백테스트: 화면 제목 먹 선 = 가이드 제목 먹 선', new Function(`
  const bottom = ${BOTTOM}
  return [['주식 백테스트 이용하기', bottom(document.querySelector('main h1'))], ['가이드', bottom(document.querySelector('main aside h2'))]]`)))

await j.run('A5', () => pairs('A5', '/mypage', '마이페이지 한눈에 보기: 왼쪽 메뉴 아래 선 = 첫 두 칸의 먹 선', new Function(`
  const bottom = ${BOTTOM}
  const menu = [...document.querySelectorAll('main ul')].find((ul) => ul.textContent.includes('한눈에 보기'))
  const head = (name) => [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === name)?.parentElement
  return [['메뉴', bottom(menu)], ['내 투자성향', bottom(head('내 투자성향'))], ['관심종목', bottom(head('관심종목'))]]`)))

/*
 * G: 두 열이 나란한 화면 전부에서, 옆 열(가로로 안 겹치고 사이 160px 안)의 가로선끼리 0.75~8px 어긋난 것,
 * 굵은 먹 선(2px)끼리 24px 안에서 어긋난 것이 없어야 한다. 단추·링크·입력칸·표 칸의 테두리와 단추·링크 안의 선(고른 전략 카드의
 * 매수·매도 줄)은 그 단추의 일부라 뺀다. 검색창·대화창처럼 단추가 아닌 상자의 테두리는 센다
 */
const SCREENS = [
  ['home', '/', true], ['home-out', '/', false], ['stock', '/stocks/005930', true], ['likes', '/likes', true],
  ['backtest', '/backtest', true], ['ai', '/ai', true], ['guide', '/guide', true], ['mypage', '/mypage', true],
  ['mypage-personality', '/mypage/personality', true], ['mypage-profile', '/mypage/profile', true],
  ['personality-test', '/personality-test', true], ['login', '/login', false],
]
await j.run('G', async () => {
  for (const [name, path, loggedIn] of SCREENS) {
    const bad = []
    for (const width of WIDTHS) {
      const t = await j.open({ width, height: 1080, loggedIn })
      await t.goto(path, 2000)
      await t.page.evaluate(() => document.fonts.ready)
      const found = await t.page.evaluate(() => {
        const SKIP = 'button, button *, a, a *, input, select, textarea, th, td, [role="log"] *'
        const lines = []
        for (const el of document.querySelectorAll('main *')) {
          if (el.matches(SKIP)) continue
          const r = el.getBoundingClientRect()
          if (r.width < 40 || r.height === 0) continue
          const cs = getComputedStyle(el)
          if (cs.visibility === 'hidden') continue
          for (const side of ['Top', 'Bottom']) {
            const bw = parseFloat(cs[`border${side}Width`])
            if (!bw || cs[`border${side}Style`] === 'none' || cs[`border${side}Color`] === 'rgba(0, 0, 0, 0)') continue
            const y = (side === 'Top' ? r.top + bw : r.bottom) + scrollY
            lines.push({ y, x1: r.left, x2: r.right, bw, who: `${el.tagName.toLowerCase()}「${(el.innerText || '').trim().split('\n')[0].slice(0, 14)}」` })
          }
        }
        const out = []
        for (let i = 0; i < lines.length; i++) for (let k = i + 1; k < lines.length; k++) {
          const a = lines[i], b = lines[k]
          const gap = Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2)
          if (gap < 0 || gap > 160) continue
          const dy = Math.abs(a.y - b.y)
          const limit = a.bw >= 2 && b.bw >= 2 ? 24 : 8
          if (dy > 0.75 && dy <= limit) out.push(`${a.who} ${a.y.toFixed(1)} ↔ ${b.who} ${b.y.toFixed(1)} (${dy.toFixed(1)}px)`)
        }
        return out
      })
      if (found.length) bad.push(`${width}: ${found.join(' · ')}`)
      await t.close()
    }
    j.report(`G ${name}`, bad.length === 0, bad.length ? '\n    ' + bad.join('\n    ') : '옆 열 가로선 어긋남 없음')
  }
})

await j.finish()
