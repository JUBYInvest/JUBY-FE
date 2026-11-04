// 커뮤니티 판정(2026-11-03 사용자 "토스증권처럼 게시판으로… AI 주가분석과 사용설명서 사이에 커뮤니티… 웹소켓을 받을 자리만 남기고 목업을").
// 2026-11-02의 홈 채팅창 판정(C1~C13)을 게시판 판정으로 바꿨다. 기대값은 예시 글 파일(src/content/communityPreview.ts)에서 읽는다 —
// 사용자가 글을 고쳐도 판정을 고치지 않는다. /api는 전부 가짜(mock.mjs), 커뮤니티 글은 서버가 없어 /api를 부르지 않는다(B9 — 등락률 GET /api/stocks 하나뿐).
// 2026-11-04 글이 제목 + 본문 + 사진이 되고(사용자가 토스증권 앱 캡처로 "커뮤니티 글쓰기 개념"을 짚었다) 글 상세·글쓰기 화면이 생겨 글 줄은 제목으로 견준다.
//  B1 머리글 메뉴: 홈 · 관심종목 · 주식 백테스트 · AI 주가분석 · 커뮤니티 · 사용설명서(커뮤니티는 AI와 사용설명서 사이)
//  B2 홈 오른쪽 칸: "커뮤니티" 제목 줄(예시 표시·전체 보기 → /community), 최신 글 다섯 줄(별명·몇 분 전·제목). 종목 이름은 글 줄에선 글자,
//     글 상세에선 그 종목 상세 링크
//  B3 커뮤니티 화면: 화면 제목, 예시 글 전부가 최신순, "인기" 탭을 누르면 공감 수 차례(2026-11-04 "최신순 · 공감 많은 순" → 큰 탭 "최신 · 인기")
//  B4 종목으로 보기(2026-11-04부터 글 위 카드 줄): 종목 카드를 누르면 그 종목 글만, 구역 이름이 "<종목> 이야기", 글 수가 카드의 수와 같다. "전체"로 돌아온다
//  B5 실시간(목업): 보고 있는 동안 새 글이 오면 끼우지 않고 "새 글 N개 보기"로 모은다 — 누르면 맨 위에 선다. 홈도 제목 줄에 "새 글 N"
//  B6 글쓰기(2026-11-04 떠 있는 "글쓰기" → /community/write): 종목 카드를 고른 채 누르면 그 종목 이야기로, 서버가 없는 목업에서는 칸이 다 잠겨 있고
//     그렇다고 밝힌다(써도 갈 곳이 없다), 제목·내용 칸·사진 자리·취소 → 목록
//  B7 두 열의 첫 선(1440·1024): 가운데 탭 줄 가는 선(1px — 11-04부터, 굵은 먹 선은 화면 제목 하나) = 오른쪽 제목 줄 먹 선(아래 끝 1px 안). 11-03까지는 왼쪽 종목 열까지 세 열이었다
//  B8 좁은 화면(390·320): 가로 넘침 없음, 종목 카드는 한 줄로 서고 옆으로 민다(줄이 화면보다 넓다), 첫 카드는 글과 같은 줄에서 시작
//  B11 종목 검색(2026-11-04 "검색 버튼을 통해 종목을 선택"): 제목 줄 "종목 검색" → 검색 칸(포커스) → 글이 있는 종목을 고르면 그 종목 글만·카드 눌림·
//      카드에 포커스, 글이 없는 종목(검색 가짜 응답)을 고르면 "글 0" 카드가 전체 다음에 서고 "<종목> 이야기는 아직 없어요", Esc로 닫으면 단추로 포커스
//  B12 인기 + 종목: 두 거름이 같이 걸린다(그 종목 글만 공감 수 차례), 탭 줄 오른쪽에 무엇 순인지
//  B13 카드 줄 앞·뒤 단추(마우스): 넘칠 때 뒤 단추만 → 누르면 줄이 밀리고 앞 단추가 생긴다, 손가락 화면에서는 단추가 없다(밀면 된다)
//  B9 커뮤니티는 열 때 글 /api를 부르지 않는다(서버가 없다 — 웹소켓 주소를 넣기 전까지). 부르는 건 글 머리 등락률의 GET /api/stocks 한 번(DB, 홈 시세표와 같은 값).
//     종목 검색 칸에 글자를 치면 홈 검색창과 같은 /api/stocks/search가 나간다(B11)
//  B10 홈 글 줄을 누르면 그 글 상세로 간다(2026-11-03 사용자 "홈화면에서 커뮤니티의 글을 클릭하면 커뮤니티로", 11-04부터 목록 표시 대신 글 상세) —
//      줄 어디를 눌러도(별명 자리·휴대폰에서 종목 이름 자리) /community/{postId}, 새로고침해도 그 글, 홈에서 세운 새 글(목업)도 찾아간다
//  B14 글 줄 → 글 상세: 제목(화면 제목)·본문 전부·종목 상세 링크·등락률·사진(목록은 미리보기 한 장, 상세는 사진마다 이름)·댓글 자리, "커뮤니티로 돌아가기", 없는 글
//  B15 등락률: 글 머리 종목 옆 값·색이 GET /api/stocks의 그 종목 값과 같다, 기준일은 목록 위에 한 번. B15b 종목 카드 아래 줄의 등락률도 같은 값·색
//  B17 휴대폰(375 손가락): 세 화면 넘침 없음, 글쓰기 단추가 지수 띠 위, 화면 끝 카드를 누르면 다 보이게 밀림, 누르는 동안 줄이 화면 끝까지 물듦, 글 상세 종목 줄 전체가 링크, 글쓰기 단추 줄이 지수 띠 위에 붙음
//  B18 당겨서 새로고침(375 손가락, 목업): 끌어내리면 본문이 따라오고 표시가 선다 → 놓으면 도는 고리만 보이고 곧바로 닫히며 다음 예시 새 글이 맨 위(화면 알림 글 없음 —
//      읽어 주는 쪽에만), 덜 당김·카드 줄 옆 밀기·내려 읽은 뒤는 아님, 이 화면에서만 브라우저 자체 당겨서 새로고침을 끈다
//  B19 종목이 많을 때 카드 줄(--ws, 가짜 서버가 30종목 글 40개): 손가락 밀기·끝까지·끝에서 더 밀기·세로 밀기·끝 카드 누르기, 마우스 뒤 단추 끝까지, 키보드 Tab
//  B16 실제 연결(--ws <웹소켓 주소를 넣고 묶은 빌드>, 가짜 WebSocket): 로그인하면 칸이 열린다 → 종목 고르기·제목·내용 → 올리기가 SEND에 제목·내용·종목을 싣고,
//      서버가 되돌려 준 내 글(POST_CREATED)의 글 상세로 간다. 비로그인은 칸이 잠기고 로그인 안내
// node community.mjs <BASE> [--only B1,B2] [--headed] [--ws <BASE2>]
import { readFileSync } from 'node:fs'
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const args = cli()
const WS_BASE = args.flag('--ws')
const j = await judge(args)
const HOME = 'section[aria-labelledby="home-community-title"]'
const FEED = 'section[aria-labelledby="community-feed-title"]'
const STRIP = 'nav[aria-label="종목으로 보기"]'

