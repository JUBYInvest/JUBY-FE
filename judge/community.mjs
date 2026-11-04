// 커뮤니티 판정(2026-11-03 사용자 "토스증권처럼 게시판으로… AI 주가분석과 사용설명서 사이에 커뮤니티… 웹소켓을 받을 자리만 남기고 목업을").
// 2026-11-02의 홈 채팅창 판정(C1~C13)을 게시판 판정으로 바꿨다. 기대값은 예시 글 파일(src/content/communityPreview.ts)에서 읽는다 —
// 사용자가 글을 고쳐도 판정을 고치지 않는다. /api는 전부 가짜(mock.mjs), 커뮤니티는 서버가 없어 /api를 부르지 않는다(B9).
//  B1 머리글 메뉴: 홈 · 관심종목 · 주식 백테스트 · AI 주가분석 · 커뮤니티 · 사용설명서(커뮤니티는 AI와 사용설명서 사이)
//  B2 홈 오른쪽 칸: "커뮤니티" 제목 줄(예시 표시·전체 보기 → /community), 최신 글 다섯 줄(별명·몇 분 전·글). 종목 이름은 홈에선 글 링크 안 글자,
//     커뮤니티 화면에선 그 종목 상세 링크
//  B3 커뮤니티 화면: 화면 제목, 예시 글 전부가 최신순, "인기" 탭을 누르면 공감 수 차례(2026-11-04 "최신순 · 공감 많은 순" → 큰 탭 "최신 · 인기")
//  B4 종목으로 보기(2026-11-04부터 글 위 카드 줄): 종목 카드를 누르면 그 종목 글만, 구역 이름이 "<종목> 이야기", 글 수가 카드의 수와 같다. "전체"로 돌아온다
//  B5 실시간(목업): 보고 있는 동안 새 글이 오면 끼우지 않고 "새 글 N개 보기"로 모은다 — 누르면 맨 위에 선다. 홈도 제목 줄에 "새 글 N"
//  B6 글쓰기: 서버가 없는 목업에서는 잠겨 있고 그렇다고 밝힌다(써도 갈 곳이 없다)
//  B7 두 열의 첫 선(1440·1024): 가운데 탭 줄 먹 선 = 오른쪽 제목 줄 먹 선(1px 안). 11-03까지는 왼쪽 종목 열까지 세 열이었다
//  B8 좁은 화면(390·320): 가로 넘침 없음, 종목 카드는 한 줄로 서고 옆으로 민다(줄이 화면보다 넓다), 첫 카드는 글과 같은 줄에서 시작
//  B11 종목 검색(2026-11-04 "검색 버튼을 통해 종목을 선택"): 제목 줄 "종목 검색" → 검색 칸(포커스) → 글이 있는 종목을 고르면 그 종목 글만·카드 눌림·
//      카드에 포커스, 글이 없는 종목(검색 가짜 응답)을 고르면 "글 0" 카드가 전체 다음에 서고 "<종목> 이야기는 아직 없어요", Esc로 닫으면 단추로 포커스
//  B12 인기 + 종목: 두 거름이 같이 걸린다(그 종목 글만 공감 수 차례), 탭 줄 오른쪽에 무엇 순인지
//  B13 카드 줄 앞·뒤 단추(마우스): 넘칠 때 뒤 단추만 → 누르면 줄이 밀리고 앞 단추가 생긴다, 손가락 화면에서는 단추가 없다(밀면 된다)
//  B9 커뮤니티는 열 때 /api를 부르지 않는다(서버가 없다 — 웹소켓 주소를 넣기 전까지). 아래 지수 띠의 요청은 어느 화면에나 있어 뺀다.
//     종목 검색 칸에 글자를 치면 홈 검색창과 같은 /api/stocks/search가 나간다(B11)
//  B10 홈 글 줄을 누르면 커뮤니티 화면의 그 글로 간다(2026-11-03 사용자 "홈화면에서 커뮤니티의 글을 클릭하면 커뮤니티로 가는 기능") —
//      줄 어디를 눌러도(별명 자리·휴대폰에서 종목 이름 자리) /community, 그 글이 화면 안에 표시(aria-current)·포커스, 홈에서 세운 새 글(목업)도 찾아간다,
//      새로고침하면 표시가 풀린다(한 번 읽고 비운다), 메뉴로 그냥 들어오면 표시가 없다
// node community.mjs <BASE> [--only B1,B2] [--headed]
import { readFileSync } from 'node:fs'
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const j = await judge(cli())
const HOME = 'section[aria-labelledby="home-community-title"]'
const FEED = 'section[aria-labelledby="community-feed-title"]'
const STRIP = 'nav[aria-label="종목으로 보기"]'

