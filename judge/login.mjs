// 로그인 화면 판정(2026-11-02 사용자 "로그인 페이지는 너무나 별론데, 최신 환경에 맞춰서 … 아예 다시 디자인해줘").
// 글자가 든 소셜 단추 셋(카카오·네이버·Google), 가운데 한 줄, 최근에 쓴 계정 표시, 로그인 뒤 순서 세 칸. /api는 전부 가짜(mock.mjs),
// 소셜 로그인 주소(api.juby.store)로 가는 이동은 mock이 막고 "BLOCKED 경로"로 적는다.
// 같은 날 검토로 더했다: L5 "최근 사용"은 이름이 아니라 설명, L6b 가입 경로를 모르면 기록을 지움, L8 좁은 폭의 표시, L10 다른 화면에
// 다녀와도 단추 배치가 같음, L11 탈퇴하면 기록을 지움(로그아웃은 둠), L12 고대비 모드의 표시.
// 2026-11-14 사용자 "네이버 로그인을 누르면 네이버로 가지 않고 '서비스 승인 대기중입니다. 다른 소셜 로그인을 이용해 주세요.' 안내를 띄워" —
// 네이버 앱이 아직 승인 전이라 등록한 사람만 로그인된다. L4는 카카오·Google만 떠나고, L13이 네이버 안내를 잰다.
// node login.mjs <BASE> [--only L1,L5] [--headed]
import { cli, judge, noOverflow, sleep } from './lib.mjs'
import { fail, tokenFor, wrap } from './mock.mjs'

const j = await judge(cli())
const NAMES = ['카카오로 로그인', '네이버로 로그인', 'Google로 로그인']
/** 기록을 지웠는가 — 앱은 지울 때 JSON null을 적는다(utils/cache writeJson, 최근 본 백테스트와 같다) */
const cleared = (raw) => raw === null || raw === 'null'

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
  // 그 이동에 204(내용 없음)로 답해 화면이 제자리에 남게 하고 가려던 주소만 적는다. 네이버는 승인 전이라 떠나지 않는다(L13)
  const got = []
  for (const [i, provider] of [[0, 'kakao'], [2, 'google']]) {
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
  // L5 지난번에 쓴 계정에만 "최근 사용"이 보인다. 단추 이름은 하는 일 그대로("네이버로 로그인")이고 표시는 설명으로 읽힌다 —
  // 이름에 섞던 때는 표시 앞 빈칸이 지워지면 "네이버로 로그인최근 사용"으로 붙었다. 기록이 없으면 아무 데도 없다
  const t = await j.open({ loggedIn: false, width: 1440, height: 900, seed: { lastLoginProvider: JSON.stringify('NAVER') } })
  await t.goto('/login', 1000)
  const marked = await t.page.locator('main button').evaluateAll((bs) => bs.filter((b) => /최근 사용/.test(b.textContent)).map((b) => b.textContent.replace('최근 사용', '').trim()))
  const naver = t.page.getByRole('button', { name: '네이버로 로그인', exact: true })
  const named = await naver.count()
  const described = named === 1 ? await naver.evaluate((b) => (b.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent.trim() ?? '').join(' ')) : ''
  await t.close()
  const u = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await u.goto('/login', 1000)
  const none = await u.page.getByText('최근 사용').count()
  await u.close()
  j.report('L5', JSON.stringify(marked) === JSON.stringify(['네이버로 로그인']) && named === 1 && described === '최근 사용' && none === 0,
    `표시된 단추 ${JSON.stringify(marked)}, 이름이 정확히 "네이버로 로그인"인 단추 ${named}, 그 설명 "${described}", 기록 없을 때 ${none}`)
})

await j.run('L6', async () => {
  // L6 로그인을 마치면 서버가 알려 준 가입 경로(mock: GOOGLE)를 적는다. 회원 정보 요청은 전처럼 1건
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await t.goto(`/oauth2/callback#accessToken=${tokenFor()}`, 2000)
  const saved = await t.page.evaluate(() => localStorage.getItem('lastLoginProvider'))
  const members = t.count(/^GET \/api\/members\/me$/)
  await t.close()
  j.report('L6', saved === JSON.stringify('GOOGLE') && members === 1, `저장 ${saved}, 회원 정보 요청 ${members}건`)
})

