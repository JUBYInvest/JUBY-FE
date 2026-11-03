// 화면 사이 위계·세부 판정(2026-11-03 사용자 "디자인적으로 어색한 부분이나, 위계가 통일되어 있지 않거나, 세부항목별 어색한 부분을 찾아서 고쳐줘").
// 위계는 셋이다: 화면 제목(h1) 28px(900px 이하 24px) + 굵은 먹 선 > 구역 제목 20px(46px 줄 + 굵은 먹 선) > 칸 안 작은 제목 16~18px(가는 선·여백).
//  C1 화면 제목: 제목이 있는 화면마다 같은 크기·같은 높이(넓은 화면 88px, 휴대폰 112px)에 서고 아래 2px 먹 선이 있다.
//     백테스트만 8px(휴대폰 28px) 아래였고, 투자성향 테스트는 가운데 맞춘 28px에 선이 없었고(휴대폰도 28px), 없는 주소는 24px에 선이 없었다
//  C2 백테스트 결과: '백테스트 결과'는 구역 제목(20px, 46px 줄, 바로 아래 먹 선, 다시하기 단추가 그 줄 안). 결과 안 작은 칸은 가는 선(1px)으로 열고,
//     지표 여섯은 세 칸 두 줄(600px 이하 두 칸) — 다섯 칸이던 때는 '거래횟수' 하나만 둘째 줄에 남았다. 가이드 칸 작은 제목은 16px.
//     결과 칸 제목·지표 글자는 결과 제목과 왼쪽 끝이 같다(휴대폰에서 상자이던 때의 안 여백 16·12px이 남아 있었다)
//  C3 주식 모아보기: 나란한 두 구역 제목('한눈에 보기' | '담은 종목')의 글자 바닥선이 맞는다(탭이 있는 쪽이 10px 위였다). 하트는 종목 이름 줄 옆에 선다
//  C4 AI 이전 대화: 넓은 화면의 머리는 46px 한 줄(제목 + 새 대화)이고 먹 선은 그 바로 아래다(단추 아래에 선이 그어졌었다)
//  C5 마이페이지: 세 화면의 맨 위 한 줄(이름·성향 이름)은 같은 크기이고 화면 제목보다 작다. 구역 안 결론 줄·성향 칸 제목은 구역 제목보다 작다.
//     본문 링크는 같은 곳으로 가는 왼쪽 메뉴와 같은 이름이다('투자유형 자세히'·'내 정보 보기'가 메뉴로는 '투자유형 보기'·'내 정보 확인'이었다)
//  C6 투자성향 테스트: 옅은 면 판 안에 보기 칸을 얹지 않는다(판 안에 상자). 결과 화면에 다 찬 진행 막대를 두지 않는다(먹 선 아래 초록 줄로만 보였다)
// node consistency.mjs <BASE> [--only C1,C2] [--headed]
import { cli, judge, sleep } from './lib.mjs'

const j = await judge(cli())
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

/** 화면의 h1: 글자 크기, 위 끝(문서 기준), 아래 선 두께 */
const h1Of = (page) => page.evaluate(() => {
  const h = document.querySelector('main h1')
  if (!h) return null
  const s = getComputedStyle(h)
  return { text: h.textContent.trim(), fs: parseFloat(s.fontSize), top: Math.round(h.getBoundingClientRect().top + scrollY), rule: parseFloat(s.borderBottomWidth), align: s.textAlign }
})

/** 종목 상세에서 '이 종목 백테스트'로 넘어가 결과까지 */
async function openResult(width) {
  const t = await j.open({ width, height: 900 })
  await t.goto('/stocks/005930', 1800)
  await t.page.getByRole('link', { name: /이 종목 백테스트/ }).first().click()
  await t.page.getByRole('heading', { name: '백테스트 결과' }).waitFor({ timeout: 8000 })
  await sleep(400)
  return t
}

await j.run('C1', async () => {
  const screens = [['/backtest', true], ['/ai', true], ['/guide', true], ['/mypage', true], ['/mypage/profile', true], ['/personality-test', true], ['/nope', false]]
  for (const [width, size, top] of [[1440, 28, 88], [390, 24, 112]]) {
    const rows = []
    for (const [path, loggedIn] of screens) {
      const t = await j.open({ width, loggedIn })
      await t.goto(path, 1500)
      await t.page.evaluate(() => document.fonts.ready)
      rows.push([path, await h1Of(t.page)])
      await t.close()
    }
    const bad = rows.filter(([path, h]) => h === null || h.fs !== size || h.rule !== 2 || (path !== '/nope' && !near(h.top, top)) || h.align === 'center')
    j.report(`C1-${width}`, bad.length === 0, `화면 제목 ${size}px·먹 선 2px·위 ${top}px(없는 주소는 로그인처럼 가운데 줄) — ${rows.map(([p, h]) => `${p} ${h ? `${h.fs}px@${h.top} 선${h.rule}${h.align === 'center' ? ' 가운데' : ''}` : '없음'}`).join(' · ')}`)
  }
})