const SOURCE = readFileSync(new URL('../src/content/communityPreview.ts', import.meta.url), 'utf8')
const STOCKS = Object.fromEntries([...SOURCE.matchAll(/const (\w+) = \{ code: '(\d{6})', name: '([^']+)' \}/g)].map(([, key, code, name]) => [key, { code, name }]))
const parse = (block) => [...block.matchAll(/\{ id: (\d+), author: '([^']+)', stock: (null|\w+), text: '([^']*)', minutesAgo: (\d+), likes: (\d+), comments: (\d+) \}/g)]
  .map(([, id, author, stock, text, minutesAgo, likes, comments]) => ({ id: Number(id), author, stock: stock === 'null' ? null : STOCKS[stock], text, minutesAgo: Number(minutesAgo), likes: Number(likes), comments: Number(comments) }))
const [initialBlock, liveBlock] = SOURCE.split('export const COMMUNITY_PREVIEW_LIVE')
const POSTS = parse(initialBlock)
const LIVE = parse(liveBlock)
if (POSTS.length < 5 || LIVE.length < 1) throw new Error(`예시 글을 ${POSTS.length}·${LIVE.length}개밖에 못 읽었다 — communityPreview.ts 모양이 바뀌었으면 위 정규식을 고친다`)
const LATEST = [...POSTS].sort((a, b) => a.minutesAgo - b.minutesAgo)
const POPULAR = [...POSTS].sort((a, b) => b.likes - a.likes || a.minutesAgo - b.minutesAgo)
// 글 줄은 ol > li다 — 2026-11-04부터 글 구역 안에 종목 카드 줄(ul > li)이 같이 있다
const postTexts = (page, scope) => page.$$eval(`${scope} ol > li`, (lis) => lis.map((li) => li.querySelector('p:nth-of-type(2)')?.textContent.trim() ?? ''))
/** 종목 카드의 글(첫 글자 동그라미는 aria-hidden이라 뺀다) — "삼성전자 글 2" */
const cardTexts = (page) => page.$$eval(`${STRIP} li button`, (buttons) => buttons.map((b) => [...b.children].filter((c) => c.getAttribute('aria-hidden') !== 'true').map((c) => c.textContent.trim()).join(' ')))
const withStock = (post) => (post.stock ? `${post.stock.name} ${post.text}` : post.text)

await j.run('B1', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/', 1500)
  const menu = await t.page.$$eval('nav[aria-label="서비스"] a', (as) => as.map((a) => a.textContent.trim()))
  j.report('B1', menu.join('|') === '홈|관심종목|주식 백테스트|AI 주가분석|커뮤니티|사용설명서', `메뉴 ${menu.join(' · ')}`)
  await t.close()
})

await j.run('B2', async () => {
  const t = await j.open({ width: 1920, height: 1080 })
  await t.goto('/', 1800)
  const section = t.page.locator(HOME)
  const head = await section.locator('h2').first().textContent()
  const sample = await section.getByText('예시', { exact: true }).count()
  const more = await section.getByRole('link', { name: '전체 보기' }).getAttribute('href')
  const texts = await postTexts(t.page, HOME)
  const expected = LATEST.slice(0, 5).map(withStock)
  const meta = await t.page.$$eval(`${HOME} li`, (lis) => lis.map((li) => li.querySelector('p')?.textContent.trim() ?? ''))
  j.report('B2a', head === '커뮤니티' && sample === 1 && more === '/community', `제목 "${head}", 예시 표시 ${sample}, 전체 보기 → ${more}`)
  j.report('B2b', JSON.stringify(texts) === JSON.stringify(expected) && meta.every((m) => /\S+ (방금|\d+분 전|\d+시간 전)$/.test(m)),
    `최신 글 ${texts.length}줄 — 예시 글 최신 다섯과 ${JSON.stringify(texts) === JSON.stringify(expected) ? '같다' : '다르다'}, 별명·시각 ${meta.slice(0, 2).join(' / ')}`)
  // 홈은 줄 전체가 커뮤니티로 가는 글 링크라 종목 이름은 그 안의 글자다(따로 눌리는 작은 링크를 두지 않는다 — B10). 종목 상세 링크는 커뮤니티 화면에 있다
  const tag = LATEST.slice(0, 5).find((post) => post.stock)
  const homeStockLinks = tag ? await section.getByRole('link', { name: tag.stock.name, exact: true }).count() : -1
  await t.goto('/community', 1500)
  const href = tag ? await t.page.locator(FEED).getByRole('link', { name: tag.stock.name, exact: true }).first().getAttribute('href') : null
  j.report('B2c', tag !== undefined && homeStockLinks === 0 && href === `/stocks/${tag.stock.code}`, `홈 글 줄 안 종목 링크 ${homeStockLinks}개, 커뮤니티 화면 종목 이름 링크 ${tag?.stock.name} → ${href}`)
  await t.close()
})

await j.run('B3', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const title = await t.page.locator('main h1').textContent()
  const latest = await postTexts(t.page, FEED)
  j.report('B3a', title === '커뮤니티' && JSON.stringify(latest) === JSON.stringify(LATEST.map(withStock)), `화면 제목 "${title}", 최신순 ${latest.length}개 ${JSON.stringify(latest) === JSON.stringify(LATEST.map(withStock)) ? '예시 글 그대로' : '순서·글이 다르다'}`)
  const tabs = await t.page.locator(FEED).getByRole('group', { name: '정렬' }).getByRole('button').allTextContents()
  await t.page.getByRole('button', { name: '인기', exact: true }).click()
  await sleep(200)
  const popular = await postTexts(t.page, FEED)
  const pressed = await t.page.getByRole('button', { name: '인기', exact: true }).getAttribute('aria-pressed')
  j.report('B3b', tabs.join('|') === '최신|인기' && pressed === 'true' && JSON.stringify(popular) === JSON.stringify(POPULAR.map(withStock)),
    `탭 ${tabs.join(' · ')}, 인기 ${pressed}, 공감 수 차례 ${JSON.stringify(popular) === JSON.stringify(POPULAR.map(withStock))}, 첫 글 "${popular[0]?.slice(0, 20)}…"`)
  await t.close()
})