await j.run('L6b', async () => {
  // L6b 서버가 가입 경로를 못 알려 주면(회원 정보 실패·모르는 값) 지난 기록을 지운다 — 두면 이번에 다른 곳으로 들어왔어도
  // 다음 로그인 화면이 지난 단추에 "최근 사용"을 붙여 다른 계정으로 이끈다. 가려던 자리로는 그대로 간다
  const cases = [
    ['회원 정보 500', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: fail() })],
    ['모르는 값(소문자)', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: wrap('MEMBER200_1', { socialType: 'naver', onboarded: true }) })],
  ]
  const got = []
  for (const [name, respond] of cases) {
    const t = await j.open({ loggedIn: false, width: 1440, height: 900, seed: { lastLoginProvider: JSON.stringify('KAKAO') } })
    await t.context.route((u) => u.pathname === '/api/members/me', (route) => (route.request().method() === 'GET' ? respond(route) : route.fallback()))
    await t.goto(`/oauth2/callback#accessToken=${tokenFor()}`, 2000)
    got.push({ name, saved: await t.page.evaluate(() => localStorage.getItem('lastLoginProvider')), path: new URL(t.page.url()).pathname })
    await t.close()
  }
  j.report('L6b', got.every((g) => cleared(g.saved) && g.path === '/'), got.map((g) => `${g.name}: 기록 ${g.saved}, 도착 ${g.path}`).join(' · '))
})

await j.run('L7', async () => {
  // L7 로그인 실패로 돌아오면 무엇이 일어났고 어떻게 하는지 알린다. ?next=가 홈이 아닌 자리면 돌아갈 곳을 알린다
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await t.goto('/oauth2/error?error=access_denied', 1500)
  const alert = (await t.page.getByRole('alert').textContent().catch(() => '')) ?? ''
  await t.goto('/login?next=%2Fbacktest', 1000)
  const back = await t.page.getByText('보던 화면으로 돌아가요').count()
  await t.goto('/login', 1000)
  const backHome = await t.page.getByText('보던 화면으로 돌아가요').count()
  await t.goto('/login?next=%2F', 1000)
  const backRoot = await t.page.getByText('보던 화면으로 돌아가요').count()
  await t.close()
  j.report('L7', /로그인을 마치지 못했어요/.test(alert) && /다시/.test(alert) && back === 1 && backHome === 0 && backRoot === 0,
    `실패 안내 "${alert.trim()}", next 있을 때 돌아갈 곳 안내 ${back}, 없을 때 ${backHome}, next가 홈일 때 ${backRoot}`)
})

await j.run('L8', async () => {
  // L8 좁은 화면: 넘침 없음, 단추는 본문 폭을 채우고 48px, 순서 세 칸은 위아래로 쌓인다. 키보드 포커스가 보인다.
  // "최근 사용"은 가장 긴 글자("Google로 로그인") 단추에 붙여도 글자와 4px 넘게 떨어지고 단추 안에 든다
  const out = []
  for (const [width, height] of [[375, 812], [320, 640], [768, 1024]]) {
    const t = await j.open({ loggedIn: false, width, height, seed: { lastLoginProvider: JSON.stringify('GOOGLE') } })
    await t.goto('/login', 1000)
    await t.page.evaluate(() => document.fonts.ready)
    const m = await measure(t.page)
    const stacked = await t.page.evaluate(() => {
      const head = [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === '로그인하면 이렇게 시작해요')
      const lis = head ? [...head.parentElement.querySelectorAll('li')].map((li) => li.getBoundingClientRect()) : []
      return lis.length === 3 && lis[0].bottom <= lis[1].top + 1 && lis[1].bottom <= lis[2].top + 1
    })
    const badge = await t.page.evaluate(() => {
      const b = [...document.querySelectorAll('main button')].find((x) => x.textContent.includes('최근 사용'))
      const mark = b && [...b.querySelectorAll('span')].find((x) => x.textContent.trim() === '최근 사용')
      // 글자만 든 칸(안에 다른 요소가 없는 span) — 아이콘까지 감싼 칸을 잡으면 그 칸의 상자 폭을 글자 폭으로 잰다
      const label = b && [...b.querySelectorAll('span')].find((x) => x.children.length === 0 && /로 로그인$/.test(x.textContent.trim()))
      if (!mark || !label) return null
      const range = document.createRange(); range.selectNodeContents(label)
      const text = range.getBoundingClientRect(), tag = mark.getBoundingClientRect(), box = b.getBoundingClientRect()
      return { gap: Math.round(tag.left - text.right), inside: tag.right <= box.right && tag.left >= box.left }
    })
    await t.page.getByRole('button', { name: NAMES[0] }).focus()
    await t.page.keyboard.press('Tab')
    const outline = await t.page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)
    out.push({ width, over: !(await noOverflow(t.page)), fill: m.boxes.every((b) => b.height >= 48 && Math.abs(b.width - (m.title.right - m.title.left)) < 1), stacked, outline, badge })
    await t.close()
  }
  j.report('L8', out.every((o) => !o.over && o.fill && o.stacked && o.outline !== 'none' && o.badge?.gap >= 4 && o.badge?.inside), JSON.stringify(out))
})

