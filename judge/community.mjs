// 홈 커뮤니티 채팅 칸 판정(2026-11-02 사용자 요청 "커뮤니티가 글 형식이 아니라 채팅 형식이었으면 좋겠어").
// 백엔드가 없어 예시 대화이고 입력칸은 잠겨 있다. /api는 전부 가짜(mock.mjs), 시계는 목 11:00(THU_11).
// 같은 날 검토로 더했다: 기대값을 예시 대화 파일에서 읽는다(사용자가 대화를 고쳐도 판정이 깨지지 않게), C1~C7은 미국 동부 시간대 탭에서 본다
// (한국 시각으로 적는지), C10 띄어쓰기, C11 대화창 위 휠, C12 사파리(WebKit), C13 좁은 화면의 Tab 순서.
// node community.mjs <BASE> [--only C1,C2] [--headed]
import { readFileSync } from 'node:fs'
import { webkit } from 'playwright'
import { cli, judge, noOverflow, sleep, THU_11 } from './lib.mjs'
import { mock, seedLogin } from './mock.mjs'

const j = await judge(cli())
const SECTION = 'section[aria-labelledby="home-community-title"]'

/*
 * src/content/communityPreview.ts의 예시 대화. 화면과 같은 규칙으로 기대값을 짓는다 — 오래된 말이 위,
 * 같은 사람이 같은 분에 이어 말하면 이름·시각을 다시 보이지 않는다(utils/chat.ts)
 */
const SOURCE = readFileSync(new URL('../src/content/communityPreview.ts', import.meta.url), 'utf8')
const MESSAGES = [...SOURCE.matchAll(/\{ id: (\d+), author: '([^']+)', stock: (null|'[^']*'), text: '([^']*)', minutesAgo: (\d+) \}/g)]
  .map(([, id, author, stock, text, minutesAgo]) => ({ id: Number(id), author, stock: stock === 'null' ? null : stock.slice(1, -1), text, minutesAgo: Number(minutesAgo) }))
  .sort((a, b) => b.minutesAgo - a.minutesAgo)
