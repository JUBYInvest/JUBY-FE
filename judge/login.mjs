// 로그인 화면 판정(2026-11-02 사용자 "로그인 페이지는 너무나 별론데, 최신 환경에 맞춰서 … 아예 다시 디자인해줘").
// 글자가 든 소셜 단추 셋(카카오·네이버·Google), 가운데 한 줄, 최근에 쓴 계정 표시, 로그인 뒤 순서 세 칸. /api는 전부 가짜(mock.mjs),
// 소셜 로그인 주소(api.juby.store)로 가는 이동은 mock이 막고 "BLOCKED 경로"로 적는다.
// node login.mjs <BASE> [--only L1,L5] [--headed]
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const j = await judge(cli())
const NAMES = ['카카오로 로그인', '네이버로 로그인', 'Google로 로그인']

/** 단추 셋의 위치·크기·글자색 대비, 단추 뒤 면 */
const measure = (page) => page.evaluate(() => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const main = document.querySelector('main')
  const buttons = [...main.querySelectorAll('button')].filter((b) => /로 로그인/.test(b.textContent))
  const title = main.querySelector('h1')
  return {
    names: buttons.map((b) => b.textContent.replace(/최근 사용/, '').trim()),
    boxes: buttons.map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, height: r.height, width: r.width } }),
    contrast: buttons.map((b) => { const cs = getComputedStyle(b); return ratio(cs.color, cs.backgroundColor) }),
    shadows: buttons.map((b) => getComputedStyle(b).boxShadow),
    // 단추에서 main까지 올라가며 흰색이 아닌 바탕을 칠한 것(예전 옅은 회색 면)
    panels: buttons.flatMap((b) => { const out = []; for (let el = b.parentElement; el && el !== main; el = el.parentElement) { const bg = getComputedStyle(el).backgroundColor; if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') out.push(bg) } return out }),
    title: title ? { text: title.textContent.trim(), rule: getComputedStyle(title).borderBottomWidth, left: title.getBoundingClientRect().left, right: title.getBoundingClientRect().right } : null,
    center: (main.getBoundingClientRect().left + main.getBoundingClientRect().right) / 2,
  }
})

await j.run('L1', async () => {
  for (const width of [1920, 1440, 1101]) {
    const t = await j.open({ loggedIn: false, width, height: 1080 })
    await t.goto('/login', 1200)
    await t.page.evaluate(() => document.fonts.ready)
    const m = await measure(t.page)
    const accessible = await Promise.all(NAMES.map((name) => t.page.getByRole('button', { name, exact: false }).count()))
    const sameColumn = m.boxes.every((b) => Math.abs(b.left - m.title.left) < 1 && Math.abs(b.right - m.title.right) < 1)
    const centered = Math.abs((m.title.left + m.title.right) / 2 - m.center) < 1
    // L1 글자가 든 단추 셋(카카오 → 네이버 → Google), 높이 48px 이상, 제목 줄과 같은 폭 한 줄, 화면 가운데
    j.report(`L1 ${width}`, JSON.stringify(m.names) === JSON.stringify(NAMES) && accessible.every((n) => n === 1) && m.boxes.every((b) => b.height >= 48) && sameColumn && centered,
      `단추 ${JSON.stringify(m.names)}, 높이 ${m.boxes.map((b) => b.height).join('/')}, 폭 ${m.boxes.map((b) => Math.round(b.width)).join('/')} = 제목 ${Math.round(m.title?.right - m.title?.left)} ${sameColumn}, 가운데 ${centered}`)
    if (width === 1920) {
      // L2 제목은 다른 화면처럼 굵은 먹 선, 단추 뒤 회색 면 없음, 단추 그림자 없음, 글자 대비 4.5:1 이상
      j.report('L2', m.names.length === 3 && m.title?.text === '로그인' && m.title?.rule === '2px' && m.panels.length === 0 && m.shadows.every((s) => s === 'none') && m.contrast.every((c) => c >= 4.5),
        `제목 "${m.title?.text}" 선 ${m.title?.rule}, 단추 뒤 면 ${JSON.stringify(m.panels)}, 그림자 ${JSON.stringify([...new Set(m.shadows)])}, 대비 ${m.contrast.map((c) => c.toFixed(1)).join('/')}`)
      // L3 로그인 뒤 순서 세 칸. 가운데 칸 양 끝 = 단추 양 끝
      const steps = await t.page.evaluate(() => {
        const head = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '로그인하면 이렇게 시작해요')
        const items = head ? [...head.parentElement.querySelectorAll('li')] : []
        return { head: !!head, items: items.map((li) => { const r = li.getBoundingClientRect(); return { text: li.textContent, left: r.left, right: r.right } }) }
      })
      const mid = steps.items[1]
      const edges = mid && Math.abs(mid.left - m.boxes[0].left) < 1 && Math.abs(mid.right - m.boxes[0].right) < 1
      const words = ['투자성향 테스트', '주식 백테스트', 'AI 주가분석'].every((w, i) => steps.items[i]?.text.includes(w))
      j.report('L3', steps.head && steps.items.length === 3 && edges && words,
        `제목 ${steps.head}, 칸 ${steps.items.length}, 가운데 칸 ${mid ? `${Math.round(mid.left)}~${Math.round(mid.right)}` : '-'} = 단추 ${Math.round(m.boxes[0].left)}~${Math.round(m.boxes[0].right)} ${edges}, 세 이름 ${words}`)
    }
    await t.close()
  }
})