await j.run('L9', async () => {
  // L9 네이버 아이콘은 흰 바탕에서 보이는 초록이다(마이페이지 "네이버로 가입한 계정"도 같은 파일 — 흰 N이라 안 보였다)
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  await t.goto('/login', 800)
  const svg = await t.page.evaluate(() => fetch('/social/naver.svg').then((r) => r.text()))
  await t.close()
  j.report('L9', !/fill="#fff(fff)?"/i.test(svg) && /fill="#03c75a"/i.test(svg), `naver.svg 채움 ${svg.match(/fill="[^"]+"/g)?.join(' ')}`)
})

await j.run('L10', async () => {
  // L10 다른 화면에 다녀와도 단추 안 배치(아이콘은 왼쪽 끝, 글자는 가운데)가 같다. 공통 단추 CSS는 그것을 쓰는 화면 묶음마다 함께 들어와,
  // 나중에 들어온 쪽이 같은 우선순위의 로그인 단추 규칙을 덮었다(2026-11-02 검토 — 홈에 다녀오면 아이콘이 글자 옆으로 붙었다).
  // 판정마다 새 탭에서 /login을 곧장 열면 안 드러나서, 앱 안 링크로 오간다
  const t = await j.open({ loggedIn: false, width: 1440, height: 900 })
  const look = () => t.page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => {
    const box = b.getBoundingClientRect(), icon = b.querySelector('img').getBoundingClientRect()
    const label = [...b.querySelectorAll('span')].find((x) => x.children.length === 0 && /로 로그인$/.test(x.textContent.trim()))
    const range = document.createRange(); range.selectNodeContents(label)
    const text = range.getBoundingClientRect()
    return { icon: Math.round(icon.left - box.left), center: Math.round((text.left + text.right) / 2 - (box.left + box.right) / 2) }
  }))
  await t.goto('/login', 1000)
  const fresh = await look()
  const seen = []
  for (const away of ['홈', '주식 백테스트']) {
    await t.page.locator('header a', { hasText: away }).first().click()
    await sleep(4000)
    await t.page.locator('header a', { hasText: '로그인' }).first().click()
    await sleep(1200)
    seen.push({ away, look: await look() })
  }
  await t.close()
  const good = (l) => l.length === 3 && l.every((b) => b.icon <= 24 && Math.abs(b.center) <= 2)
  j.report('L10', good(fresh) && seen.every((s) => JSON.stringify(s.look) === JSON.stringify(fresh)),
    `처음 ${JSON.stringify(fresh)} · ${seen.map((s) => `${s.away}에 다녀온 뒤 ${JSON.stringify(s.look)}`).join(' · ')}`)
})

await j.run('L11', async () => {
  // L11 탈퇴하면 "최근 사용" 기록을 지운다 — 그 계정이 없어져 같은 곳으로 들어와도 새 계정이다. 로그아웃은 둔다(다음 로그인에 쓰는 값)
  const seed = { lastLoginProvider: JSON.stringify('NAVER') }
  const t = await j.open({ width: 1440, height: 900, seed })
  await t.goto('/mypage/profile', 1500)
  await t.page.getByRole('button', { name: '회원 탈퇴하기' }).click()
  await t.page.getByRole('dialog', { name: '회원 탈퇴 확인' }).getByRole('button', { name: '탈퇴하기' }).click()
  await sleep(1200)
  const afterWithdraw = await t.page.evaluate(() => localStorage.getItem('lastLoginProvider'))
  const withdrew = t.count(/^DELETE \/api\/members\/me$/)
  await t.close()
  const u = await j.open({ width: 1440, height: 900, seed })
  await u.goto('/mypage', 1500)
  await u.page.getByRole('button', { name: '로그아웃' }).first().click()
  await sleep(1200)
  const afterLogout = await u.page.evaluate(() => localStorage.getItem('lastLoginProvider'))
  const loggedOut = await u.page.evaluate(() => localStorage.getItem('accessToken') === null)
  await u.close()
  j.report('L11', withdrew === 1 && cleared(afterWithdraw) && loggedOut && afterLogout === JSON.stringify('NAVER'),
    `탈퇴 요청 ${withdrew}건 → 기록 ${afterWithdraw} · 로그아웃(토큰 지움 ${loggedOut}) → 기록 ${afterLogout}`)
})