const clock = (ms) => { const k = new Date(ms + 9 * 3600_000); const h = k.getUTCHours(); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(k.getUTCMinutes()).padStart(2, '0')}` }
const CONTINUED = MESSAGES.map((m, i) => i > 0 && MESSAGES[i - 1].author === m.author && MESSAGES[i - 1].minutesAgo === m.minutesAgo)
const AUTHORS_SHOWN = MESSAGES.filter((_, i) => !CONTINUED[i]).map((m) => m.author)
const COUNT = MESSAGES.length
const FIRST_TIME = clock(THU_11 - MESSAGES[0].minutesAgo * 60_000)
const LAST_TIME = clock(THU_11 - MESSAGES.at(-1).minutesAgo * 60_000)
const FIRST_CONTINUED = CONTINUED.indexOf(true)
if (COUNT < 3) throw new Error(`예시 대화를 ${COUNT}개밖에 못 읽었다 — communityPreview.ts 모양이 바뀌었으면 위 정규식을 고친다`)

/** 대화창 안에서 말마다 보이는 정도(1 = 다 보임)와 창·페이지 스크롤 */
const measure = (page) => page.evaluate((sel) => {
  const section = document.querySelector(sel)
  const log = section?.querySelector('[role="log"]')
  if (!log) return null
  const box = log.getBoundingClientRect()
  const items = [...log.querySelectorAll('li')].map((li) => {
    const r = li.getBoundingClientRect()
    const shown = Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top))
    return r.height > 0 ? shown / r.height : 0
  })
  return { items, scrolls: log.scrollHeight > log.clientHeight + 1, pageY: window.scrollY, logH: Math.round(box.height) }
}, SECTION)

await j.run('C1', async () => {
  // 보는 사람이 미국 동부에 있어도 시각은 한국 시각이다(C3)
  const t = await j.open({ width: 1920, height: 1080, timezoneId: 'America/New_York' })
  await t.goto('/', 1800)
  const section = t.page.locator(SECTION)
  const logs = await section.getByRole('log', { name: '커뮤니티 예시 대화' }).count()
  const items = await section.locator('[role="log"] li').count()
  const text = (await section.textContent()) ?? ''
  const sortGroup = await section.getByRole('group', { name: '글 정렬' }).count()
  j.report('C1', logs === 1 && items === COUNT && !/댓글 \d|좋아요 \d/.test(text) && sortGroup === 0,
    `대화창 ${logs}개, 말 ${items}개, 댓글·좋아요 수 ${/댓글 \d|좋아요 \d/.test(text) ? '있음' : '없음'}, 정렬 탭 ${sortGroup}`)

  // C2 처음에는 최신 말(맨 아래)이 보이고, 대화창 안에서만 스크롤한다(페이지는 움직이지 않는다)
  await t.page.evaluate(() => document.fonts.ready)
  await sleep(300)
  const m = await measure(t.page)
  j.report('C2', m !== null && m.scrolls && m.items.at(-1) > 0.99 && m.items[0] < 0.5 && m.pageY === 0,
    `창 높이 ${m?.logH}px, 안에서 스크롤 ${m?.scrolls}, 마지막 말 보임 ${m?.items.at(-1)?.toFixed(2)}, 첫 말 보임 ${m?.items[0]?.toFixed(2)}, 페이지 스크롤 ${m?.pageY}`)

  // C3 시각: 한국 시각으로 가장 오래된 말(목 11:00 기준 minutesAgo 전)부터 최신 말까지, 오래된 말이 위
  const times = await section.locator('[role="log"] time').evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), at: e.getAttribute('datetime') })))
  const ordered = times.every((x, i) => i === 0 || Date.parse(times[i - 1].at) <= Date.parse(x.at))
  j.report('C3', times[0]?.text === FIRST_TIME && times.at(-1)?.text === LAST_TIME && ordered && times.every((x) => !Number.isNaN(Date.parse(x.at))),
    `시각 ${times.length}개 — 처음 ${times[0]?.text}(기대 ${FIRST_TIME}, ${times[0]?.at}), 마지막 ${times.at(-1)?.text}(기대 ${LAST_TIME}), 오래된 순 ${ordered}`)

  // C4 같은 사람이 같은 분에 이어 말하면 이름은 한 번만 보이고, 읽어 주는 쪽에는 이름을 남긴다
  const shown = await section.locator('[role="log"] [data-author]').evaluateAll((els) => els.map((e) => e.textContent.trim()))
  const spoken = FIRST_CONTINUED === -1 ? true : await section.locator('[role="log"] li').nth(FIRST_CONTINUED).evaluate((li, name) => {
    const hidden = [...li.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === name)
    if (!hidden) return false
    const r = hidden.getBoundingClientRect()
    return r.width <= 1 && r.height <= 1
  }, MESSAGES[FIRST_CONTINUED].author)
  j.report('C4', JSON.stringify(shown) === JSON.stringify(AUTHORS_SHOWN) && spoken === true,
    `보이는 이름 ${JSON.stringify(shown)}, 이어 말한 말(${FIRST_CONTINUED + 1}번째)이 이름을 화면 밖에서 읽어 줌 ${spoken}`)

  // C5 입력칸은 잠겨 있고 준비 중이라고 밝힌다. 눌러도 요청이 나가지 않는다
  const input = section.getByRole('textbox', { name: '커뮤니티에 보낼 말' })
  const send = section.getByRole('button', { name: '보내기' })
  const c5 = {
    input: await input.count() === 1 && await input.isDisabled(),
    placeholder: await input.getAttribute('placeholder'),
    font: await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    send: await send.count() === 1 && await send.isDisabled(),
    sample: await section.getByText('예시', { exact: true }).count(),
    notice: /예시/.test(text) && /준비 중/.test(text),
  }
  const before = t.api().length
  await send.click({ force: true }).catch(() => {})
  await input.click({ force: true }).catch(() => {})
  await t.page.keyboard.type('안녕하세요')
  await t.page.keyboard.press('Enter')
  await sleep(400)
  const items2 = await section.locator('[role="log"] li').count()
  j.report('C5', c5.input && /준비 중/.test(c5.placeholder ?? '') && c5.font >= 16 && c5.send && c5.sample >= 1 && c5.notice && t.api().length === before && items2 === COUNT,
    `입력칸 잠김 ${c5.input}("${c5.placeholder}", ${c5.font}px), 보내기 잠김 ${c5.send}, "예시" 표시 ${c5.sample}, 안내 ${c5.notice}, 눌러 본 뒤 요청 +${t.api().length - before}, 말 ${items2}개`)

  // C6 키보드: 대화창에 Tab으로 들어가 Home으로 첫 말까지 올라간다
  const focusable = await section.locator('[role="log"]').getAttribute('tabindex')
  await section.locator('[role="log"]').focus()
  await t.page.keyboard.press('Home')
  await sleep(400)
  const m2 = await measure(t.page)
  j.report('C6', focusable === '0' && m2 !== null && m2.items[0] > 0.99 && m2.pageY === 0,
    `tabindex ${focusable}, Home 뒤 첫 말 보임 ${m2?.items[0]?.toFixed(2)}, 페이지 스크롤 ${m2?.pageY}`)

  // C7 색: 등락색(빨강·파랑)을 쓰지 않는다. 말풍선은 옅은 면
  const c7 = await t.page.evaluate((sel) => {
    const root = getComputedStyle(document.documentElement)
    const probe = document.createElement('i'); document.body.append(probe)
    const rgb = (v) => { probe.style.color = v; return getComputedStyle(probe).color }
    const banned = ['--color-up', '--color-down', '--color-up-text', '--color-down-text'].map((k) => rgb(root.getPropertyValue(k).trim()))
    const sub = (() => { probe.style.color = root.getPropertyValue('--color-bg-sub').trim(); return getComputedStyle(probe).color })()
    probe.remove()
    const section = document.querySelector(sel)
    const els = [...section.querySelectorAll('*')]
    const tinted = els.filter((e) => banned.includes(getComputedStyle(e).color) || banned.includes(getComputedStyle(e).backgroundColor)).length
    const bubbles = [...section.querySelectorAll('[data-bubble]')]
    return { tinted, bubbles: bubbles.length, sub: bubbles.filter((b) => getComputedStyle(b).backgroundColor === sub).length }
  }, SECTION)
  j.report('C7', c7.tinted === 0 && c7.bubbles === COUNT && c7.sub === COUNT, `등락색 칠한 요소 ${c7.tinted}, 말풍선 ${c7.bubbles}개 중 옅은 면 ${c7.sub}`)
  await t.close()
})

// C8 1440×900·1100(한 열로 바뀌는 폭)·375·320: 가로 넘침 없음, 말풍선이 창 안에 들고 보내기 단추가 화면 안
await j.run('C8', async () => {
  const rows = []
  for (const [width, height] of [[1440, 900], [1100, 900], [375, 812], [320, 640]]) {
    const t = await j.open({ width, height })
    await t.goto('/', 1600)
    await t.page.evaluate(() => document.fonts.ready)
    const r = await t.page.evaluate((sel) => {
      const section = document.querySelector(sel)
      const log = section?.querySelector('[role="log"]')
      const send = [...(section?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === '보내기')
      if (!log || !send) return null
      const box = log.getBoundingClientRect()
      const wide = [...log.querySelectorAll('[data-bubble]')].filter((b) => b.getBoundingClientRect().right > box.right + 0.5).length
      return { logW: Math.round(box.width), inner: log.scrollWidth <= log.clientWidth + 1, wide, sendRight: Math.round(send.getBoundingClientRect().right), sendH: Math.round(send.getBoundingClientRect().height) }
    }, SECTION)
    rows.push({ width, ok: r !== null && (await noOverflow(t.page)) && r.inner && r.wide === 0 && r.sendRight <= width && r.sendH >= 40, ...r })
    await t.close()
  }
  j.report('C8', rows.every((r) => r.ok), rows.map((r) => `${r.width}: 창 ${r?.logW}px·안쪽 넘침 ${!r?.inner}·튀어나온 말풍선 ${r?.wide}·보내기 오른끝 ${r?.sendRight}·높이 ${r?.sendH}`).join(' / '))
})

// C9 비로그인도 같은 대화를 보고 같은 잠긴 입력칸이다. 커뮤니티 칸은 요청을 하나도 만들지 않는다(홈 요청 수가 로그인 여부로만 갈린다)
await j.run('C9', async () => {
  const t = await j.open({ loggedIn: false })
  await t.goto('/', 1600)
  const section = t.page.locator(SECTION)
  const items = await section.locator('[role="log"] li').count()
  const locked = await section.getByRole('textbox', { name: '커뮤니티에 보낼 말' }).isDisabled().catch(() => false)
  const hits = t.api().filter((l) => /communit|chat/i.test(l))
  j.report('C9', items === COUNT && locked && hits.length === 0, `비로그인 말 ${items}개, 입력칸 잠김 ${locked}, 커뮤니티·채팅 요청 ${hits.length}건`)
  await t.close()
})

// C10 띄어쓰기: 한 문단 안에서 여백으로만 띄운 자리(이름 | 시각, 종목 | 본문)에도 글자 빈칸이 있어야 읽어 주는 쪽·복사한 글이
// "SK하이닉스1년"·"주린이공부중오전 10:48"처럼 붙지 않는다. 이름 줄과 말풍선은 문단이 달라 따로 읽힌다
await j.run('C10', async () => {
  const t = await j.open({ width: 1440, height: 900 })
  await t.goto('/', 1500)
  const r = await t.page.locator(SECTION).locator('[role="log"] li').evaluateAll((lis) => lis.map((li) => ({
    meta: (li.querySelector('[data-author]')?.parentElement ?? li.querySelector('[aria-hidden="true"] + div > span'))?.textContent ?? '',
    bubble: li.querySelector('[data-bubble]')?.textContent ?? '',
  })))
  await t.close()
  const bad = r.flatMap((got, i) => {
    const m = MESSAGES[i]
    const meta = CONTINUED[i] ? `${m.author} ` : `${m.author} ${clock(THU_11 - m.minutesAgo * 60_000)}`
    const bubble = m.stock === null ? m.text : `${m.stock} ${m.text}`
    return got.meta === meta && got.bubble === bubble ? [] : [`${i + 1}: "${got.meta}" / "${got.bubble}"`]
  })
  j.report('C10', bad.length === 0 && r.length === COUNT, bad.length ? `붙은 글 ${bad.length}개: ${bad.slice(0, 4).join(' · ')}` : `말 ${r.length}개 모두 이름·시각, 종목·본문이 빈칸으로 나뉨`)
})

// C11 대화창 위에서 휠을 아래로 굴리면 페이지가 내려간다 — 대화창은 처음부터 맨 아래라 더 내릴 게 없다(넓은 화면·휴대폰)
await j.run('C11', async () => {
  const out = []
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const t = await j.open({ width, height })
    await t.goto('/', 1500)
    const log = t.page.locator(SECTION).locator('[role="log"]')
    await log.scrollIntoViewIfNeeded()
    const box = await log.boundingBox()
    const before = await t.page.evaluate(() => scrollY)
    await t.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    for (let i = 0; i < 5; i++) { await t.page.mouse.wheel(0, 200); await sleep(120) }
    await sleep(400)
    out.push({ width, moved: Math.round((await t.page.evaluate(() => scrollY)) - before) })
    await t.close()
  }
  j.report('C11', out.every((o) => o.moved > 0), `대화창 위 휠 아래로 1000px → 페이지 ${out.map((o) => `${o.width}: ${o.moved}px`).join(', ')}`)
})

// C12 사파리(WebKit): 처음 열면 최신 말이 보인다(column-reverse의 처음 스크롤 자리는 엔진마다 다르던 기능이다). WebKit을 받은 뒤에만 돈다
await j.run('C12', async () => {
  let browser
  try { browser = await webkit.launch() } catch { j.report('C12', null, 'WebKit이 없어 건너뜀(npx playwright install webkit)'); return }
  const out = []
  for (const width of [1920, 1101, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Asia/Seoul' })
    await seedLogin(context, true, { at: THU_11 })
    await mock(context, { now: THU_11 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(j.BASE + '/', { waitUntil: 'domcontentloaded' })
    await sleep(1800)
    const m = await measure(page)
    out.push({ width, last: m?.items.at(-1) ?? 0, first: m?.items[0] ?? 1, errors: errors.length })
    await context.close()
  }
  await browser.close()
  j.report('C12', out.every((o) => o.last > 0.99 && o.first < 0.5 && o.errors === 0), out.map((o) => `${o.width}: 마지막 말 ${o.last.toFixed(2)}·첫 말 ${o.first.toFixed(2)}·오류 ${o.errors}`).join(' / '))
})

// C13 좁은 화면(390): 오른쪽 열(사용설명서·커뮤니티)이 시세표 위에 보이므로 Tab으로도 시세표 행보다 먼저 닿는다 —
// 화면 순서만 앞이고 DOM은 뒤였던 때는 시세표 행(링크·하트)을 다 지나야 대화창에 닿았다
await j.run('C13', async () => {
  const t = await j.open({ width: 390, height: 844 })
  await t.goto('/', 1500)
  let first = null
  for (let i = 0; i < 80 && first === null; i++) {
    await t.page.keyboard.press('Tab')
    first = await t.page.evaluate(() => {
      const a = document.activeElement
      if (a?.getAttribute('role') === 'log') return '대화창'
      const list = [...document.querySelectorAll('main section')].find((sec) => sec.querySelector('h2')?.textContent.trim() === '현재 주가 보기')
      if (list?.contains(a)) return '현재 주가 보기 구역'
      return null
    })
  }
  await t.close()
  j.report('C13', first === '대화창', `390px에서 Tab으로 먼저 닿은 것: ${first}`)
})

await j.finish()