const SOURCE = readFileSync(new URL('../src/content/communityPreview.ts', import.meta.url), 'utf8')
const STOCKS = Object.fromEntries([...SOURCE.matchAll(/const (\w+) = \{ code: '(\d{6})', name: '([^']+)' \}/g)].map(([, key, code, name]) => [key, { code, name }]))
const parse = (block) => [...block.matchAll(/\{ id: (\d+), author: '([^']+)', stock: (null|\w+), title: '([^']*)', text: '([^']*)', minutesAgo: (\d+), likes: (\d+), comments: (\d+)(?:, images: \[([^\]]*)\])? \}/g)]
  .map(([, id, author, stock, title, text, minutesAgo, likes, comments, images]) => ({ id: Number(id), author, stock: stock === 'null' ? null : STOCKS[stock], title, text,
    minutesAgo: Number(minutesAgo), likes: Number(likes), comments: Number(comments), images: images ? [...images.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [] }))
const [initialBlock, liveBlock] = SOURCE.split('export const COMMUNITY_PREVIEW_LIVE')
const POSTS = parse(initialBlock)
const LIVE = parse(liveBlock)
if (POSTS.length < 5 || LIVE.length < 1) throw new Error(`예시 글을 ${POSTS.length}·${LIVE.length}개밖에 못 읽었다 — communityPreview.ts 모양이 바뀌었으면 위 정규식을 고친다`)
const LATEST = [...POSTS].sort((a, b) => a.minutesAgo - b.minutesAgo)
const POPULAR = [...POSTS].sort((a, b) => b.likes - a.likes || a.minutesAgo - b.minutesAgo)
// 글 줄은 ol > li, 제목은 h3다 — 2026-11-04부터 글 구역 안에 종목 카드 줄(ul > li)이 같이 있고 글은 제목 + 본문이다
const postTitles = (page, scope) => page.$$eval(`${scope} ol > li`, (lis) => lis.map((li) => li.querySelector('h3')?.textContent.trim() ?? ''))
/** 지금 시각의 등락률 글(앱 formatChangeRate와 같은 규칙) */
const rateText = (rate) => (Number(rate.toFixed(2)) === 0 ? '0.00%' : `${rate > 0 ? '+' : ''}${rate.toFixed(2)}%`)
/** 종목 카드의 이름 · 글 수(첫 글자 동그라미는 aria-hidden이라 뺀다) — "삼성전자 글 2". 아래 줄의 등락률은 cardRates가 따로 본다 */
const cardTexts = (page) => page.$$eval(`${STRIP} li button`, (buttons) => buttons.map((b) => {
  const [name, foot] = [...b.children].filter((c) => c.getAttribute('aria-hidden') !== 'true')
  return `${name?.textContent.trim()} ${foot?.firstElementChild?.textContent.trim()}`
}))
/** 종목 카드 아래 줄 오른쪽 등락률 — 카드마다 { code, text, color }(없으면 text 없음) */
const cardRates = (page) => page.$$eval(`${STRIP} li button`, (buttons) => buttons.map((b) => {
  const rate = b.lastElementChild?.children[1]
  return rate === undefined ? { code: b.dataset.code } : { code: b.dataset.code, text: rate.textContent.trim(), color: getComputedStyle(rate).color }
}))
const titleOf = (post) => post.title

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
  const texts = await postTitles(t.page, HOME)
  const expected = LATEST.slice(0, 5).map(titleOf)
  const meta = await t.page.$$eval(`${HOME} li`, (lis) => lis.map((li) => li.querySelector('p')?.textContent.trim() ?? ''))
  j.report('B2a', head === '커뮤니티' && sample === 1 && more === '/community', `제목 "${head}", 예시 표시 ${sample}, 전체 보기 → ${more}`)
  j.report('B2b', JSON.stringify(texts) === JSON.stringify(expected) && meta.every((m) => /\S+ (방금|\d+분 전|\d+시간 전)$/.test(m)),
    `최신 글 ${texts.length}줄 — 예시 글 최신 다섯과 ${JSON.stringify(texts) === JSON.stringify(expected) ? '같다' : '다르다'}, 별명·시각 ${meta.slice(0, 2).join(' / ')}`)
  // 글 줄은 줄 전체가 글 상세로 가는 링크라 종목 이름은 글자다(따로 눌리는 작은 링크를 두지 않는다 — B10). 종목 상세 링크는 글 상세에 있다
  const tag = LATEST.slice(0, 5).find((post) => post.stock)
  const homeStockLinks = tag ? await section.getByRole('link', { name: tag.stock.name, exact: true }).count() : -1
  await t.goto('/community', 1500)
  const listStockLinks = tag ? await t.page.locator(FEED).getByRole('link', { name: tag.stock.name, exact: true }).count() : -1
  await t.goto(`/community/${tag.id}`, 1500)
  const href = tag ? await t.page.locator('main article').getByRole('link', { name: tag.stock.name, exact: true }).getAttribute('href') : null
  j.report('B2c', tag !== undefined && homeStockLinks === 0 && listStockLinks === 0 && href === `/stocks/${tag.stock.code}`,
    `홈·목록 글 줄 안 종목 링크 ${homeStockLinks}·${listStockLinks}개, 글 상세 종목 이름 링크 ${tag?.stock.name} → ${href}`)
  await t.close()
})

await j.run('B3', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const title = await t.page.locator('main h1').textContent()
  const latest = await postTitles(t.page, FEED)
  j.report('B3a', title === '커뮤니티' && JSON.stringify(latest) === JSON.stringify(LATEST.map(titleOf)), `화면 제목 "${title}", 최신순 ${latest.length}개 ${JSON.stringify(latest) === JSON.stringify(LATEST.map(titleOf)) ? '예시 글 그대로' : '순서·글이 다르다'}`)
  const tabs = await t.page.locator(FEED).getByRole('group', { name: '정렬' }).getByRole('button').allTextContents()
  await t.page.getByRole('button', { name: '인기', exact: true }).click()
  await sleep(200)
  const popular = await postTitles(t.page, FEED)
  const pressed = await t.page.getByRole('button', { name: '인기', exact: true }).getAttribute('aria-pressed')
  j.report('B3b', tabs.join('|') === '최신|인기' && pressed === 'true' && JSON.stringify(popular) === JSON.stringify(POPULAR.map(titleOf)),
    `탭 ${tabs.join(' · ')}, 인기 ${pressed}, 공감 수 차례 ${JSON.stringify(popular) === JSON.stringify(POPULAR.map(titleOf))}, 첫 글 "${popular[0]?.slice(0, 20)}…"`)
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
  const texts = await postTitles(t.page, FEED)
  const cardCount = (await cardTexts(t.page)).find((text) => text.startsWith(`${name} 글`)) ?? ''
  const expectedTitles = LATEST.filter((post) => post.stock?.name === name).map(titleOf)
  j.report('B4a', head === `${name} 이야기` && JSON.stringify(texts) === JSON.stringify(expectedTitles) && cardCount.endsWith(`글 ${count}`),
    `"${head}" — 글 ${texts.length}개(기대 ${count}, 카드 "${cardCount}"), ${name} 글만 최신순 ${JSON.stringify(texts) === JSON.stringify(expectedTitles)}`)
  await nav.getByRole('button', { name: /^전체 글/ }).click()
  await sleep(200)
  j.report('B4b', (await postTitles(t.page, FEED)).length === POSTS.length, `전체 글로 돌아오면 ${POSTS.length}개`)
  await t.close()
})

await j.run('B5', async () => {
  for (const [path, scope] of [['/community', FEED], ['/', HOME]]) {
    const t = await j.open({ width: 1440 })
    await t.page.clock.install()
    await t.goto(path, 1500)
    const before = await postTitles(t.page, scope)
    await t.page.clock.runFor(41_000)
    await sleep(200)
    const fresh = t.page.locator(scope).getByRole('button', { name: /^새 글 1/ })
    const shown = await fresh.count()
    const unchanged = JSON.stringify(await postTitles(t.page, scope)) === JSON.stringify(before)
    if (shown === 1) await fresh.click()
    await sleep(200)
    const after = await postTitles(t.page, scope)
    j.report(`B5-${path === '/' ? 'home' : 'page'}`, shown === 1 && unchanged && after[0] === LIVE[0].title && (await fresh.count()) === 0,
      `40초 뒤 "새 글 1" 단추 ${shown}개, 누르기 전 목록 ${unchanged ? '그대로' : '바뀜'}, 누른 뒤 맨 위 "${after[0]?.slice(0, 24)}…"`)
    await t.close()
  }
})

await j.run('B6', async () => {
  const t = await j.open({ width: 1440 })
  await t.goto('/community', 1500)
  const samsung = POSTS.find((post) => post.stock?.code === '005930').stock
  await t.page.locator(STRIP).getByRole('button', { name: new RegExp(`^${samsung.name} 글`) }).click()
  await t.page.getByRole('link', { name: '글쓰기' }).click()
  await sleep(800)
  const path = new URL(t.page.url()).pathname
  const form = await t.page.evaluate(() => ({
    h1: document.querySelector('main h1')?.textContent,
    fieldset: document.querySelector('main fieldset')?.disabled,
    // 칸은 묶음(fieldset)이 잠근다 — 칸 자신의 disabled 속성이 아니라 :disabled로 본다
    title: document.getElementById('community-write-title')?.matches(':disabled'),
    content: document.getElementById('community-write-content')?.tagName,
    contentDisabled: document.getElementById('community-write-content')?.matches(':disabled'),
    maxTitle: document.getElementById('community-write-title')?.maxLength,
    maxContent: document.getElementById('community-write-content')?.maxLength,
    photo: [...document.querySelectorAll('main button')].some((b) => b.textContent.includes('사진') && b.disabled),
    stock: document.querySelector('main form')?.textContent.includes('삼성전자 이야기'),
  }))
  const send = await t.page.getByRole('button', { name: '올리기' }).isDisabled()
  const notice = await t.page.locator('main').getByText(/서버가 열리면/).count()
  j.report('B6a', path === '/community/write' && form.h1 === '글쓰기' && form.fieldset && form.title && form.content === 'TEXTAREA' && form.contentDisabled && form.photo && send && notice >= 1 && form.stock,
    `${path} "${form.h1}" — 칸 묶음 잠김 ${form.fieldset}(제목 ${form.title}·내용 ${form.content} ${form.contentDisabled}), 사진 자리 잠김 ${form.photo}, 올리기 잠김 ${send}, 까닭 ${notice}, 고른 종목 실림 ${form.stock}`)
  await t.page.getByRole('link', { name: '취소' }).click()
  await sleep(600)
  const side = await t.page.locator('aside[aria-label="커뮤니티 안내"]').textContent()
  j.report('B6b', new URL(t.page.url()).pathname === '/community' && form.maxTitle === 40 && form.maxContent === 1000 && /예시/.test(side ?? ''),
    `취소 → ${new URL(t.page.url()).pathname}, 제목 ${form.maxTitle}자·내용 ${form.maxContent}자까지, 목록 안내에 예시라고 ${/예시/.test(side ?? '')}`)
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
    // 탭 줄은 화면 제목 아래 단계라 가는 선(1px)이다 — 굵은 먹 선은 화면 제목 하나(2026-11-04 사용자 "검은색 가로줄이 두 개… 위계를 나누던가")
    j.report(`B7-${width}`, Math.abs(lines[0] - lines[1]) <= 1 && lines[2] === 1, `첫 선 아래 끝 가운데 탭 줄·오른쪽 제목 줄 ${lines[0]}·${lines[1]}px, 탭 줄 선 ${lines[2]}px(가는 선)`)
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
  const texts = await postTitles(t.page, FEED)
  const card = t.page.locator(STRIP).getByRole('button', { name: new RegExp(`^${bio.name} 글`) })
  const state = await card.evaluate((el) => ({ pressed: el.getAttribute('aria-pressed'), focused: el === document.activeElement }))
  const closed = (await t.page.getByRole('combobox').count()) === 0
  const expected = POSTS.filter((post) => post.stock?.code === bio.code).length
  const expectedTitles = LATEST.filter((post) => post.stock?.code === bio.code).map(titleOf)
  j.report('B11a', focused && closed && state.pressed === 'true' && state.focused && texts.length === expected && JSON.stringify(texts) === JSON.stringify(expectedTitles),
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
  const texts = await postTitles(t.page, FEED)
  const expected = POPULAR.filter((post) => post.stock?.code === samsung.code).map(titleOf)
  const note = await t.page.locator(FEED).getByText('공감 많은 순').count()
  await t.page.getByRole('button', { name: '최신', exact: true }).click()
  await sleep(200)
  const latest = await postTitles(t.page, FEED)
  const latestExpected = LATEST.filter((post) => post.stock?.code === samsung.code).map(titleOf)
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
  // 아래 지수 띠의 장 상태(휴장일) 요청은 어느 화면에나 있어 뺀다
  const all = t.api().filter((line) => !line.startsWith('GET /api/market/'))
  const stocks = all.filter((line) => line === 'GET /api/stocks').length
  j.report('B9', calls.length === 0 && stocks === 1 && all.length === 1, `커뮤니티 글 /api 요청 ${calls.length}건, 등락률 GET /api/stocks ${stocks}건, 전체 ${all.join(', ')}`)
  await t.close()
})

await j.run('B10', async () => {
  const detail = (page) => page.evaluate(() => ({ path: location.pathname, h1: document.querySelector('main h1')?.textContent.trim() ?? '' }))
  // 줄 어디를 눌러도 — 링크 글자가 아니라 별명 자리를 좌표로 누른다(행 전체를 덮는 링크)
  const t = await j.open({ width: 1440, height: 900 })
  await t.goto('/', 1800)
  const target = LATEST[3]
  const row = t.page.locator(`${HOME} li`).nth(3)
  await row.scrollIntoViewIfNeeded()
  const name = await row.locator('strong').first().boundingBox()
  await t.page.mouse.click(name.x + 4, name.y + name.height / 2)
  await sleep(1200)
  const opened = await detail(t.page)
  j.report('B10a', opened.path === `/community/${target.id}` && opened.h1 === target.title, `별명 자리 누름 → ${opened.path} "${opened.h1}"(기대 /community/${target.id} "${target.title}")`)
  await t.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500)
  const reloaded = await detail(t.page)
  j.report('B10b', reloaded.path === opened.path && reloaded.h1 === target.title, `새로고침해도 ${reloaded.path} "${reloaded.h1}"(주소가 곧 그 글이다)`)
  await t.close()

  // 휴대폰 폭에서 종목 이름 자리를 눌러도 같은 글로 간다(줄 안에 따로 눌리는 작은 링크가 없다 — 있으면 조금만 빗나가도 다른 곳으로 갔다)
  const s = await j.open({ width: 375, height: 812 })
  await s.goto('/', 1800)
  const tag = LATEST.slice(0, 5).find((post) => post.stock)
  const tagged = s.page.locator(`${HOME} li`).filter({ hasText: tag.title }).first()
  await tagged.scrollIntoViewIfNeeded()
  const stockBox = await tagged.getByText(tag.stock.name, { exact: true }).boundingBox()
  await s.page.mouse.click(stockBox.x + 4, stockBox.y + stockBox.height / 2)
  await sleep(1200)
  const viaStock = await detail(s.page)
  j.report('B10c', viaStock.path === `/community/${tag.id}` && viaStock.h1 === tag.title, `375 폭 종목 이름(${tag.stock.name}) 자리 누름 → ${viaStock.path} "${viaStock.h1}"`)
  await s.close()

  // 홈에서 세운 새 글(목업 — 글 상세는 따로 받으니 처음 목록에 없다)도 그 글로 간다. 새로고침하면 글 하나 받기로 다시 찾는다
  const l = await j.open({ width: 1440, height: 900 })
  await l.page.clock.install()
  await l.goto('/', 1500)
  await l.page.clock.runFor(41_000)
  await sleep(200)
  await l.page.locator(HOME).getByRole('button', { name: /^새 글 1/ }).click()
  await sleep(200)
  await l.page.locator(`${HOME} li`).first().locator('h3 a').click()
  await sleep(1200)
  const live = await detail(l.page)
  const body = await l.page.locator('main article').textContent()
  await l.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500)
  const liveReloaded = await detail(l.page)
  j.report('B10d', live.path === `/community/${LIVE[0].id}` && live.h1 === LIVE[0].title && body.includes(LIVE[0].text) && liveReloaded.h1 === LIVE[0].title,
    `새 글 누름 → ${live.path} "${live.h1}", 본문 ${body.includes(LIVE[0].text)}, 새로고침 뒤 "${liveReloaded.h1}"`)
  await l.close()
})