await j.run('C2', async () => {
  for (const width of [1440, 390]) {
    const t = await openResult(width)
    const r = await t.page.evaluate(() => {
      const title = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '백테스트 결과')
      const head = title.parentElement
      const hs = getComputedStyle(head), hr = head.getBoundingClientRect()
      const retry = [...head.querySelectorAll('button')].find((b) => b.textContent.includes('다시하기'))
      const cards = [...document.querySelectorAll('main h3')].filter((h) => !h.closest('aside')).map((h) => getComputedStyle(h.parentElement).borderTopWidth)
      // 묶음의 클래스 이름은 '_원래이름_해시'다(CSS Modules)
      const items = [...document.querySelectorAll('main li[class*="_metric_"]')]
      const tops = [...new Set(items.map((li) => Math.round(li.getBoundingClientRect().top)))]
      const guide = [...document.querySelectorAll('aside h3')].map((h) => parseFloat(getComputedStyle(h).fontSize))
      // 결과 칸 제목·지표 글자의 왼쪽 끝이 결과 제목과 같은가(휴대폰에서 상자이던 때의 안 여백이 남아 16px 안쪽이었다)
      const left = Math.round(title.getBoundingClientRect().left)
      const textLeft = (el) => { const range = document.createRange(); range.selectNodeContents(el); return Math.round(range.getBoundingClientRect().left) - left }
      // 지표는 줄마다 첫 칸(가장 왼쪽)만 견준다
      const lefts = [...document.querySelectorAll('main h3')].filter((h) => !h.closest('aside')).map(textLeft)
        .concat(Math.min(...items.map((li) => textLeft(li.firstElementChild))))
      return { fs: parseFloat(getComputedStyle(title).fontSize), headH: Math.round(hr.height), rule: hs.borderBottomWidth, retryIn: retry !== undefined, cards, metrics: items.length, rows: tops.length, firstRow: items.filter((li) => Math.round(li.getBoundingClientRect().top) === tops[0]).length, guide, lefts }
    })
    j.report(`C2a-${width}`, r.fs === 20 && r.headH === 46 && r.rule === '2px' && r.retryIn, `'백테스트 결과' ${r.fs}px, 제목 줄 ${r.headH}px·아래 선 ${r.rule}, 다시하기 단추 ${r.retryIn ? '줄 안' : '줄 밖'}`)
    j.report(`C2b-${width}`, r.cards.length >= 3 && r.cards.every((w) => w === '1px'), `결과 안 작은 칸 위 선 ${r.cards.join('·')}(굵은 먹 선은 구역 제목에만)`)
    const cols = width > 600 ? 3 : 2
    j.report(`C2c-${width}`, r.metrics === 6 && r.firstRow === cols && r.rows === 6 / cols, `지표 ${r.metrics}개 — 첫 줄 ${r.firstRow}칸 · ${r.rows}줄(기대 ${cols}칸 ${6 / cols}줄)`)
    j.report(`C2e-${width}`, r.lefts.length >= 4 && r.lefts.every((d) => Math.abs(d) <= 1), `결과 칸 제목·지표 글자 왼쪽 끝 − 결과 제목 왼쪽 끝 ${[...new Set(r.lefts)].join('·')}px`)
    if (width === 1440) j.report('C2d', r.guide.length >= 3 && r.guide.every((fs) => fs === 16), `가이드 칸 작은 제목 ${r.guide.join('·')}px(기대 16)`)
    await t.close()
  }
})

await j.run('C3', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/likes', 1800)
  await t.page.evaluate(() => document.fonts.ready)
  const r = await t.page.evaluate(() => {
    const bottom = (id) => { const h = document.getElementById(id); const range = document.createRange(); range.selectNodeContents(h); return range.getBoundingClientRect().bottom }
    const row = document.querySelector('#likes-list-title').closest('section').querySelector('ul li')
    const heart = row.querySelector('button')
    const who = row.querySelector('[class*="_who_"]')
    const hr = heart.getBoundingClientRect(), wr = who.getBoundingClientRect()
    return { map: bottom('likes-map-title'), list: bottom('likes-list-title'), heartMid: (hr.top + hr.bottom) / 2, whoMid: (wr.top + wr.bottom) / 2 }
  })
  j.report('C3a', near(r.map, r.list, 2), `'한눈에 보기'·'담은 종목' 글자 아래 끝 ${Math.round(r.map)}·${Math.round(r.list)}px`)
  j.report('C3b', near(r.heartMid, r.whoMid, 6), `하트 가운데 ${Math.round(r.heartMid)}px · 종목 이름 칸(이름·코드) 가운데 ${Math.round(r.whoMid)}px`)
  await t.close()
})

