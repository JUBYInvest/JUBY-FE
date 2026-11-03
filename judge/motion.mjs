// 화면 전환 판정(2026-11-03 사용자 "화면전환은 네가 생각해서 디자인해줘"): 새 화면으로 가면 본문이 떠오르고(App.tsx Layout),
// 머리글 메뉴의 막대가 앞 메뉴에서 누른 메뉴로 미끄러진다(Header.tsx). 뒤로 가기·움직임 줄이기·줄이 다른 메뉴·처음 들어올 때는 걸지 않는다.
// 화면 묶음이 늦으면 머리글 띠 아래 끝에 줄이 흐른다(150ms 뒤, Header .progress · utils/routeLoading.ts).
// Element.prototype.animate를 감싸 어디에 무엇을 걸었는지 적는다 — 220ms 안에 getAnimations()로 붙잡는 것보다 흔들리지 않는다.
// node motion.mjs <BASE> [--only M1,M2] [--headed]
import { cli, judge, sleep } from './lib.mjs'

const j = await judge(cli())

const RECORD = () => {
  const original = Element.prototype.animate
  window.__anims = []
  Element.prototype.animate = function (keyframes, options) {
    window.__anims.push({
      target: this.tagName === 'MAIN' ? 'main' : this.closest?.('header') ? 'header' : this.tagName.toLowerCase(),
      label: (this.getAttribute?.('data-label') ?? '').slice(0, 20),
      pseudo: options?.pseudoElement ?? null,
      duration: options?.duration ?? null,
      easing: options?.easing ?? null,
      from: Array.isArray(keyframes) ? keyframes[0] : null,
    })
    return original.call(this, keyframes, options)
  }
}

async function openRecorded(opts = {}) {
  const t = await j.open(opts)
  await t.context.addInitScript(RECORD)
  return t
}
const anims = (page) => page.evaluate(() => window.__anims.splice(0))
const clickMenu = (page, nav, label) => page.locator(`nav[aria-label="${nav}"] a[data-label="${label}"]`).click()

/** 막대(::before)가 링크 안 제자리에 섰는가 — 움직임이 끝난 뒤 */
const barSettled = (page, label) => page.evaluate((label) => {
  const a = document.querySelector(`header nav a[data-label="${label}"]`)
  if (a === null || a.getAttribute('aria-current') !== 'page') return `현재 메뉴가 아님`
  const before = getComputedStyle(a, '::before')
  return before.transform === 'none' && before.height === '3px' ? 'ok' : `transform ${before.transform}, height ${before.height}`
}, label)

await j.run('M1', async () => {
  const t = await openRecorded({ width: 1440 })
  await t.goto('/', 1500)
  const first = await anims(t.page)
  j.report('M1a', first.length === 0, `처음 들어올 때는 걸지 않는다 — animate ${first.length}건`)

  await clickMenu(t.page, '서비스', '주식 백테스트')
  await sleep(60)
  const got = await anims(t.page)
  const main = got.filter((a) => a.target === 'main')
  const bar = got.filter((a) => a.target === 'header')
  j.report('M1b', main.length === 1 && main[0].duration === 220 && /translateY\(8px\)/.test(main[0].from?.transform ?? '') && main[0].from?.opacity === 0,
    `본문이 8px 아래에서 220ms 떠오른다 — ${JSON.stringify(main)}`)
  const dx = Number((bar[0]?.from?.transform ?? '').match(/translateX\((-?[\d.]+)px\)/)?.[1])
  j.report('M1c', bar.length === 1 && bar[0].pseudo === '::before' && bar[0].label === '주식 백테스트' && dx < 0 && bar[0].duration === main[0]?.duration && bar[0].easing === main[0]?.easing,
    `메뉴 막대가 왼쪽(홈)에서 미끄러져 온다, 본문과 같은 때·곡선 — ${JSON.stringify(bar)}`)
  await sleep(400)
  const settled = await barSettled(t.page, '주식 백테스트')
  j.report('M1d', settled === 'ok', `움직임이 끝나면 막대가 제자리 — ${settled}`)

  await clickMenu(t.page, '서비스', '홈')
  await sleep(60)
  const back = (await anims(t.page)).filter((a) => a.target === 'header')
  const dx2 = Number((back[0]?.from?.transform ?? '').match(/translateX\((-?[\d.]+)px\)/)?.[1])
  j.report('M1e', back.length === 1 && dx2 > 0, `반대로 가면 오른쪽에서 온다 — translateX ${dx2}`)

  await t.page.goBack()
  await sleep(400)
  const pop = await anims(t.page)
  j.report('M2', pop.length === 0 && (await t.page.evaluate(() => location.pathname)) === '/backtest',
    `뒤로 가기는 본문도 막대도 움직이지 않고 바로 선다 — animate ${pop.length}건 ${JSON.stringify(pop)}`)
  j.report('M2b', (await barSettled(t.page, '주식 백테스트')) === 'ok', '뒤로 간 뒤 막대는 돌아간 메뉴에 있다')
  await t.close()
})