await j.run('B14', async () => {
  const t = await j.open({ width: 1440, height: 900 })
  await t.goto('/community', 1500)
  const pictured = POSTS.find((post) => post.images.length > 0 && post.stock)
  const listImages = await t.page.$$eval(`${FEED} ol > li`, (lis) => lis.map((li) => li.querySelectorAll('img').length))
  const expectedImages = LATEST.map((post) => Math.min(1, post.images.length))
  const row = t.page.locator(`${FEED} ol > li`).filter({ hasText: pictured.title })
  await row.scrollIntoViewIfNeeded()
  // 제목 링크가 아니라 줄 아래쪽(공감 수와 별명 사이 빈자리)을 누른다 — 줄 전체가 글 상세로 간다
  const box = await row.boundingBox()
  await t.page.mouse.click(box.x + box.width * 0.5, box.y + box.height - 14)
  await sleep(1000)
  const page = await t.page.evaluate(() => {
    const article = document.querySelector('main article')
    return {
      path: location.pathname,
      h1: document.querySelector('main h1')?.textContent.trim(),
      text: article?.textContent ?? '',
      images: [...(article?.querySelectorAll('img') ?? [])].map((img) => ({ src: new URL(img.src).pathname, alt: img.alt })),
      comments: document.getElementById('community-comments-title')?.textContent.trim(),
      stockHref: article?.querySelector('a[href^="/stocks/"]')?.getAttribute('href'),
    }
  })
  j.report('B14a', page.path === `/community/${pictured.id}` && page.h1 === pictured.title && page.text.includes(pictured.text) && page.stockHref === `/stocks/${pictured.stock.code}`
    && page.images.length === pictured.images.length && page.images.every((img, i) => img.src === pictured.images[i] && img.alt === `글에 붙은 사진 ${i + 1}`)
    && page.comments === `댓글 ${pictured.comments}` && JSON.stringify(listImages) === JSON.stringify(expectedImages),
    `목록 사진 미리보기 ${JSON.stringify(listImages)}, 줄 아래 빈자리 누름 → ${page.path} "${page.h1}", 본문 전부 ${page.text.includes(pictured.text)}, 종목 → ${page.stockHref}, 사진 ${JSON.stringify(page.images)}, "${page.comments}"`)
  // 본문은 목록에서 두 줄로 자르고 글 상세에서 전부(긴 글 하나로)
  await t.page.getByRole('link', { name: /커뮤니티로 돌아가기/ }).click()
  await sleep(800)
  const back = new URL(t.page.url()).pathname
  const clamp = await t.page.$$eval(`${FEED} ol > li h3 + p`, (ps) => ps.map((el) => getComputedStyle(el).webkitLineClamp))
  for (const path of ['/community/999', '/community/abc']) {
    await t.goto(path, 1200)
    const missing = await t.page.evaluate(() => ({ h1: document.querySelector('main h1')?.textContent.trim(), link: document.querySelector('main article a[href="/community"]') !== null }))
    j.report(`B14-${path.split('/').pop()}`, missing.h1 === '글을 찾을 수 없어요' && missing.link, `${path}: "${missing.h1}", 목록으로 링크 ${missing.link}`)
  }
  j.report('B14b', back === '/community' && clamp.length > 0 && clamp.every((value) => value === '2'), `돌아가기 → ${back}, 목록 본문 줄 수 제한 ${[...new Set(clamp)].join(',')}`)
  await t.close()
})