await j.run('C4', async () => {
  const t = await j.open({ width: 1440, rooms: 2 })
  await t.goto('/ai', 1800)
  const r = await t.page.evaluate(() => {
    const title = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '이전 대화내용')
    const head = title.parentElement
    const hr = head.getBoundingClientRect()
    const button = [...head.querySelectorAll('button')].find((b) => b.textContent.includes('새 대화'))
    const br = button.getBoundingClientRect(), tr = title.getBoundingClientRect()
    return { h: Math.round(hr.height), rule: getComputedStyle(head).borderBottomWidth, sameLine: br.top < tr.bottom && br.bottom > tr.top, below: Math.round(hr.bottom - br.bottom) }
  })
  j.report('C4', r.h === 46 && r.rule === '2px' && r.sameLine, `머리 ${r.h}px·아래 선 ${r.rule}, 새 대화 단추 ${r.sameLine ? '제목과 한 줄' : '제목 아래'}(먹 선까지 ${r.below}px)`)
  await t.close()
})

await j.run('C5', async () => {
  for (const [width, page, hero] of [[1440, 28, 24], [390, 24, 20]]) {
    const sizes = {}
    for (const path of ['/mypage', '/mypage/personality', '/mypage/profile']) {
      const t = await j.open({ width })
      await t.goto(path, 1600)
      sizes[path] = await t.page.evaluate((path) => {
        const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
        // 묶음의 클래스 이름은 '_원래이름_해시'다(CSS Modules)
        const cls = (name) => document.querySelector(`main [class*="_${name}_"]`)
        if (path === '/mypage') {
          const section = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '내 투자성향')
          return { hero: px(cls('memberName')), section: px(section), inner: px(cls('lead')) }
        }
        if (path === '/mypage/personality') {
          const hs = [...document.querySelectorAll('main h2, main h3')]
          const type = hs.find((h) => h.tagName === 'H2' && h.textContent.trim() === '위험중립형')
          const section = hs.find((h) => h.textContent.trim() === '다섯 성향 둘러보기')
          const panel = hs.find((h) => h.tagName === 'H3' && h.textContent.includes('위험중립형'))
          return { hero: px(type), section: px(section), inner: px(panel) }
        }
        const name = [...document.querySelectorAll('main h2')][0]
        return { hero: px(name) }
      }, path)
      if (path === '/mypage' && width === 1440) {
        const links = await t.page.evaluate(() => {
          const menu = Object.fromEntries([...document.querySelectorAll('main aside[aria-label="마이페이지 메뉴"] a')].map((a) => [new URL(a.href).pathname, a.textContent.trim()]))
          const body = [...document.querySelectorAll('main a')].filter((a) => !a.closest('aside')).map((a) => [new URL(a.href).pathname, a.textContent.trim()]).filter(([p]) => p in menu)
          return body.map(([p, text]) => ({ p, text, menu: menu[p] }))
        })
        j.report('C5c', links.length >= 2 && links.every((l) => l.text === l.menu), `본문 링크 이름 = 메뉴 이름 — ${links.map((l) => `${l.p} '${l.text}'/'${l.menu}'`).join(' · ')}`)
      }
      await t.close()
    }
    const heroes = Object.values(sizes).map((s) => s.hero)
    j.report(`C5a-${width}`, heroes.every((fs) => fs === hero) && hero < page, `맨 위 한 줄 ${heroes.join('·')}px(기대 ${hero}, 화면 제목 ${page}px보다 작게)`)
    const inner = ['/mypage', '/mypage/personality'].map((p) => sizes[p])
    j.report(`C5b-${width}`, inner.every((s) => s.inner !== null && s.section !== null && s.inner < s.section), `구역 안 결론 줄·성향 칸 제목 < 구역 제목 — ${inner.map((s) => `${s.inner}<${s.section}`).join(' · ')}`)
  }
})

await j.run('C6', async () => {
  for (const width of [1440, 390]) {
    const t = await j.open({ width })
    await t.goto('/personality-test', 1500)
    const panel = await t.page.evaluate(() => {
      const choice = document.querySelector('main button[aria-pressed]')
      const filled = []
      for (let el = choice.parentElement; el && el.tagName !== 'MAIN'; el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') filled.push(`${el.tagName.toLowerCase()} ${bg}`)
      }
      return filled
    })
    j.report(`C6a-${width}`, panel.length === 0, `보기 칸을 얹은 면 ${panel.length === 0 ? '없음(흰 바탕)' : panel.join(', ')}`)
    // 끝까지 풀어 결과 화면
    for (let i = 0; i < 12; i++) {
      const option = t.page.locator('main button[aria-pressed]').first()
      if ((await option.count()) === 0) break
      await option.click()
      await t.page.getByRole('button', { name: /다음|결과 보기/ }).click()
      await sleep(300)
    }
    await t.page.getByRole('link', { name: '완료' }).waitFor({ timeout: 8000 })
    const bars = await t.page.locator('main [role="progressbar"]').count()
    j.report(`C6b-${width}`, bars === 0, `결과 화면 진행 막대 ${bars}개`)
    await t.close()
  }
})

await j.finish()