await j.run('M3', async () => {
  const t = await openRecorded({ width: 390, height: 844 })
  await t.goto('/', 1500)
  await anims(t.page)
  await clickMenu(t.page, '서비스', '관심종목')
  await sleep(60)
  const same = await anims(t.page)
  j.report('M3a', same.some((a) => a.target === 'header' && a.pseudo === '::before'), `휴대폰 아랫줄(서비스 메뉴)끼리는 막대가 미끄러진다 — ${same.map((a) => a.target).join(',')}`)
  await sleep(400)
  await clickMenu(t.page, '계정', '마이페이지')
  await sleep(60)
  const cross = await anims(t.page)
  j.report('M3b', !cross.some((a) => a.target === 'header') && cross.some((a) => a.target === 'main'),
    `줄이 다른 메뉴(아랫줄 → 윗줄 마이페이지)로는 막대를 옮기지 않고 본문만 떠오른다 — ${cross.map((a) => a.target).join(',')}`)
  await t.close()
})

await j.run('M4', async () => {
  const t = await openRecorded({ width: 1440 })
  await t.page.emulateMedia({ reducedMotion: 'reduce' })
  await t.goto('/', 1500)
  await anims(t.page)
  await clickMenu(t.page, '서비스', 'AI 주가분석')
  await sleep(400)
  const got = await anims(t.page)
  j.report('M4', got.length === 0 && (await barSettled(t.page, 'AI 주가분석')) === 'ok', `움직임 줄이기 설정에서는 걸지 않는다 — animate ${got.length}건`)
  await t.close()
})

await j.run('M5', async () => {
  const t = await openRecorded({ width: 1440 })
  await t.goto('/', 1500)
  await anims(t.page)
  // 홈 시세표 첫 종목 → 상세(머리글에 지금 메뉴 없음) → 머리글 '홈'
  await t.page.locator('a[href^="/stocks/"]').first().click()
  await sleep(60)
  const toDetail = await anims(t.page)
  await sleep(1200)
  await clickMenu(t.page, '서비스', '사용설명서')
  await sleep(60)
  const fromDetail = await anims(t.page)
  j.report('M5', toDetail.some((a) => a.target === 'main') && !toDetail.some((a) => a.target === 'header') && !fromDetail.some((a) => a.target === 'header') && fromDetail.some((a) => a.target === 'main'),
    `지금 메뉴가 없는 화면(종목 상세)을 오가면 막대는 그 자리에 서고 본문만 떠오른다 — 상세로 ${toDetail.map((a) => a.target)}, 상세에서 ${fromDetail.map((a) => a.target)}`)
  await t.close()
})

await j.run('M6', async () => {
  // 주식 모아보기·사용설명서 화면 묶음을 1.2초 늦춘다. 화면 이동은 묶음이 올 때까지 앞 화면을 그대로 두므로(React Router 전환),
  // 받는 중 표시는 머리글 띠 아래 끝의 흐르는 줄이다 — 150ms가 지나야 보인다
  const slow = async (t, name) => t.page.route((url) => new RegExp(`/assets/${name}-[^/]*\\.js$`).test(url.pathname), async (route) => { await sleep(1200); await route.continue() })
  const line = (page) => page.evaluate(() => {
    const s = document.querySelector('header [role="status"][aria-label="화면을 불러오는 중"]')
    return s === null ? null : Number(getComputedStyle(s).opacity)
  })
  const t = await j.open({ width: 1440 })
  await slow(t, 'LikesPage')
  await t.goto('/', 1500)
  j.report('M6a', (await line(t.page)) === null, '받을 묶음이 없으면 줄이 없다')
  await clickMenu(t.page, '서비스', '관심종목')
  await sleep(60)
  const early = await line(t.page)
  await sleep(400)
  const late = await line(t.page)
  const stillHome = await t.page.evaluate(() => document.querySelector('main a[href^="/stocks/"]') !== null)
  j.report('M6b', early === 0 && late === 1 && stillHome, `메뉴로 옮길 때 묶음이 늦으면 앞 화면을 둔 채 띠 아래 줄이 150ms 뒤에 보인다 — 60ms ${early}, 460ms ${late}, 앞 화면 그대로 ${stillHome}`)
  await sleep(1200)
  const done = await t.page.evaluate(() => location.pathname === '/likes' && document.querySelector('header [aria-label="화면을 불러오는 중"]') === null)
  j.report('M6c', done, '묶음이 오면 줄이 걷히고 새 화면이 선다')
  await t.close()

  const d = await j.open({ width: 390, height: 844 })
  await slow(d, 'GuidePage')
  await d.page.goto(j.BASE + '/guide', { waitUntil: 'domcontentloaded' })
  await sleep(500)
  const direct = await line(d.page)
  await sleep(1400)
  const directDone = await d.page.evaluate(() => document.querySelector('header [aria-label="화면을 불러오는 중"]') === null && document.querySelector('main h1') !== null)
  j.report('M6d', direct === 1 && directDone, `주소를 직접 열 때도 같은 줄이다(휴대폰) — 500ms ${direct}, 다 받은 뒤 걷힘 ${directDone}`)
  await d.close()
})

await j.finish()