await j.run('B15', async () => {
  const t = await j.open({ width: 1440, height: 900 })
  await t.goto('/community', 1500)
  const shown = await t.page.$$eval(`${FEED} ol > li`, (lis) => lis.map((li) => {
    // 종목 줄은 글 줄의 첫 문단이다(없으면 제목·본문 칸이 먼저)
    const head = li.firstElementChild?.tagName === 'P' ? li.firstElementChild : null
    return head === null ? null : { name: head.textContent, rate: head.lastElementChild?.textContent.trim(), color: getComputedStyle(head.lastElementChild).color }
  }))
  // 기대값은 같은 가짜 응답에서 — 화면 안에서 같은 주소를 한 번 더 받는다(판정의 요청, 화면 요청 수는 B9가 본다)
  const list = await t.page.evaluate(async () => (await (await fetch('/api/stocks')).json()).result)
  const byCode = new Map(list.stockList.map((row) => [row.stockCode, row.fluctuate]))
  const colors = await t.page.evaluate(() => {
    const probe = (token) => { const el = document.createElement('span'); el.style.color = `var(${token})`; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c }
    return { up: probe('--color-up-text'), down: probe('--color-down-text'), sub: probe('--color-text-sub') }
  })
  const bad = []
  LATEST.forEach((post, i) => {
    const got = shown[i]
    if (!post.stock) { if (got !== null) bad.push(`${post.id} 종목 없는 글에 종목 줄`); return }
    const rate = byCode.get(post.stock.code)
    const want = rateText(rate)
    const color = Number(rate.toFixed(2)) === 0 ? colors.sub : rate > 0 ? colors.up : colors.down
    if (got === null || !got.name.includes(post.stock.name) || got.rate !== want || got.color !== color) bad.push(`${post.id} ${JSON.stringify(got)} 기대 ${want}`)
  })
  const asOf = await t.page.locator(FEED).getByText(/^등락률은 .+ 종가 기준이에요$/).count()
  j.report('B15', bad.length === 0 && asOf === 1, `글 머리 등락률 ${LATEST.filter((p) => p.stock).length}개 중 어긋남 ${bad.length}${bad.length ? ' · ' + bad.slice(0, 3).join(' | ') : ''}, 기준일 한 번 ${asOf}`)
  // 종목 카드 아래 줄 오른쪽에도 같은 값·색(2026-11-04 다듬기). 전체 카드는 등락률이 없다
  const cards = await cardRates(t.page)
  const cardBad = cards.filter((card) => {
    if (card.code === 'all') return card.text !== undefined
    const rate = byCode.get(card.code)
    const color = Number(rate.toFixed(2)) === 0 ? colors.sub : rate > 0 ? colors.up : colors.down
    return card.text !== rateText(rate) || card.color !== color
  })
  j.report('B15b', cards.length > 1 && cardBad.length === 0, `종목 카드 ${cards.length}장 등락률·색 어긋남 ${cardBad.length}${cardBad.length ? ' · ' + JSON.stringify(cardBad.slice(0, 2)) : ''}, 예 ${cards.slice(1, 3).map((c) => c.text).join(' · ')}`)
  await t.close()
})