await j.run('B4', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const counts = new Map()
  for (const post of POSTS) if (post.stock) counts.set(post.stock.name, (counts.get(post.stock.name) ?? 0) + 1)
  const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const nav = t.page.locator(STRIP)
  await nav.getByRole('button', { name: new RegExp(`^${name} 글`) }).click()
  await sleep(200)
  const head = await t.page.locator(`${FEED} h2`).first().textContent()
  const texts = await postTexts(t.page, FEED)
  const cardCount = (await cardTexts(t.page)).find((text) => text.startsWith(`${name} 글`)) ?? ''
  j.report('B4a', head === `${name} 이야기` && texts.length === count && texts.every((text) => text.startsWith(name)) && cardCount.endsWith(`글 ${count}`),
    `"${head}" — 글 ${texts.length}개(기대 ${count}, 카드 "${cardCount}"), 모두 ${name} 글`)
  await nav.getByRole('button', { name: /^전체 글/ }).click()
  await sleep(200)
  j.report('B4b', (await postTexts(t.page, FEED)).length === POSTS.length, `전체 글로 돌아오면 ${POSTS.length}개`)
  await t.close()
})

await j.run('B5', async () => {
  for (const [path, scope] of [['/community', FEED], ['/', HOME]]) {
    const t = await j.open({ width: 1440 })
    await t.page.clock.install()
    await t.goto(path, 1500)
    const before = await postTexts(t.page, scope)
    await t.page.clock.runFor(41_000)
    await sleep(200)
    const fresh = t.page.locator(scope).getByRole('button', { name: /^새 글 1/ })
    const shown = await fresh.count()
    const unchanged = JSON.stringify(await postTexts(t.page, scope)) === JSON.stringify(before)
    if (shown === 1) await fresh.click()
    await sleep(200)
    const after = await postTexts(t.page, scope)
    j.report(`B5-${path === '/' ? 'home' : 'page'}`, shown === 1 && unchanged && after[0] === withStock(LIVE[0]) && (await fresh.count()) === 0,
      `40초 뒤 "새 글 1" 단추 ${shown}개, 누르기 전 목록 ${unchanged ? '그대로' : '바뀜'}, 누른 뒤 맨 위 "${after[0]?.slice(0, 24)}…"`)
    await t.close()
  }
})