await j.run('L12', async () => {
  // L12 고대비(강제 색) 모드에서도 "최근 사용"이 테두리 있는 표시로 남는다 — 바탕색이 지워지면 단추 글자 옆 낱말처럼 읽혔다
  const t = await j.open({ loggedIn: false, width: 1440, height: 900, seed: { lastLoginProvider: JSON.stringify('NAVER') } })
  await t.page.emulateMedia({ forcedColors: 'active' })
  await t.goto('/login', 900)
  const border = await t.page.evaluate(() => {
    const mark = [...document.querySelectorAll('main button span')].find((x) => x.textContent.trim() === '최근 사용')
    if (!mark) return null
    const cs = getComputedStyle(mark)
    return `${cs.borderTopWidth} ${cs.borderTopStyle}`
  })
  await t.close()
  j.report('L12', border !== null && !/^0px|none/.test(border), `강제 색에서 표시 테두리 ${border}`)
})

await j.run('L13', async () => {
  // L13 네이버 단추는 떠나지 않고(로그인 주소로 가는 이동 0, 돌아갈 자리도 적지 않음) 그 단추 바로 아래에 안내를 띄운다.
  // 안내는 알림(role=alert)으로 읽히고 네이버 단추의 설명이 된다. 네이버와 Google 단추 사이, 단추 줄 폭 안에 들고 화면이 넘치지 않는다.
  // 다시 눌러도 안내는 하나다. 고대비(강제 색) 모드에서도 안내 칸의 테두리가 남는다
  const TEXT = '서비스 승인 대기중입니다. 다른 소셜 로그인을 이용해 주세요.'
  const norm = (x) => (x ?? '').replace(/\s+/g, ' ').trim()
  const out = []
  for (const [width, height] of [[1440, 900], [375, 812], [320, 640]]) {
    const t = await j.open({ loggedIn: false, width, height })
    const went = []
    await t.page.route('https://api.juby.store/oauth2/**', (route) => { went.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 204 }) })
    await t.goto('/login?next=%2Fbacktest', 1000)
    await t.page.evaluate(() => document.fonts.ready)
    const before = await t.page.getByText('서비스 승인 대기중입니다').count()
    const naver = t.page.getByRole('button', { name: '네이버로 로그인', exact: true })
    // 떠나는 단추면 두 번째 누름이 이동을 기다리다 멈춘다 — 짧게 끊고 잰다
    for (let k = 0; k < 2; k++) {
      await naver.evaluate((b) => b.click(), null, { timeout: 3000 }).catch(() => {})
      await sleep(800)
    }
    const got = await t.page.evaluate(() => {
      const alerts = [...document.querySelectorAll('main [role="alert"]')]
      const buttons = [...document.querySelectorAll('main button')]
      const nav = buttons.find((b) => b.textContent.includes('네이버로 로그인'))
      const goo = buttons.find((b) => b.textContent.includes('Google로 로그인'))
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }
      const described = nav ? (nav.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : ''
      return { alerts: alerts.map((a) => ({ text: a.textContent, box: box(a) })), nav: nav && box(nav), goo: goo && box(goo), described }
    })
    const saved = await t.page.evaluate(() => sessionStorage.getItem('loginReturnPath'))
    const path = new URL(t.page.url()).pathname
    const a = got.alerts[0]
    const between = a && got.nav && got.goo && a.box.top >= got.nav.bottom - 1 && a.box.bottom <= got.goo.top - 1
    const inside = a && got.nav && a.box.left >= got.nav.left - 0.5 && a.box.right <= got.nav.right + 0.5
    let forced = null
    if (width === 1440 && a) {
      await t.page.emulateMedia({ forcedColors: 'active' })
      await sleep(200)
      forced = await t.page.evaluate(() => { const cs = getComputedStyle(document.querySelector('main [role="alert"]')); return `${cs.borderTopWidth} ${cs.borderTopStyle}` })
    }
    out.push({ width, before, went: went.join(','), saved, path, alerts: got.alerts.length, text: norm(a?.text), described: norm(got.described).includes(TEXT), between: !!between, inside: !!inside, over: !(await noOverflow(t.page)), forced })
    await t.close()
  }
  j.report('L13', out.every((o) => o.before === 0 && o.went === '' && o.saved === null && o.path === '/login' && o.alerts === 1 && o.text === TEXT && o.described && o.between && o.inside && !o.over)
    && out[0].forced !== null && !/^0px|none/.test(out[0].forced), JSON.stringify(out))
})

await j.finish()