/*
 * B16 — 웹소켓 주소를 넣고 묶은 빌드에서만(--ws). 브라우저의 WebSocket을 가짜로 바꿔 STOMP 서버 흉내를 낸다:
 * CONNECT에 CONNECTED, SEND에 같은 글을 POST_CREATED로 되돌려 준다. 밖으로 나가는 연결은 없다
 */
const FAKE_SOCKET = () => {
  window.__frames = []
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.() }, 30) }
    reply(body) { setTimeout(() => this.onmessage?.({ data: body }), 60) }
    send(data) {
      window.__frames.push(data)
      const command = data.split('\n')[0]
      if (command === 'CONNECT') this.reply('CONNECTED\nversion:1.2\n\n\0')
      if (command === 'SEND') {
        const draft = JSON.parse(data.slice(data.indexOf('\n\n') + 2).replace(/\0$/, ''))
        const post = { postId: 9001, author: '나', stockCode: draft.stockCode, stockName: draft.stockCode === '005930' ? '삼성전자' : null, title: draft.title, content: draft.content,
          imageUrls: [], createdAt: new Date().toISOString(), likeCount: 0, commentCount: 0 }
        this.reply(`MESSAGE\ndestination:/topic/community\n\n${JSON.stringify({ type: 'POST_CREATED', post })}\0`)
      }
    }
    close() { this.readyState = 3 }
  }
  window.WebSocket = FakeSocket
}