await j.run('B6', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const input = t.page.locator('#community-input')
  const disabled = await input.isDisabled()
  const placeholder = await input.getAttribute('placeholder')
  const send = await t.page.getByRole('button', { name: '올리기' }).isDisabled()
  const status = await t.page.locator('aside[aria-label="커뮤니티 안내"]').textContent()
  j.report('B6', disabled && send && /서버가 열리면/.test(placeholder ?? '') && /예시/.test(status ?? ''), `입력칸 잠김 ${disabled}("${placeholder}"), 올리기 잠김 ${send}, 안내에 예시라고 ${/예시/.test(status ?? '')}`)
  await t.close()
})

await j.run('B7', async () => {
  for (const width of [1440, 1024]) {
    const t = await j.open({ width })
    await t.goto('/community', 1500)
    const lines = await t.page.evaluate((feed) => {
      const bottom = (el) => Math.round(el.getBoundingClientRect().bottom)
      const feedHead = document.querySelector(`${feed} [role="group"][aria-label="정렬"]`).parentElement
      const sideHead = document.getElementById('community-side-title')
      return [bottom(feedHead), bottom(sideHead), Math.round(getComputedStyle(feedHead).borderBottomWidth.replace('px', ''))]
    }, FEED)
    j.report(`B7-${width}`, Math.abs(lines[0] - lines[1]) <= 1 && lines[2] === 2, `첫 선 아래 끝 가운데 탭 줄·오른쪽 제목 줄 ${lines[0]}·${lines[1]}px, 탭 줄 선 ${lines[2]}px`)
    await t.close()
  }
})

await j.run('B8', async () => {
  for (const width of [390, 320]) {
    const t = await j.open({ width, height: 800 })
    await t.goto('/community', 1500)
    const pageOk = await noOverflow(t.page)
    const strip = await t.page.evaluate((sel) => {
      const list = document.querySelector(`${sel} ul`)
      const cards = [...list.querySelectorAll('li')]
      const first = cards[0].getBoundingClientRect()
      const post = document.querySelector('section[aria-labelledby="community-feed-title"] ol li')?.getBoundingClientRect()
      return { rows: new Set(cards.map((li) => Math.round(li.getBoundingClientRect().top))).size, scrolls: list.scrollWidth > list.clientWidth, firstLeft: Math.round(first.left), postLeft: Math.round(post?.left ?? -1) }
    }, STRIP)
    await t.goto('/', 1500)
    const homeOk = await noOverflow(t.page)
    j.report(`B8-${width}`, pageOk && homeOk && strip.rows === 1 && strip.scrolls && Math.abs(strip.firstLeft - strip.postLeft) <= 2,
      `가로 넘침 없음 커뮤니티 ${pageOk}·홈 ${homeOk}, 종목 카드 ${strip.rows}줄·옆으로 밂 ${strip.scrolls}, 첫 카드 왼쪽 ${strip.firstLeft}px = 글 줄 ${strip.postLeft}px`)
    await t.close()
  }
})