await j.run('L4', async () => {
  // L4 단추를 누르면 그 회사 로그인 주소로 떠나고 돌아갈 자리를 적어 둔다. 백엔드로는 보내지 않는다 —
  // 그 이동에 204(내용 없음)로 답해 화면이 제자리에 남게 하고 가려던 주소만 적는다
  const got = []
  for (const [i, provider] of ['kakao', 'naver', 'google'].entries()) {
    const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
    const went = []
    await t.page.route('https://api.juby.store/oauth2/**', (route) => { went.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 204 }) })
    await t.goto('/login?next=%2Fbacktest', 1000)
    // 204로 끝나는 이동은 끝나지 않아 click()이 기다리기만 한다 — 화면 안에서 누른다
    await t.page.getByRole('button', { name: NAMES[i] }).evaluate((b) => b.click())
    await sleep(800)
    const saved = await t.page.evaluate(() => sessionStorage.getItem('loginReturnPath'))
    got.push({ provider, went: went.join(','), saved })
    await t.close()
  }
  j.report('L4', got.every((g) => g.went === `/oauth2/authorization/${g.provider}` && g.saved === '/backtest'), JSON.stringify(got))
})

await j.run('L5', async () => {
  // L5 지난번에 쓴 계정에만 "최근 사용"이 붙는다. 없으면 아무 데도 없다
  const t = await j.open({ loggedIn: false, width: 1440, height: 900, seed: { lastLoginProvider: JSON.stringify('NAVER') } })
  await t.goto('/login', 1000)
  const marked = await t.page.locator('main button').evaluateAll((bs) => bs.filter((b) => /최근 사용/.test(b.textContent)).map((b) => b.textContent.replace('최근 사용', '').trim()))
  const named = await t.page.getByRole('button', { name: /네이버로 로그인.*최근 사용/ }).count()
  await t.close()
  const u = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await u.goto('/login', 1000)
  const none = await u.page.getByText('최근 사용').count()
  await u.close()
  j.report('L5', JSON.stringify(marked) === JSON.stringify(['네이버로 로그인']) && named === 1 && none === 0, `표시된 단추 ${JSON.stringify(marked)}, 읽어 주는 이름에 포함 ${named}, 기록 없을 때 ${none}`)
})

await j.run('L6', async () => {
  // L6 로그인을 마치면 서버가 알려 준 가입 경로(mock: GOOGLE)를 적는다. 회원 정보 요청은 전처럼 1건
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  const { tokenFor } = await import('./mock.mjs')
  await t.goto(`/oauth2/callback#accessToken=${tokenFor()}`, 2000)
  const saved = await t.page.evaluate(() => localStorage.getItem('lastLoginProvider'))
  const members = t.count(/^GET \/api\/members\/me$/)
  await t.close()
  j.report('L6', saved === JSON.stringify('GOOGLE') && members === 1, `저장 ${saved}, 회원 정보 요청 ${members}건`)
})

await j.run('L7', async () => {
  // L7 로그인 실패로 돌아오면 무엇이 일어났고 어떻게 하는지 알린다. ?next=가 있으면 돌아갈 곳을 알린다
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await t.goto('/oauth2/error?error=access_denied', 1500)
  const alert = (await t.page.getByRole('alert').textContent().catch(() => '')) ?? ''
  await t.goto('/login?next=%2Fbacktest', 1000)
  const back = await t.page.getByText('보던 화면으로 돌아가요').count()
  await t.goto('/login', 1000)
  const backHome = await t.page.getByText('보던 화면으로 돌아가요').count()
  await t.close()
  j.report('L7', /로그인을 마치지 못했어요/.test(alert) && /다시/.test(alert) && back === 1 && backHome === 0,
    `실패 안내 "${alert.trim()}", next 있을 때 돌아갈 곳 안내 ${back}, 없을 때 ${backHome}`)
})

await j.run('L8', async () => {
  // L8 좁은 화면: 넘침 없음, 단추는 본문 폭을 채우고 48px, 순서 세 칸은 위아래로 쌓인다. 키보드 포커스가 보인다
  const out = []
  for (const [width, height] of [[375, 812], [320, 640], [768, 1024]]) {
    const t = await j.open({ loggedIn: false, width, height })
    await t.goto('/login', 1000)
    const m = await measure(t.page)
    const stacked = await t.page.evaluate(() => {
      const head = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '로그인하면 이렇게 시작해요')
      const lis = head ? [...head.parentElement.querySelectorAll('li')].map((li) => li.getBoundingClientRect()) : []
      return lis.length === 3 && lis[0].bottom <= lis[1].top + 1 && lis[1].bottom <= lis[2].top + 1
    })
    await t.page.getByRole('button', { name: NAMES[0] }).focus()
    await t.page.keyboard.press('Tab')
    const outline = await t.page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
    out.push({ width, over: !(await noOverflow(t.page)), fill: m.boxes.every((b) => b.height >= 48 && Math.abs(b.width - (m.title.right - m.title.left)) < 1), stacked, outline })
    await t.close()
  }
  j.report('L8', out.every((o) => !o.over && o.fill && o.stacked && o.outline !== 'none'), JSON.stringify(out))
})

await j.run('L9', async () => {
  // L9 네이버 아이콘은 흰 바탕에서 보이는 초록이다(마이페이지 "네이버로 가입한 계정"도 같은 파일 — 흰 N이라 안 보였다)
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await t.goto('/login', 800)
  const svg = await t.page.evaluate(() => fetch('/social/naver.svg').then((r) => r.text()))
  await t.close()
  j.report('L9', !/fill="#fff(fff)?"/i.test(svg) && /fill="#03c75a"/i.test(svg), `naver.svg 채움 ${svg.match(/fill="[^"]+"/g)?.join(' ')}`)
})

await j.finish()