await j.run('B16', async () => {
  if (WS_BASE === null || WS_BASE === undefined) { j.report('B16', null, '웹소켓 빌드 없음 — --ws <BASE2>를 주면 실제 연결 흐름을 잰다'); return }
  const t = await j.open({ width: 1440, height: 900 })
  await t.context.addInitScript(FAKE_SOCKET)
  // 목록에서 떠 있는 "글쓰기"로 들어간다 — 다 쓴 뒤 뒤로 가면 목록이어야 한다
  await t.page.goto(`${WS_BASE}/community`, { waitUntil: 'domcontentloaded' })
  await sleep(1000)
  await t.page.getByRole('link', { name: '글쓰기' }).click()
  await sleep(800)
  const enabled = !(await t.page.locator('#community-write-title').isDisabled())
  await t.page.getByRole('button', { name: '종목 고르기' }).click()
  await t.page.getByRole('combobox').fill('삼성전자')
  await sleep(500)
  await t.page.getByRole('option', { name: /삼성전자 005930/ }).getByRole('button').click()
  const lockedEmpty = await t.page.getByRole('button', { name: '올리기' }).isDisabled()
  await t.page.locator('#community-write-title').fill('처음 써 보는 글')
  await t.page.locator('#community-write-content').fill('첫 줄\n둘째 줄')
  await t.page.getByRole('button', { name: '올리기' }).click()
  await sleep(1200)
  const frames = await t.page.evaluate(() => window.__frames)
  const sent = frames.find((frame) => frame.startsWith('SEND'))
  const body = sent ? JSON.parse(sent.slice(sent.indexOf('\n\n') + 2).replace(/\0$/, '')) : null
  const after = await t.page.evaluate(() => ({ path: location.pathname, h1: document.querySelector('main h1')?.textContent.trim(), text: document.querySelector('main article')?.textContent ?? '' }))
  j.report('B16a', enabled && lockedEmpty && body?.title === '처음 써 보는 글' && body?.content === '첫 줄\n둘째 줄' && body?.stockCode === '005930'
    && after.path === '/community/9001' && after.h1 === '처음 써 보는 글' && after.text.includes('둘째 줄'),
    `로그인 칸 열림 ${enabled}, 빈 칸이면 올리기 잠김 ${lockedEmpty}, SEND ${JSON.stringify(body)}, 되돌려 받은 내 글 → ${after.path} "${after.h1}"`)
  // 뒤로 가면 글쓰기가 아니라 그 앞(주소 기록을 바꿔 넣었다)
  await t.page.goBack({ waitUntil: 'domcontentloaded' }); await sleep(600)
  j.report('B16b', new URL(t.page.url()).pathname === '/community', `글 상세에서 뒤로 → ${new URL(t.page.url()).pathname}(글쓰기로 돌아가지 않고 목록)`)
  await t.close()

  const o = await j.open({ width: 1440, height: 900, loggedIn: false })
  await o.context.addInitScript(FAKE_SOCKET)
  await o.page.goto(`${WS_BASE}/community/write`, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  const out = await o.page.evaluate(() => ({ locked: document.querySelector('main fieldset')?.disabled, login: document.querySelector('main a[href^="/login"]')?.textContent }))
  j.report('B16c', out.locked === true && out.login === '로그인하기', `비로그인: 칸 잠김 ${out.locked}, 안내 링크 "${out.login}"`)
  await o.close()
})

// B18 당겨서 새로고침(2026-11-04 사용자 "글을 위쪽 방향으로 잡아당겼을 때 새로고침이 되어 새 글이 나오는 것", 375 손가락, 목업):
// 맨 위에서 끌어내리면 본문이 따라 내려오고 표시가 서며 페이지는 스크롤되지 않는다 → 놓으면 도는 고리만 → 곧바로 제자리, 다음 예시 새 글이 맨 위에 선다.
// 화면에 "새 글 N개"·"새 글이 없어요" 같은 알림 글을 띄우지 않는다(같은 날 사용자 "이런 거 보내지 말고 로딩창만 떴다가 바로 내려오도록") — 읽어 주는 쪽에만 알린다.
// 덜 당기면 그냥 돌아간다(고리 없이), 카드 줄을 옆으로 밀거나 글을 내려 읽은 뒤에는 당김이 아니다.
// 이 화면에 있는 동안 브라우저 자체 당겨서 새로고침(페이지 전체를 다시 읽는다)을 끄고, 떠나면 되돌린다
await j.run('B18', async () => {
  const t = await j.open({ width: 375, height: 812, touch: true })
  await t.goto('/community', 1500)
  const cdp = await t.context.newCDPSession(t.page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  /** 손가락을 (x, y)에서 dy만큼 끌어내리다 멈춘 순간을 재고 뗀다 */
  const drag = async (x, y, dx, dy, during = null) => {
    await touch('touchStart', x, y)
    for (let i = 1; i <= 12; i++) { await touch('touchMove', x + (dx * i) / 12, y + (dy * i) / 12); await sleep(16) }
    const mid = during === null ? null : await during()
    await touch('touchEnd')
    return mid
  }
  const state = () => t.page.evaluate(() => {
    const area = document.querySelector('main [data-pull]')
    const body = area?.children[1]
    const mark = area?.children[0]
    return { phase: area?.dataset.pull, pull: area?.style.getPropertyValue('--pull'), transform: body ? getComputedStyle(body).transform : null,
      mark: mark ? Math.round(mark.getBoundingClientRect().height) : -1, markText: mark?.textContent.trim() ?? '', scrollY: Math.round(scrollY),
      status: document.querySelector('main p[role="status"]')?.textContent.trim() ?? '' }
  })
  const overscroll = await t.page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)
  const before = await postTitles(t.page, FEED)

  // 덜 당김(손가락 60px → 당김 26px) — 새로고침하지 않는다, 돌아가는 동안 고리도 없다
  await drag(187, 300, 0, 60)
  await sleep(60)
  const shortSpinner = await t.page.evaluate(() => document.querySelector('main [data-pull]')?.children[0].querySelector('[class*="spinner"]') !== null)
  await sleep(600)
  const short = { titles: await postTitles(t.page, FEED), ...(await state()) }

  // 다 당김(손가락 220px) — 놓은 뒤 50ms마다 단계와 표시 글자를 적는다
  const mid = await drag(187, 300, 0, 220, state)
  const released = Date.now()
  const trail = []
  while (Date.now() - released < 2500) {
    const now = await state()
    trail.push({ ms: Date.now() - released, phase: now.phase, text: now.markText, spinner: await t.page.evaluate(() => document.querySelector('main [data-pull]')?.children[0].querySelector('[class*="spinner"]') !== null) })
    if (now.phase === 'idle') break
    await sleep(50)
  }
  const after = { titles: await postTitles(t.page, FEED), ...(await state()) }
  const idleAt = trail.find((step) => step.phase === 'idle')?.ms ?? -1
  const spun = trail.some((step) => step.phase === 'refreshing' && step.spinner)
  const texts = [...new Set(trail.map((step) => step.text).filter(Boolean))]
  j.report('B18a', overscroll === 'contain' && mid.phase === 'ready' && mid.mark >= 64 && /translate|matrix/.test(mid.transform) && mid.scrollY === 0
    && short.phase === 'idle' && JSON.stringify(short.titles) === JSON.stringify(before) && !shortSpinner
    && spun && texts.length === 0 && idleAt > 0 && idleAt <= 1300 && after.transform === 'none' && after.status === '새 글 1개를 위에 올렸어요'
    && after.titles[0] === LIVE[0].title && after.titles.length === before.length + 1,
    `브라우저 당겨서 새로고침 끔 ${overscroll}, 덜 당김 → ${short.phase}·글 그대로 ${JSON.stringify(short.titles) === JSON.stringify(before)}·돌아가는 동안 고리 ${shortSpinner}, 다 당긴 순간 ${mid.phase} 표시 ${mid.mark}px·본문 내려옴 ${mid.transform !== 'none'}·페이지 y ${mid.scrollY}, `
    + `놓으면 도는 고리 ${spun}·화면 알림 글 ${texts.length ? JSON.stringify(texts) : '없음'} → ${idleAt}ms에 제자리(본문 transform ${after.transform}), 맨 위 "${after.titles[0]}"(글 ${before.length}→${after.titles.length}), 읽어 주기 "${after.status}"`)

  // 카드 줄을 옆으로 밀면 당김이 아니다
  const strip = await t.page.locator(`${STRIP} ul`).boundingBox()
  const sideways = await drag(300, strip.y + strip.height / 2, -200, 30, state)
  await sleep(400)
  const stripLeft = await t.page.locator(`${STRIP} ul`).evaluate((el) => el.scrollLeft)
  // 글을 내려 읽은 뒤에는 끌어내려도 당김이 아니다(페이지가 위로 올라갈 뿐)
  await t.page.evaluate(() => window.scrollTo(0, 400))
  await sleep(300)
  const scrolledMid = await drag(187, 300, 0, 220, state)
  await sleep(400)
  const scrolled = await state()
  await t.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(300)
  // 남은 예시 새 글을 다 받은 뒤 — 화면에는 아무 글도 없이 닫히고, 읽어 주는 쪽에만 "새 글이 없어요"
  for (let i = 1; i < LIVE.length; i++) { await drag(187, 300, 0, 220); await sleep(1600) }
  await drag(187, 300, 0, 220)
  await sleep(700)
  const emptyMid = await state()
  await sleep(900)
  const emptyDone = await state()
  const finalTitles = await postTitles(t.page, FEED)
  j.report('B18b', sideways.phase === 'idle' && stripLeft > 0 && scrolledMid.phase === 'idle' && scrolled.phase === 'idle'
    && emptyMid.markText === '' && emptyDone.phase === 'idle' && emptyDone.status === '새 글이 없어요'
    && finalTitles.length === before.length + LIVE.length && LIVE.every((post) => finalTitles.includes(post.title)),
    `카드 줄 옆으로 밀기 → ${sideways.phase}(줄 ${Math.round(stripLeft)}px 밀림), 내려 읽은 뒤 끌어내림 → ${scrolledMid.phase}, 예시 새 글 ${LIVE.length}개를 다 받은 뒤 화면 글 "${emptyMid.markText}" → ${emptyDone.phase}(읽어 주기 "${emptyDone.status}"), 글 ${finalTitles.length}개`)

  // 떠나면 브라우저 기본으로 돌아간다
  await t.page.getByRole('link', { name: '홈', exact: true }).first().click().catch(() => {})
  await t.goto('/', 1000)
  const restored = await t.page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)
  j.report('B18c', restored === 'auto', `커뮤니티를 떠나면 브라우저 당겨서 새로고침 되돌림 ${restored}`)
  await cdp.detach()
  await t.close()
})