await j.run('B11', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const toggle = t.page.getByRole('button', { name: '종목 검색' })
  await toggle.click()
  await sleep(200)
  const input = t.page.getByRole('combobox')
  const focused = await input.evaluate((el) => el === document.activeElement)
  // 글이 있는 종목: 이름 일부로 찾아 고른다
  const bio = POSTS.find((post) => post.stock?.code === '207940')?.stock ?? POSTS.find((post) => post.stock).stock
  await input.fill(bio.name.slice(0, 4))
  await sleep(600)
  await t.page.getByRole('option', { name: new RegExp(bio.name) }).first().getByRole('button').click()
  await sleep(300)
  const texts = await postTexts(t.page, FEED)
  const card = t.page.locator(STRIP).getByRole('button', { name: new RegExp(`^${bio.name} 글`) })
  const state = await card.evaluate((el) => ({ pressed: el.getAttribute('aria-pressed'), focused: el === document.activeElement }))
  const closed = (await t.page.getByRole('combobox').count()) === 0
  const expected = POSTS.filter((post) => post.stock?.code === bio.code).length
  j.report('B11a', focused && closed && state.pressed === 'true' && state.focused && texts.length === expected && texts.every((text) => text.startsWith(bio.name)),
    `열면 입력칸 포커스 ${focused}, "${bio.name}" 고름 → 칸 닫힘 ${closed}, 카드 눌림 ${state.pressed}·포커스 ${state.focused}, 글 ${texts.length}개(기대 ${expected})`)
  // 글이 없는 종목: 글 0 카드가 전체 다음에 선다
  await toggle.click()
  await sleep(200)
  await t.page.getByRole('combobox').fill('현대')
  await sleep(600)
  await t.page.getByRole('option', { name: /현대차 005380/ }).getByRole('button').click()
  await sleep(300)
  const cards = await cardTexts(t.page)
  const empty = await t.page.locator(FEED).getByText('현대차 이야기는 아직 없어요.').count()
  const head = await t.page.locator(`${FEED} h2`).first().textContent()
  const searchCalls = t.api().filter((line) => line.includes('/api/stocks/search')).length
  j.report('B11b', cards[1] === '현대차 글 0' && empty === 1 && head === '현대차 이야기' && searchCalls >= 1,
    `카드 ${cards.slice(0, 3).join(' · ')}…, 빈 안내 ${empty}, 구역 이름 "${head}", 검색 요청 ${searchCalls}건(가짜)`)
  // Esc: 후보가 닫힌 채 한 번 더 누르면 칸이 닫히고 포커스는 단추로
  await toggle.click()
  await sleep(200)
  await t.page.keyboard.press('Escape')
  await sleep(200)
  const escClosed = (await t.page.getByRole('combobox').count()) === 0
  const backOnToggle = await toggle.evaluate((el) => el === document.activeElement)
  j.report('B11c', escClosed && backOnToggle && (await toggle.getAttribute('aria-expanded')) === 'false', `Esc로 닫힘 ${escClosed}, 포커스가 "종목 검색" 단추로 ${backOnToggle}`)
  await t.close()
})

