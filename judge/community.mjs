// 커뮤니티 판정(2026-11-03 사용자 "토스증권처럼 게시판으로… AI 주가분석과 사용설명서 사이에 커뮤니티… 웹소켓을 받을 자리만 남기고 목업을").
// 2026-11-02의 홈 채팅창 판정(C1~C13)을 게시판 판정으로 바꿨다. 기대값은 예시 글 파일(src/content/communityPreview.ts)에서 읽는다 —
// 사용자가 글을 고쳐도 판정을 고치지 않는다. /api는 전부 가짜(mock.mjs), 커뮤니티는 서버가 없어 /api를 부르지 않는다(B9).
//  B1 머리글 메뉴: 홈 · 관심종목 · 주식 백테스트 · AI 주가분석 · 커뮤니티 · 사용설명서(커뮤니티는 AI와 사용설명서 사이)
//  B2 홈 오른쪽 칸: "커뮤니티" 제목 줄(예시 표시·전체 보기 → /community), 최신 글 다섯 줄(별명·몇 분 전·글). 종목 이름은 홈에선 글 링크 안 글자,
//     커뮤니티 화면에선 그 종목 상세 링크
//  B3 커뮤니티 화면: 화면 제목, 예시 글 전부가 최신순, "공감 많은 순"을 누르면 공감 수 차례
//  B4 종목으로 보기: 종목을 누르면 그 종목 글만, 제목 줄이 "<종목> 이야기", 글 수가 목록 옆 수와 같다. "전체 글"로 돌아온다
//  B5 실시간(목업): 보고 있는 동안 새 글이 오면 끼우지 않고 "새 글 N개 보기"로 모은다 — 누르면 맨 위에 선다. 홈도 제목 줄에 "새 글 N"
//  B6 글쓰기: 서버가 없는 목업에서는 잠겨 있고 그렇다고 밝힌다(써도 갈 곳이 없다)
//  B7 세 열의 첫 선(1440): 왼쪽 종목 첫 줄 아래 선 = 가운데 제목 줄 먹 선 = 오른쪽 제목 줄 먹 선(1px 안)
//  B8 좁은 화면(390·320): 가로 넘침 없음, 종목은 두 칸씩
//  B9 커뮤니티는 /api를 부르지 않는다(서버가 없다 — 웹소켓 주소를 넣기 전까지). 아래 지수 띠의 요청은 어느 화면에나 있어 뺀다
//  B10 홈 글 줄을 누르면 커뮤니티 화면의 그 글로 간다(2026-11-03 사용자 "홈화면에서 커뮤니티의 글을 클릭하면 커뮤니티로 가는 기능") —
//      줄 어디를 눌러도(별명 자리·휴대폰에서 종목 이름 자리) /community, 그 글이 화면 안에 표시(aria-current)·포커스, 홈에서 세운 새 글(목업)도 찾아간다,
//      새로고침하면 표시가 풀린다(한 번 읽고 비운다), 메뉴로 그냥 들어오면 표시가 없다
// node community.mjs <BASE> [--only B1,B2] [--headed]
import { readFileSync } from 'node:fs'
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const j = await judge(cli())
const HOME = 'section[aria-labelledby="home-community-title"]'
const FEED = 'section[aria-labelledby="community-feed-title"]'

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
const postTexts = (page, scope) => page.$$eval(`${scope} li`, (lis) => lis.map((li) => li.querySelector('p:nth-of-type(2)')?.textContent.trim() ?? ''))
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
  await t.page.getByRole('button', { name: '공감 많은 순' }).click()
  await sleep(200)
  const popular = await postTexts(t.page, FEED)
  const pressed = await t.page.getByRole('button', { name: '공감 많은 순' }).getAttribute('aria-pressed')
  j.report('B3b', pressed === 'true' && JSON.stringify(popular) === JSON.stringify(POPULAR.map(withStock)), `공감 많은 순 ${pressed}, 첫 글 "${popular[0]?.slice(0, 20)}…"`)
  await t.close()
})

await j.run('B4', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const counts = new Map()
  for (const post of POSTS) if (post.stock) counts.set(post.stock.name, (counts.get(post.stock.name) ?? 0) + 1)
  const [name, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const nav = t.page.locator('nav[aria-label="종목으로 보기"]')
  await nav.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await sleep(200)
  const head = await t.page.locator(`${FEED} h2`).first().textContent()
  const texts = await postTexts(t.page, FEED)
  j.report('B4a', head === `${name} 이야기` && texts.length === count && texts.every((text) => text.startsWith(name)), `"${head}" — 글 ${texts.length}개(기대 ${count}), 모두 ${name} 글`)
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
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const lines = await t.page.evaluate(() => {
    const bottom = (el) => Math.round(el.getBoundingClientRect().bottom)
    const firstRow = document.querySelector('nav[aria-label="종목으로 보기"] li button')
    const feedHead = document.getElementById('community-feed-title').parentElement
    const sideHead = document.getElementById('community-side-title')
    return [bottom(firstRow), bottom(feedHead), bottom(sideHead)]
  })
  j.report('B7', Math.max(...lines) - Math.min(...lines) <= 1, `첫 선 아래 끝 왼쪽·가운데·오른쪽 ${lines.join('·')}px`)
  await t.close()
})

await j.run('B8', async () => {
  for (const width of [390, 320]) {
    const t = await j.open({ width, height: 800 })
    await t.goto('/community', 1500)
    const pageOk = await noOverflow(t.page)
    const cols = await t.page.$$eval('nav[aria-label="종목으로 보기"] li', (lis) => new Set(lis.slice(0, 2).map((li) => Math.round(li.getBoundingClientRect().top))).size)
    await t.goto('/', 1500)
    const homeOk = await noOverflow(t.page)
    j.report(`B8-${width}`, pageOk && homeOk && cols === 1, `가로 넘침 없음 커뮤니티 ${pageOk}·홈 ${homeOk}, 종목 첫 두 칸 ${cols === 1 ? '한 줄(두 칸씩)' : '두 줄'}`)
    await t.close()
  }
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