// B19 종목이 많아지면(2026-11-04 사용자 "커뮤니티 종목이 다양해지면 좌우 스크롤도 정상적으로 되는지"): 가짜 서버가 30종목 글 40개를 밀어 준다(--ws 빌드).
// 휴대폰 — 카드 한 줄·페이지 넘침 없음, 손가락으로 밀면 줄만 밀리고(페이지는 옆·위아래로 안 움직임) 끝까지 밀면 마지막 카드가 다 보이고 끝에서 더 밀어도 브라우저 뒤로 가기로 번지지 않음,
// 줄 위에서 위아래로 밀면 페이지가 내려감, 끝 카드를 누르면 그 종목 글만 나오고 줄은 제자리. 마우스 — 뒤 단추를 끝까지 누르면 마지막 카드가 다 보이고 뒤 단추가 사라짐. 키보드 — Tab으로 끝 카드까지 따라감
const STOCK_SOURCE = readFileSync(new URL('../src/api/stockList.ts', import.meta.url), 'utf8')
const MANY = [...STOCK_SOURCE.matchAll(/\{ stockCode: '(\d{6})', stockName: '([^']+)' \}/g)].slice(0, 30).map(([, code, name]) => ({ code, name }))
const FAKE_FEED = (posts) => {
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.() }, 30) }
    reply(body) { setTimeout(() => this.onmessage?.({ data: body }), 60) }
    send(data) {
      const command = data.split('\n')[0]
      if (command === 'CONNECT') this.reply('CONNECTED\nversion:1.2\n\n\0')
      if (command === 'SUBSCRIBE') this.reply(posts.map((post) => `MESSAGE\ndestination:/topic/community\n\n${JSON.stringify({ type: 'POST_CREATED', post })}\0`).join(''))
    }
    close() { this.readyState = 3 }
  }
  window.WebSocket = FakeSocket
}
const manyPosts = () => {
  const now = Date.now()
  return Array.from({ length: 40 }, (_, i) => {
    const stock = MANY[i % MANY.length]
    return { postId: 5000 + i, author: `글쓴이${i}`, stockCode: stock.code, stockName: stock.name, title: `${stock.name} 이야기 ${i}`, content: '본문',
      imageUrls: [], createdAt: new Date(now - i * 60_000).toISOString(), likeCount: i % 7, commentCount: 0 }
  })
}

await j.run('B19', async () => {
  if (WS_BASE === null || WS_BASE === undefined) { j.report('B19', null, '웹소켓 빌드 없음 — --ws <BASE2>를 주면 종목 30개 카드 줄을 잰다'); return }
  const posts = manyPosts()
  const openMany = async (opts) => {
    const t = await j.open(opts)
    await t.context.addInitScript(FAKE_FEED, posts)
    await t.page.goto(`${WS_BASE}/community`, { waitUntil: 'domcontentloaded' })
    await sleep(1200)
    await t.page.getByRole('button', { name: /^새 글 \d+개 보기$/ }).click()
    await sleep(400)
    return t
  }
  const strip = (page) => page.evaluate((sel) => {
    const list = document.querySelector(`${sel} ul`)
    const cards = [...list.querySelectorAll('li button')]
    const last = cards.at(-1).getBoundingClientRect()
    const box = list.getBoundingClientRect()
    return { cards: cards.length, rows: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size, left: Math.round(list.scrollLeft), max: list.scrollWidth - list.clientWidth,
      lastLeft: Math.round(last.left), lastRight: Math.round(last.right), boxLeft: Math.round(box.left), boxRight: Math.round(box.right), pageX: scrollX, pageY: Math.round(scrollY),
      over: document.documentElement.scrollWidth - innerWidth, overscroll: getComputedStyle(list).overscrollBehaviorX,
      next: document.querySelectorAll(`${sel} > button`).length }
  }, STRIP)

  // 휴대폰: 손가락으로 민다(개발 도구 규약의 터치 스크롤 몸짓)
  const t = await openMany({ width: 375, height: 812, touch: true })
  const cdp = await t.context.newCDPSession(t.page)
  const listBox = await t.page.locator(`${STRIP} ul`).boundingBox()
  const swipe = (dx, dy = 0) => cdp.send('Input.synthesizeScrollGesture', { x: Math.round(listBox.x + listBox.width / 2), y: Math.round(listBox.y + listBox.height / 2), xDistance: dx, yDistance: dy, gestureSourceType: 'touch', speed: 1600 })
  const start = await strip(t.page)
  await swipe(-240)
  await sleep(500)
  const once = await strip(t.page)
  for (let i = 0; i < 25 && (await strip(t.page)).left < start.max - 1; i++) { await swipe(-320); await sleep(250) }
  await sleep(400)
  const end = await strip(t.page)
  await swipe(-200) // 끝에서 더 민다 — 주소가 그대로여야 한다(뒤로 가기로 번지지 않음)
  await sleep(600)
  const pathAfter = new URL(t.page.url()).pathname
  j.report('B19a', start.cards === MANY.length + 1 && start.rows === 1 && start.over <= 0 && start.max > 1000 && once.left > 100 && once.pageX === 0 && once.pageY === start.pageY
    && Math.abs(end.left - end.max) <= 1 && end.lastRight <= 375 && end.lastLeft >= 0 && pathAfter === '/community' && end.overscroll === 'contain',
    `카드 ${start.cards}장 ${start.rows}줄, 페이지 넘침 ${start.over}px, 줄 길이 ${start.max}px 더 — 한 번 밀면 ${once.left}px(페이지 x ${once.pageX}·y ${start.pageY}→${once.pageY}), 끝까지 ${end.left}/${end.max}px 마지막 카드 ${end.lastLeft}~${end.lastRight}px, 끝에서 더 밀어도 ${pathAfter}, 넘침 번짐 막음 ${end.overscroll}`)
  // 줄 위에서 위아래로 밀면 페이지가 내려간다(줄이 세로 몸짓을 붙잡지 않는다)
  await swipe(0, -300)
  await sleep(600)
  const vertical = await strip(t.page)
  await t.page.evaluate(() => window.scrollTo(0, 0))
  await sleep(300)
  // 끝 카드(화면 안)를 누른다 — 그 종목 글만, 줄은 제자리
  const lastBox = await t.page.locator(`${STRIP} li button`).last().boundingBox()
  await t.page.touchscreen.tap(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2)
  await sleep(600)
  const picked = await strip(t.page)
  const lastStock = MANY.at(-1)
  const titles = await postTitles(t.page, FEED)
  const pressed = await t.page.locator(`${STRIP} li button`).last().getAttribute('aria-pressed')
  j.report('B19b', vertical.pageY > end.pageY + 100 && vertical.left === end.left && pressed === 'true' && titles.length > 0 && titles.every((title) => title.startsWith(lastStock.name))
    && Math.abs(picked.left - end.left) <= 1,
    `줄 위 세로로 밀면 페이지 ${end.pageY}→${vertical.pageY}px(줄은 ${vertical.left}px 그대로), 끝 카드 ${lastStock.name} 누름 ${pressed} → 글 ${titles.length}개 모두 그 종목, 줄 ${end.left}→${picked.left}px`)
  await t.close()

  // 마우스: 뒤 단추를 사라질 때까지 누른다
  const m = await openMany({ width: 1440, height: 900 })
  let clicks = 0
  while (clicks < 20 && (await m.page.locator(`${STRIP} > button`).count()) > 0) {
    const buttons = m.page.locator(`${STRIP} > button`)
    const nextButton = buttons.last()
    const box = await nextButton.boundingBox()
    const stripBox = await m.page.locator(STRIP).boundingBox()
    if (box.x < stripBox.x + stripBox.width / 2) break // 남은 것이 앞 단추뿐
    await nextButton.click()
    clicks += 1
    await sleep(500)
  }
  const mouseEnd = await strip(m.page)
  // 키보드: 첫 카드에서 Tab으로 끝 카드까지
  await m.page.evaluate(() => window.scrollTo(0, 0))
  await m.page.locator(`${STRIP} li button`).first().focus()
  await m.page.locator(`${STRIP} ul`).evaluate((el) => { el.scrollLeft = 0 })
  await sleep(200)
  for (let i = 0; i < MANY.length; i++) await m.page.keyboard.press('Tab')
  await sleep(500)
  const focus = await m.page.evaluate((sel) => {
    const cards = [...document.querySelectorAll(`${sel} li button`)]
    const box = document.querySelector(`${sel} ul`).getBoundingClientRect()
    const r = document.activeElement.getBoundingClientRect()
    return { index: cards.indexOf(document.activeElement), inside: r.left >= box.left - 1 && r.right <= box.right + 1 }
  }, STRIP)
  j.report('B19c', clicks >= 2 && Math.abs(mouseEnd.left - mouseEnd.max) <= 1 && mouseEnd.lastRight <= mouseEnd.boxRight + 1 && focus.index === MANY.length && focus.inside,
    `마우스 뒤 단추 ${clicks}번 → ${mouseEnd.left}/${mouseEnd.max}px, 마지막 카드 오른쪽 ${mouseEnd.lastRight} ≤ 줄 ${mouseEnd.boxRight}, 키보드 Tab ${MANY.length}번 → ${focus.index}번째 카드 포커스·줄 안 ${focus.inside}`)
  await m.close()
})