await j.run('B12', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const samsung = POSTS.find((post) => post.stock?.code === '005930').stock
  await t.page.getByRole('button', { name: '인기', exact: true }).click()
  await t.page.locator(STRIP).getByRole('button', { name: new RegExp(`^${samsung.name} 글`) }).click()
  await sleep(200)
  const texts = await postTexts(t.page, FEED)
  const expected = POPULAR.filter((post) => post.stock?.code === samsung.code).map(withStock)
  const note = await t.page.locator(FEED).getByText('공감 많은 순').count()
  await t.page.getByRole('button', { name: '최신', exact: true }).click()
  await sleep(200)
  const latest = await postTexts(t.page, FEED)
  const latestExpected = LATEST.filter((post) => post.stock?.code === samsung.code).map(withStock)
  j.report('B12', JSON.stringify(texts) === JSON.stringify(expected) && JSON.stringify(latest) === JSON.stringify(latestExpected) && note === 1,
    `인기 + ${samsung.name} ${texts.length}개 공감 차례 ${JSON.stringify(texts) === JSON.stringify(expected)}, 최신으로 바꾸면 ${JSON.stringify(latest) === JSON.stringify(latestExpected)}, "공감 많은 순" 표시 ${note}`)
  await t.close()
})

await j.run('B13', async () => {
  // 1024에서 카드 다섯이 글 열에 다 들어간다 — 글 없는 종목을 하나 더 골라 넘치게 한다
  const t = await j.open({ width: 1024, height: 768 })
  await t.goto('/community', 1500)
  const buttons = () => t.page.evaluate((sel) => {
    const nav = document.querySelector(sel)
    const shown = (cls) => [...nav.querySelectorAll(':scope > button')].filter((b) => b.className.includes(cls) && getComputedStyle(b).display !== 'none').length
    return { prev: shown('slidePrev'), next: shown('slideNext'), left: Math.round(nav.querySelector('ul').scrollLeft) }
  }, STRIP)
  const fits = await buttons()
  await t.page.getByRole('button', { name: '종목 검색' }).click()
  await t.page.getByRole('combobox').fill('현대')
  await sleep(600)
  await t.page.getByRole('option', { name: /현대차 005380/ }).getByRole('button').click()
  await sleep(300)
  const over = await buttons()
  await t.page.locator(`${STRIP} > button`).last().click()
  await sleep(700)
  const slid = await buttons()
  j.report('B13a', fits.prev + fits.next === 0 && over.prev === 0 && over.next === 1 && slid.left > 0 && slid.prev === 1,
    `다 들어갈 때 단추 ${fits.prev + fits.next}개, 넘치면 앞 ${over.prev}·뒤 ${over.next}, 뒤를 누르면 ${slid.left}px 밀리고 앞 ${slid.prev}`)
  await t.close()
  const m = await j.open({ width: 390, height: 844, touch: true })
  await m.goto('/community', 1500)
  const touch = await m.page.evaluate((sel) => {
    const list = document.querySelector(`${sel} ul`)
    const visible = [...document.querySelectorAll(`${sel} > button`)].filter((b) => getComputedStyle(b).display !== 'none').length
    return { scrolls: list.scrollWidth > list.clientWidth, visible, coarse: matchMedia('(pointer: coarse)').matches }
  }, STRIP)
  j.report('B13b', touch.coarse && touch.scrolls && touch.visible === 0, `손가락 화면(pointer: coarse ${touch.coarse}) 390 — 줄이 넘침 ${touch.scrolls}, 보이는 앞·뒤 단추 ${touch.visible}개`)
  await m.close()
})

await j.run('B9', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 2000)
  const calls = t.api().filter((line) => /community/i.test(line))
  j.report('B9', calls.length === 0, `커뮤니티 /api 요청 ${calls.length}건${calls.length ? ' — ' + calls.join(', ') : ''}`)
  await t.close()
})