// B17 휴대폰(375 손가락, 2026-11-04 사용자 "모바일 버전에서도 대응되는지 확인하고… 유려하게"): 세 화면 넘침 없음,
// 떠 있는 글쓰기가 지수 띠를 덮지 않음, 반쯤 보이는 카드를 누르면 줄이 밀려 다 보임, 누르는 동안 글 줄·종목 줄이 화면 끝까지 옅게 물들고 동그라미는 흰색,
// 글 상세 종목 줄은 › 자리를 눌러도 종목 상세, 글쓰기의 취소·올리기는 첫 화면에서도 지수 띠 바로 위에 보인다
await j.run('B17', async () => {
  const t = await j.open({ width: 375, height: 812, touch: true })
  const band = () => t.page.evaluate(() => Math.round(document.querySelector('aside[aria-label="국내 지수"]')?.getBoundingClientRect().top ?? -1))
  const over = () => t.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await t.goto('/community', 1500)
  const listOver = await over()
  const write = await t.page.getByRole('link', { name: '글쓰기' }).boundingBox()
  const bandTop = await band()
  // 화면 끝에 걸친 카드(오른쪽이 화면 밖)의 보이는 자리를 손가락으로 누른다 — locator.tap()은 누르기 전에 스스로 카드를 화면 안으로 밀어 잴 수 없다
  const half = await t.page.$$eval(`${STRIP} li button`, (buttons) => buttons.findIndex((b) => b.getBoundingClientRect().right > innerWidth))
  const halfBox = await t.page.locator(`${STRIP} li button`).nth(half).boundingBox()
  await t.page.touchscreen.tap(halfBox.x + 24, halfBox.y + halfBox.height / 2)
  await sleep(700)
  const shown = await t.page.locator(`${STRIP} li button`).nth(half).boundingBox()
  j.report('B17a', listOver === 0 && bandTop > 0 && write.y + write.height <= bandTop - 8 && half > 0 && shown.x >= 0 && shown.x + shown.width <= 375,
    `목록 넘침 ${listOver}px, 글쓰기 아래 끝 ${Math.round(write.y + write.height)} · 지수 띠 ${bandTop}, 화면 끝 카드(${half}번째) 누름 → ${Math.round(shown.x)}~${Math.round(shown.x + shown.width)}px`)

  // 누르는 동안(헤드리스 크롬은 손가락 누름에 :active를 걸지 않아 개발 도구 규약으로 건다)
  const cdp = await t.context.newCDPSession(t.page)
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const pressed = async (linkSel, rowSel, badgeSel) => {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: linkSel })
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] })
    await sleep(100)
    const got = await t.page.evaluate(([rowSel, badgeSel]) => {
      const row = document.querySelector(rowSel)
      const probe = (token) => { const el = document.createElement('span'); el.style.color = `var(${token})`; document.body.append(el); const c = getComputedStyle(el).color; el.remove(); return c }
      return { bg: getComputedStyle(row).backgroundColor, shadow: getComputedStyle(row).boxShadow, badge: getComputedStyle(row.querySelector(badgeSel)).backgroundColor, sub: probe('--color-bg-sub'), white: probe('--color-surface') }
    }, [rowSel, badgeSel])
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
    return got.bg === got.sub && /-16px 0px 0px/.test(got.shadow) && /16px 0px 0px/.test(got.shadow) && got.badge === got.white
  }
  const rowPressed = await pressed(`${FEED} ol > li:first-child h3 a`, `${FEED} ol > li:first-child`, 'span[aria-hidden="true"]')

  await t.goto(`/community/${LATEST.find((post) => post.stock).id}`, 1500)
  const detailOver = await over()
  const stockPressed = await pressed('main article a[href^="/stocks/"]', 'main article > div:first-child', 'span[aria-hidden="true"]')
  await cdp.detach()
  // 종목 줄 오른쪽 끝(› 자리)을 누른다 — 이름 글자가 아닌 곳
  const stockRow = await t.page.locator('main article > div:first-child').boundingBox()
  await t.page.touchscreen.tap(stockRow.x + stockRow.width - 12, stockRow.y + stockRow.height / 2)
  await sleep(1200)
  const stockPath = new URL(t.page.url()).pathname
  j.report('B17b', rowPressed && stockPressed && detailOver === 0 && stockPath === `/stocks/${LATEST.find((post) => post.stock).stock.code}`,
    `누르는 동안 글 줄 물듦 ${rowPressed}·종목 줄 물듦 ${stockPressed}(화면 끝까지, 동그라미 흰색), 글 상세 넘침 ${detailOver}px, › 자리 누름 → ${stockPath}`)

  await t.goto('/community/write', 1200)
  const writeOver = await over()
  const actions = await t.page.getByRole('link', { name: '취소' }).evaluate((el) => { const box = el.parentElement.getBoundingClientRect(); return { top: Math.round(box.top), bottom: Math.round(box.bottom) } })
  const writeBand = await band()
  j.report('B17c', writeOver === 0 && actions.top > 0 && actions.bottom <= writeBand + 1 && writeBand - actions.bottom <= 1,
    `글쓰기 넘침 ${writeOver}px, 첫 화면 취소·올리기 줄 ${actions.top}~${actions.bottom}px · 지수 띠 ${writeBand}px(바로 위에 붙음)`)
  await t.close()
})

await j.finish()