await j.run('B10', async () => {
  const current = (page) => page.$$eval(`${FEED} li[aria-current="true"]`, (lis) => lis.map((li) => {
    const box = li.getBoundingClientRect()
    return { text: li.querySelector('p:nth-of-type(2)')?.textContent.trim() ?? '', inView: box.top >= 0 && box.bottom <= innerHeight, focused: li.contains(document.activeElement) }
  }))
  // 줄 어디를 눌러도 — 링크 글자가 아니라 별명 자리를 좌표로 누른다(행 전체를 덮는 링크)
  const t = await j.open({ width: 1440, height: 900 })
  await t.goto('/', 1800)
  const target = LATEST[3]
  const row = t.page.locator(`${HOME} li`).nth(3)
  await row.scrollIntoViewIfNeeded()
  const name = await row.locator('strong').first().boundingBox()
  await t.page.mouse.click(name.x + 4, name.y + name.height / 2)
  await sleep(1200)
  const path = new URL(t.page.url()).pathname
  const marked = await current(t.page)
  j.report('B10a', path === '/community' && marked.length === 1 && marked[0].text === withStock(target) && marked[0].inView && marked[0].focused,
    `별명 자리 누름 → ${path}, 표시된 글 ${marked.length}개 "${marked[0]?.text.slice(0, 20)}…"(기대 "${withStock(target).slice(0, 20)}…"), 화면 안 ${marked[0]?.inView}, 포커스 ${marked[0]?.focused}`)
  await t.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500)
  const afterReload = (await current(t.page)).length
  await t.goto('/', 1500)
  await t.page.getByRole('navigation', { name: '서비스' }).getByRole('link', { name: '커뮤니티' }).click(); await sleep(1000)
  const viaMenu = (await current(t.page)).length
  j.report('B10b', afterReload === 0 && viaMenu === 0, `새로고침 뒤 표시 ${afterReload}개, 메뉴로 들어오면 ${viaMenu}개`)
  await t.close()

  // 휴대폰 폭에서 종목 이름 자리를 눌러도 같은 글로 간다(줄 안에 따로 눌리는 작은 링크가 없다 — 있으면 조금만 빗나가도 다른 곳으로 갔다)
  const s = await j.open({ width: 375, height: 812 })
  await s.goto('/', 1800)
  const tag = LATEST.slice(0, 5).find((post) => post.stock)
  const tagged = s.page.locator(`${HOME} li`).filter({ hasText: tag.text }).first()
  await tagged.scrollIntoViewIfNeeded()
  const stockBox = await tagged.getByText(tag.stock.name, { exact: true }).boundingBox()
  await s.page.mouse.click(stockBox.x + 4, stockBox.y + stockBox.height / 2)
  await sleep(1200)
  const opened = await current(s.page)
  j.report('B10c', new URL(s.page.url()).pathname === '/community' && opened[0]?.text === withStock(tag),
    `375 폭 종목 이름(${tag.stock.name}) 자리 누름 → ${new URL(s.page.url()).pathname}, 표시된 글 "${opened[0]?.text.slice(0, 20)}…"`)
  await s.close()

  // 홈에서 세운 새 글(목업 — 커뮤니티 화면은 따로 받으니 처음 목록에 없다)도 그 글로 간다
  const l = await j.open({ width: 1440, height: 900 })
  await l.page.clock.install()
  await l.goto('/', 1500)
  await l.page.clock.runFor(41_000)
  await sleep(200)
  await l.page.locator(HOME).getByRole('button', { name: /^새 글 1/ }).click()
  await sleep(200)
  await l.page.locator(`${HOME} li`).first().locator('p').nth(1).click({ position: { x: 200, y: 8 } })
  await sleep(1200)
  const live = await current(l.page)
  const pending = await l.page.locator(FEED).getByRole('button', { name: /^새 글/ }).count()
  await l.page.clock.runFor(41_000)
  await sleep(200)
  const later = await l.page.locator(FEED).getByRole('button', { name: /^새 글/ }).textContent().catch(() => null)
  j.report('B10d', live.length === 1 && live[0].text === withStock(LIVE[0]) && pending === 0 && later === null,
    `새 글 누름 → 표시 "${live[0]?.text.slice(0, 20)}…", 들어오자마자 "새 글" ${pending}개, 40초 뒤 "${later}"(이미 보이는 글은 다시 세지 않는다)`)
  await l.close()
})

await j.finish()
