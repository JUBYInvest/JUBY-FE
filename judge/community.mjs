// 커뮤니티(백엔드 /api/community/** — 가짜 서버 mock.mjs communityRoute)와 홈 전체 채팅(목업) 판정.
// node community.mjs <BASE> [--only B,C]
//
// 기대값(판정 전에 적는다). 가짜 저장소: 글 25개(25번이 최신), 종목 넷(삼성전자·SK하이닉스·삼성바이오로직스·한화에어로스페이스 각 5) + 종목 없는 글 5,
// 3번 글과 1번 글의 첫 댓글이 내 것(닉네임 '느긋한거북'), 1번 글 댓글 22개
//  B1 머리글 메뉴: 홈 · 관심종목 · 주식 백테스트 · AI 주가분석 · 커뮤니티 · 사용설명서("예시" 없음)
//  B2 목록(로그인 1440): 카드 "전체 글 25" + 종목 넷(글 5·등락률), 카드 아래 "10월 29일 10:57 기준 등락률이에요", 글 20개(25 → 6), 요청은 카드 + 최신 한 쪽
//  B3 "글 더 보기" → cursor=6으로 다음 쪽, 글 25개, 단추가 사라진다
//  B4 인기: popular 요청, 좋아요 많은 순, 오른쪽 글 "이번 주 좋아요 순"
//  B5 종목 카드: stockCode=005930 요청, 글이 모두 삼성전자, 구역 이름 "삼성전자 이야기". 인기 + 종목이면 popular?stockCode=
//  B6 비로그인: 목록은 그대로 보이고(토큰 없이 요청), 글쓰기를 누르면 로그인 안내 창
//  B7 닉네임 없음: 글쓰기 → 닉네임 창. 형식 틀림("a!")은 요청 없이 안내, 쓰는 닉네임은 "이미 사용 중인 닉네임이에요", 맞으면 PATCH 뒤 /community/write
//  B8 글쓰기(삼성전자 카드를 고른 채): 종목 "삼성전자" → 제목·내용 → 올리기 = POST {stockCode, title, content} → /community/26, 목록 맨 위
//  B8b 그 글쓰기 종목 줄은 종목 이름뿐이다 — "이야기"·"빼기" 없음(2026-11-06 사용자)
//  B9 종목 없이 쓰면 본문에 stockCode 칸이 없다
//  B22 글쓰기(1440): 글 칸(680px)이 본문 폭 가운데 — 왼쪽·오른쪽 빈 곳이 같다(2026-11-07 사용자)
//  B23 "종목 고르기" → 치기 전에 후보가 뜬다: 머리 "시가총액 순"(기록 지우기 없음), 삼성전자 · SK하이닉스 · 삼성전자우 순, 목록 안에서 굴러가고 화면 밖으로 나가지 않는다,
//      방향키로 내려가면 고른 후보가 목록 안에 보인다, Esc로 닫은 뒤 입력칸을 누르면 다시 뜬다(2026-11-07 사용자)
//  B24 올리기 실패 안내(390x640, 가짜 서버에 없는 종목 삼성전자우 → "없는 종목이에요")는 단추 줄처럼 화면 아래에 붙지 않고, 단추 줄과 겹치지 않는다
//  B10 글 상세(목록에서 누름): 종목 줄 + 목록에서 실어 온 등락률, 본문, 좋아요 누르면 POST likes·수 +1·눌림, 다시 누르면 되돌림
//  B11 내 글(3번)만 수정·삭제. 수정 → /community/3/edit 칸 채움(종목은 바꿀 수 없음) → PATCH → 상세에 새 제목·"수정됨". 삭제 → 확인 창 → DELETE → /community
//  B12 댓글(로그인): 20개 → "댓글 더 보기" cursor=20 → 22개, 댓글 쓰기 → POST → 맨 아래에 서고 머리 "댓글 23"
//  B13 내 댓글만 수정·삭제(첫 댓글) — 수정 → PATCH·"수정됨", 삭제 → DELETE → 줄이 빠지고 "댓글 22". 남의 댓글 좋아요 → POST likes
//  B14 비로그인 글 상세: 댓글 요청 0건, "로그인하고 댓글 보기" → /login?next=%2Fcommunity%2F1
//  B15 없는 글(/community/999): "삭제된 게시물이에요" + 목록 링크
//  B16 목록 실패(500): "글을 불러오지 못했어요" + 다시 시도
//  B16b 그 실패가 서버 오류(5xx)면 "커뮤니티 서버에 문제가 생겨"라고 알린다 — 내 연결 탓으로 읽히지 않게
//  B20 커뮤니티 GET이 모두 500(쓰기는 됨 — 2026-11-06 운영): 글쓰기 → 올리기 → /community/26에 올린 글(제목·본문·종목 삼성전자·수정 단추)이 보이고 실패 글이 없다
//  B21 같은 서버에서 주소로 연 글(/community/1): "커뮤니티 서버에 문제가 생겨 글을 불러오지 못했어요" + 다시 시도
//  B17 390·320: 목록·상세·글쓰기 가로 넘침 없음, 카드 줄은 한 줄로 옆으로 민다
//  C1 홈 채팅(1440 로그인): 제목 "채팅" + "예시", 예시 말 9개, 대화창이 맨 아래(최신 말)에 있다, 안내 한 줄
//  C2 말 보내기: 입력 → 보내기 → 오른쪽 "내 말" 줄, 입력칸 비움, 요청은 보내는 이름을 위한 회원 정보뿐(채팅은 목업)
//  C3 비로그인: 입력칸 대신 로그인 링크(/login — 홈은 돌아올 자리를 적지 않는다)
//  C4 390: 시세표 → 처음 시작하기 → 채팅 순, 가로 넘침 없음
//  C5 1280(좁은 오른쪽 열): 이름 있는 말마다 시각이 이름 줄(말풍선 위), 가장 넓은 말풍선이 열 폭의 90% 넘게 쓴다, 대화창 위아래가 흐려진다(mask)
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const j = await judge(cli())
const FEED = 'section[aria-labelledby="community-feed-title"]'
const STRIP = 'nav[aria-label="종목으로 보기"]'
const CHAT = 'section[aria-labelledby="home-chat-title"]'
const titles = (page) => page.$$eval(`${FEED} ol > li h3`, (hs) => hs.map((h) => h.textContent.trim()))
const community = (t) => t.api().filter((l) => /\/api\/community|nickname/.test(l))

await j.run('B', async () => {
  let t = await j.open()
  await t.goto('/community', 1800)
  const menu = await t.page.$$eval('nav[aria-label="서비스"] a', (as) => as.map((a) => a.textContent.trim()))
  j.report('B1', menu.join('|') === '홈|관심종목|주식 백테스트|AI 주가분석|커뮤니티|사용설명서', menu.join(' · '))

  const cards = await t.page.$$eval(`${STRIP} li button`, (bs) => bs.map((b) => b.innerText.replace(/\s+/g, ' ').trim()))
  const asOf = await t.page.locator(FEED).getByText(/기준 등락률이에요$/).innerText().catch(() => '')
  let list = await titles(t.page)
  j.report('B2', /전체 글 25/.test(cards[0]) && cards.length === 5 && cards.slice(1).every((c) => /글 5/.test(c)) && /\+1\.20%/.test(cards.join()) &&
    asOf === '10월 29일 10:57 기준 등락률이에요' && list.length === 20 && list[0] === '커뮤니티 글 25' && list[19] === '커뮤니티 글 6' &&
    community(t).join('|') === 'GET /api/community/stocks|GET /api/community/posts?size=20', `카드 ${JSON.stringify(cards)}, "${asOf}", 글 ${list.length}개(${list[0]}…${list[19]}), 요청 ${community(t).join(' · ')}`)

  await t.page.getByRole('button', { name: '글 더 보기' }).click(); await sleep(600)
  list = await titles(t.page)
  j.report('B3', list.length === 25 && community(t).includes('GET /api/community/posts?size=20&cursor=6') && (await t.page.getByRole('button', { name: '글 더 보기' }).count()) === 0,
    `글 ${list.length}개, 요청 ${community(t).at(-1)}`)

  await t.page.getByRole('button', { name: /인기/ }).click(); await sleep(700)
  const popular = await titles(t.page)
  const likes = await t.page.$$eval(`${FEED} ol > li`, (lis) => lis.map((li) => Number(li.innerText.match(/좋아요\s*(\d+)/)?.[1] ?? NaN)))
  const note = await t.page.getByText('이번 주 좋아요 순').count()
  j.report('B4', community(t).at(-1) === 'GET /api/community/posts/popular?size=20' && popular.length > 0 && likes.every((v, i) => i === 0 || likes[i - 1] >= v) && note === 1,
    `요청 ${community(t).at(-1)}, 좋아요 ${likes.join(',')}, 글 "이번 주 좋아요 순" ${note}`)

  await t.page.getByRole('button', { name: /^최신$/ }).click(); await sleep(500)
  await t.page.locator(`${STRIP} button[data-code="005930"]`).click(); await sleep(700)
  const stockPosts = await t.page.$$eval(`${FEED} ol > li`, (lis) => lis.map((li) => li.innerText))
  const area = await t.page.locator('#community-feed-title').textContent()
  await t.page.getByRole('button', { name: /인기/ }).click(); await sleep(600)
  j.report('B5', community(t).includes('GET /api/community/posts?stockCode=005930&size=20') && stockPosts.length === 5 && stockPosts.every((p) => p.includes('삼성전자')) && area === '삼성전자 이야기' &&
    community(t).at(-1) === 'GET /api/community/posts/popular?stockCode=005930&size=20', `글 ${stockPosts.length}개, 구역 "${area}", 마지막 요청 ${community(t).at(-1)}`)
  await t.close()

  t = await j.open({ loggedIn: false })
  await t.goto('/community', 1800)
  const guestList = await titles(t.page)
  await t.page.getByRole('button', { name: '글쓰기' }).click(); await sleep(300)
  const loginModal = await t.page.getByText('로그인하면 쓸 수 있는 기능이에요').count()
  j.report('B6', guestList.length === 20 && loginModal === 1 && !t.log.some((l) => /401/.test(l)), `비로그인 글 ${guestList.length}개, 글쓰기 → 로그인 안내 ${loginModal}`)
  await t.close()

  t = await j.open({ nickname: null, takenNicknames: ['반도체관심'] })
  await t.goto('/community', 1500)
  await t.page.getByRole('button', { name: '글쓰기' }).click(); await sleep(600)
  const dialog = t.page.getByRole('dialog', { name: '닉네임 정하기' })
  const opened = await dialog.count()
  const box = t.page.getByRole('textbox', { name: '닉네임' })
  await box.fill('a!'); await t.page.getByRole('button', { name: '저장하고 계속하기' }).click(); await sleep(300)
  const formatError = await dialog.getByRole('alert').innerText().catch(() => '')
  const checks0 = t.log.filter((l) => /nickname\/check/.test(l)).length
  await box.fill('반도체관심'); await t.page.getByRole('button', { name: '저장하고 계속하기' }).click(); await sleep(500)
  const takenError = await dialog.getByRole('alert').innerText().catch(() => '')
  await box.fill('용감한개미'); await t.page.getByRole('button', { name: '저장하고 계속하기' }).click(); await sleep(1000)
  j.report('B7', opened === 1 && /2~10자/.test(formatError) && checks0 === 0 && takenError === '이미 사용 중인 닉네임이에요.' && t.log.includes('PATCH /api/members/me/nickname') &&
    new URL(t.page.url()).pathname === '/community/write', `창 ${opened}, 형식 "${formatError}"(확인 요청 ${checks0}), 중복 "${takenError}", 주소 ${new URL(t.page.url()).pathname}`)
  await t.close()

  t = await j.open()
  await t.goto('/community', 1500)
  await t.page.locator(`${STRIP} button[data-code="005930"]`).click(); await sleep(500)
  await t.page.getByRole('button', { name: '글쓰기' }).click(); await sleep(1200)
  const chosen = await t.page.getByText('삼성전자', { exact: true }).count()
  const stockLine = (await t.page.locator('[class*="_stockChosen_"]').innerText()).trim()
  const unpick = await t.page.getByRole('button', { name: '빼기' }).count()
  await t.page.getByLabel('제목').fill('새로 쓴 글')
  await t.page.getByLabel('내용').fill('새로 쓴 글의 내용')
  const posting = t.page.waitForRequest((r) => r.url().endsWith('/api/community/posts') && r.method() === 'POST')
  await t.page.getByRole('button', { name: '올리기' }).click()
  const sent = JSON.parse((await posting).postData())
  await sleep(1200)
  const detailTitle = await t.page.locator('h1').innerText()
  await t.goto('/community', 1500)
  const first = (await titles(t.page))[0]
  j.report('B8', chosen >= 1 && sent.stockCode === '005930' && sent.title === '새로 쓴 글' && sent.content === '새로 쓴 글의 내용' && new URL(t.page.url()).pathname === '/community' && detailTitle === '새로 쓴 글' && first === '새로 쓴 글',
    `보낸 ${JSON.stringify(sent)}, 상세 제목 "${detailTitle}", 목록 첫 글 "${first}"`)
  j.report('B8b', stockLine === '삼성전자' && unpick === 0, `종목 줄 "${stockLine}", 빼기 단추 ${unpick}`)

  await t.goto('/community/write', 1500)
  await t.page.getByLabel('제목').fill('종목 없는 글')
  await t.page.getByLabel('내용').fill('내용')
  const posting2 = t.page.waitForRequest((r) => r.url().endsWith('/api/community/posts') && r.method() === 'POST')
  await t.page.getByRole('button', { name: '올리기' }).click()
  const sent2 = JSON.parse((await posting2).postData())
  j.report('B9', !('stockCode' in sent2) && sent2.title === '종목 없는 글', `보낸 ${JSON.stringify(sent2)}`)
  await t.close()

  t = await j.open()
  await t.goto('/community/write', 1500)
  const column = await t.page.evaluate(() => {
    const main = document.querySelector('main')
    const style = getComputedStyle(main)
    const box = main.getBoundingClientRect()
    const page = main.querySelector('h1').parentElement.getBoundingClientRect()
    return { width: Math.round(page.width), left: Math.round(page.left - box.left - parseFloat(style.paddingLeft)), right: Math.round(box.right - parseFloat(style.paddingRight) - page.right) }
  })
  j.report('B22', column.width === 680 && column.left > 0 && Math.abs(column.left - column.right) <= 1, `글 칸 폭 ${column.width}, 왼쪽 ${column.left} · 오른쪽 ${column.right}`)

  await t.page.getByRole('button', { name: '종목 고르기' }).click(); await sleep(400)
  const listbox = t.page.getByRole('listbox')
  const browseHead = await t.page.getByText('시가총액 순', { exact: true }).count()
  const browseClear = await t.page.getByRole('button', { name: '기록 지우기' }).count()
  const browseNames = await t.page.$$eval('[role="listbox"] [role="option"] [class*="_optionName_"]', (spans) => spans.map((s) => s.textContent.trim()))
  const browseBox = await t.page.evaluate(() => { const ul = document.querySelector('[role="listbox"]'); return ul === null ? null : { scrolls: ul.scrollHeight > ul.clientHeight, bottom: ul.getBoundingClientRect().bottom <= innerHeight } })
  const combo = t.page.getByRole('combobox')
  for (let i = 0; i < 12; i++) await combo.press('ArrowDown')
  await sleep(200)
  const activeSeen = await t.page.evaluate(() => {
    const ul = document.querySelector('[role="listbox"]'); const active = ul?.querySelector('[aria-selected="true"]')
    if (!ul || !active) return false
    const a = active.getBoundingClientRect(), u = ul.getBoundingClientRect()
    return a.top >= u.top - 1 && a.bottom <= u.bottom + 1
  })
  await combo.press('Escape'); await sleep(150)
  const closed = await listbox.count()
  // 지금 코드에서 후보가 없으면 Esc가 검색칸을 닫는다 — 멈추지 않고 0으로 적는다
  await combo.click({ timeout: 2000 }).catch(() => {}); await sleep(250)
  const reopened = await listbox.count()
  j.report('B23', browseHead === 1 && browseClear === 0 && browseNames.slice(0, 3).join('|') === '삼성전자|SK하이닉스|삼성전자우' && browseNames.length > 50 &&
    browseBox?.scrolls === true && browseBox?.bottom === true && activeSeen && closed === 0 && reopened === 1,
    `머리 ${browseHead}, 기록 지우기 ${browseClear}, 후보 ${browseNames.length}개(${browseNames.slice(0, 3).join(' · ')}), 목록 ${JSON.stringify(browseBox)}, 방향키 후보 보임 ${activeSeen}, Esc 뒤 ${closed} → 누르면 ${reopened}`)
  await t.close()

  t = await j.open({ width: 390, height: 640 })
  await t.goto('/community/write', 1500)
  await t.page.getByRole('button', { name: '종목 고르기' }).click()
  await t.page.getByRole('combobox').fill('삼성전자우'); await sleep(300)
  await t.page.getByRole('option', { name: /삼성전자우/ }).first().click(); await sleep(200)
  await t.page.getByLabel('제목').fill('없는 종목 글')
  await t.page.getByLabel('내용').fill('없는 종목 글의 내용')
  await t.page.getByRole('button', { name: '올리기' }).click(); await sleep(1000)
  const failure = await t.page.evaluate(() => {
    const error = document.querySelector('[role="alert"]'); const actions = document.querySelector('[class*="_actions_"]')
    if (!error || !actions) return null
    const e = error.getBoundingClientRect(), a = actions.getBoundingClientRect()
    return { text: error.textContent.trim(), position: getComputedStyle(error).position, overlap: e.bottom > a.top + 1 && e.top < a.bottom - 1 }
  })
  j.report('B24', failure?.text === '없는 종목이에요. 종목을 다시 골라 주세요.' && failure.position !== 'sticky' && failure.overlap === false, JSON.stringify(failure))
  await t.close()

  t = await j.open()
  await t.goto('/community', 1500)
  await t.page.getByRole('link', { name: '커뮤니티 글 24' }).click(); await sleep(1200)
  const head = await t.page.locator('main').innerText()
  const like = t.page.getByRole('button', { name: /좋아요/ })
  const before = await like.innerText()
  await like.click(); await sleep(400)
  const after = await like.innerText(), pressed = await like.getAttribute('aria-pressed')
  await like.click(); await sleep(400)
  const back = await like.innerText()
  j.report('B10', /삼성전자 \+1\.20%/.test(head.replace(/\s+/g, ' ')) && /커뮤니티 글 24의 본문입니다/.test(head) && before === '좋아요 3' && after === '좋아요 4' && pressed === 'true' && back === '좋아요 3' &&
    t.count(/^POST \/api\/community\/posts\/24\/likes$/) === 2, `종목 줄·등락률·본문, 좋아요 ${before} → ${after}(${pressed}) → ${back}`)

  await t.goto('/community/4', 1200)
  const others = await t.page.getByRole('button', { name: '삭제' }).count()
  await t.goto('/community/3', 1200)
  await t.page.getByRole('link', { name: '수정', exact: true }).click(); await sleep(1200)
  const filled = await t.page.getByLabel('제목').inputValue()
  const lockedStock = await t.page.getByText('종목은 바꿀 수 없어요').count()
  await t.page.getByLabel('제목').fill('고친 제목')
  await t.page.getByRole('button', { name: '고치기' }).click(); await sleep(1200)
  const edited = (await t.page.locator('main').innerText()).replace(/\s+/g, ' ')
  await t.page.getByRole('button', { name: '삭제', exact: true }).click(); await sleep(300)
  await t.page.getByRole('dialog').getByRole('button', { name: '지우기' }).click(); await sleep(1200)
  j.report('B11', others === 0 && filled === '커뮤니티 글 3' && lockedStock === 1 && t.log.includes('PATCH /api/community/posts/3') && /고친 제목/.test(edited) && /수정됨/.test(edited) &&
    t.log.includes('DELETE /api/community/posts/3') && new URL(t.page.url()).pathname === '/community', `남의 글 삭제 단추 ${others}, 채움 "${filled}", 상세 "${edited.slice(0, 60)}", 지운 뒤 ${new URL(t.page.url()).pathname}`)
  await t.close()

  t = await j.open()
  await t.goto('/community/1', 1800)
  const comments = () => t.page.$$eval('section[aria-labelledby="community-comments-title"] ol > li', (lis) => lis.length)
  const n0 = await comments()
  await t.page.getByRole('button', { name: '댓글 더 보기' }).click(); await sleep(600)
  const n1 = await comments()
  await t.page.getByLabel('댓글', { exact: true }).fill('새 댓글입니다')
  await t.page.getByRole('button', { name: '올리기' }).click(); await sleep(1200)
  const last = await t.page.$$eval('section[aria-labelledby="community-comments-title"] ol > li', (lis) => lis.at(-1)?.innerText ?? '')
  const heading = await t.page.locator('#community-comments-title').innerText()
  j.report('B12', n0 === 20 && n1 === 22 && t.log.includes('GET /api/community/posts/1/comments?cursor=20&size=20') && /새 댓글입니다/.test(last) && heading === '댓글 23',
    `처음 ${n0} → 더 보기 ${n1}, 마지막 "${last.slice(0, 30)}", 머리 "${heading}"`)

  const mine = t.page.locator('section[aria-labelledby="community-comments-title"] ol > li').first()
  const editButtons = await t.page.locator('section[aria-labelledby="community-comments-title"]').getByRole('button', { name: '수정' }).count()
  await mine.getByRole('button', { name: '수정' }).click()
  await mine.getByRole('textbox').fill('고친 댓글')
  await mine.getByRole('button', { name: '저장' }).click(); await sleep(600)
  const editedComment = await mine.innerText()
  await t.page.locator('section[aria-labelledby="community-comments-title"] ol > li').nth(1).getByRole('button', { name: /좋아요/ }).click(); await sleep(400)
  t.page.once('dialog', (d) => void d.accept())
  await mine.getByRole('button', { name: '삭제' }).click(); await sleep(1200)
  const heading2 = await t.page.locator('#community-comments-title').innerText()
  j.report('B13', editButtons === 2 && /고친 댓글/.test(editedComment) && /수정됨/.test(editedComment) && t.log.includes('PATCH /api/community/comments/1') &&
    t.log.includes('POST /api/community/comments/2/likes') && t.log.includes('DELETE /api/community/comments/1') && heading2 === '댓글 22',
    `수정 단추 ${editButtons}(내 댓글 둘), 고친 줄 "${editedComment.replace(/\s+/g, ' ').slice(0, 40)}", 지운 뒤 "${heading2}"`)
  await t.close()

  t = await j.open({ loggedIn: false })
  await t.goto('/community/1', 1500)
  const loginLink = await t.page.getByRole('link', { name: '로그인하고 댓글 보기' }).getAttribute('href')
  j.report('B14', loginLink === '/login?next=%2Fcommunity%2F1' && t.count(/comments/) === 0, `로그인 링크 ${loginLink}, 댓글 요청 ${t.count(/comments/)}건`)
  await t.goto('/community/999', 1200)
  const missing = await t.page.locator('h1').innerText()
  const toList = await t.page.getByRole('link', { name: '커뮤니티 글 목록으로' }).count()
  j.report('B15', missing === '삭제된 게시물이에요' && toList === 1, `제목 "${missing}", 목록 링크 ${toList}`)
  await t.close()

  t = await j.open({ communityStatus: 500 })
  await t.goto('/community', 1500)
  const failed = await t.page.getByText('글을 불러오지 못했어요.').count()
  const retry = await t.page.locator(FEED).getByRole('button', { name: '다시 시도' }).count()
  j.report('B16', failed === 1 && retry === 1, `실패 글 ${failed}, 다시 시도 ${retry}`)
  const serverFault = await t.page.getByText('커뮤니티 서버에 문제가 생겨 글을 불러오지 못했어요.').count()
  j.report('B16b', serverFault === 1, `서버 탓 안내 ${serverFault}`)
  await t.close()

  t = await j.open({ communityReadStatus: 500 })
  await t.goto('/community/write', 1500)
  await t.page.getByRole('button', { name: '종목 고르기' }).click()
  await t.page.getByRole('combobox').fill('삼성전자'); await sleep(300)
  await t.page.getByRole('option', { name: /삼성전자/ }).first().click(); await sleep(200)
  await t.page.getByLabel('제목').fill('운영에서 쓴 글')
  await t.page.getByLabel('내용').fill('운영에서 쓴 글의 내용')
  await t.page.getByRole('button', { name: '올리기' }).click(); await sleep(1500)
  const savedPath = new URL(t.page.url()).pathname
  const savedTitle = await t.page.locator('h1').innerText()
  const savedBody = await t.page.getByText('운영에서 쓴 글의 내용', { exact: true }).count()
  const savedStock = await t.page.getByRole('link', { name: '삼성전자', exact: true }).count()
  const savedEdit = await t.page.getByRole('link', { name: '수정' }).count()
  const savedFailed = await t.page.getByText(/^(커뮤니티 서버에 문제가 생겨 )?글을 불러오지 못했어요\.$/).count()
  j.report('B20', savedPath === '/community/26' && savedTitle === '운영에서 쓴 글' && savedBody === 1 && savedStock === 1 && savedEdit === 1 && savedFailed === 0,
    `주소 ${savedPath}, 제목 "${savedTitle}", 본문 ${savedBody}, 종목 ${savedStock}, 수정 ${savedEdit}, 실패 글 ${savedFailed}`)
  await t.goto('/community/1', 1500)
  const directFailed = await t.page.getByText('커뮤니티 서버에 문제가 생겨 글을 불러오지 못했어요.').count()
  const directRetry = await t.page.getByRole('button', { name: '다시 시도' }).count()
  j.report('B21', directFailed === 1 && directRetry === 1, `서버 탓 안내 ${directFailed}, 다시 시도 ${directRetry}`)
  await t.close()

  const narrow = []
  for (const width of [390, 320]) {
    for (const path of ['/community', '/community/1', '/community/write']) {
      t = await j.open({ width, height: 800 })
      await t.goto(path, 1500)
      if (!(await noOverflow(t.page))) narrow.push(`${width}${path}`)
      if (path === '/community') {
        const strip = await t.page.evaluate((sel) => { const ul = document.querySelector(`${sel} ul`); const tops = [...ul.children].map((li) => Math.round(li.getBoundingClientRect().top)); return { rows: new Set(tops).size, wider: ul.scrollWidth > ul.clientWidth } }, STRIP)
        if (strip.rows !== 1 || !strip.wider) narrow.push(`${width} 카드 줄 ${JSON.stringify(strip)}`)
      }
      await t.close()
    }
  }
  j.report('B17', narrow.length === 0, narrow.length === 0 ? '390·320 세 화면 넘침 없음, 카드 줄 한 줄' : narrow.join(', '))
})

await j.run('C', async () => {
  let t = await j.open()
  await t.goto('/', 2000)
  const chat = t.page.locator(CHAT)
  const c1 = await t.page.evaluate((sel) => {
    const section = document.querySelector(sel)
    const log = section.querySelector('[role="log"]')
    return { title: section.querySelector('h2')?.textContent, tag: [...section.querySelectorAll('span')].some((s) => s.textContent === '예시'), messages: log.querySelectorAll('li').length,
      atBottom: Math.abs(log.scrollHeight - log.scrollTop - log.clientHeight) < 2, notice: /지금 대화는 예시예요/.test(section.textContent) }
  }, CHAT)
  j.report('C1', c1.title === '채팅' && c1.tag && c1.messages === 9 && c1.atBottom && c1.notice, JSON.stringify(c1))

  const before = t.api().length
  await chat.getByLabel('채팅에 보낼 말').fill('안녕하세요')
  await chat.getByRole('button', { name: '보내기' }).click(); await sleep(300)
  const lastMine = await t.page.evaluate((sel) => { const li = [...document.querySelectorAll(`${sel} li`)].at(-1); return { text: li.innerText, right: getComputedStyle(li).justifyContent } }, CHAT)
  const cleared = await chat.getByLabel('채팅에 보낼 말').inputValue()
  j.report('C2', /안녕하세요/.test(lastMine.text) && lastMine.right === 'flex-end' && cleared === '' && t.api().slice(before).every((l) => l === 'GET /api/members/me'), `${JSON.stringify(lastMine)}, 입력칸 "${cleared}", 요청 ${t.api().length - before}건`)
  await t.close()

  t = await j.open({ loggedIn: false })
  await t.goto('/', 1800)
  const link = await t.page.locator(CHAT).getByRole('link', { name: '로그인' }).getAttribute('href')
  const input = await t.page.locator(CHAT).getByLabel('채팅에 보낼 말').count()
  j.report('C3', link === '/login' && input === 0, `로그인 링크 ${link}, 입력칸 ${input}`)
  await t.close()

  // C5 좁은 오른쪽 열(1280 — 320px 남짓): 시각은 이름 줄에(말풍선 옆에 두면 말풍선이 그만큼 좁아져 꺾였다), 말풍선은 열 폭을 다 쓸 수 있고,
  // 대화창 위아래는 흐려지며 사라진다(먹 선에 잘린 말이 깨진 듯 보였다)
  t = await j.open({ width: 1280, height: 800 })
  await t.goto('/', 2000)
  const c5 = await t.page.evaluate((sel) => {
    const log = document.querySelector(`${sel} [role="log"]`)
    const heads = [...log.querySelectorAll('li')].filter((li) => li.querySelector('strong'))
    const bad = heads.filter((li) => {
      const time = li.querySelector('time'), bubble = li.querySelector('p:last-child'), name = li.querySelector('strong')
      const tr = time.getBoundingClientRect(), br = bubble.getBoundingClientRect(), nr = name.getBoundingClientRect()
      return !(tr.bottom <= br.top + 1 && Math.abs(tr.bottom - nr.bottom) < 4)
    }).map((li) => li.querySelector('strong').textContent)
    const body = heads[0]?.querySelector('p:last-child')?.parentElement.getBoundingClientRect().width ?? 0
    const widest = Math.max(...heads.map((li) => li.querySelector('p:last-child').getBoundingClientRect().width))
    return { heads: heads.length, bad, body: Math.round(body), widest: Math.round(widest), mask: getComputedStyle(log).maskImage !== 'none' }
  }, CHAT)
  j.report('C5', c5.heads >= 4 && c5.bad.length === 0 && c5.widest > c5.body * 0.9 && c5.mask, JSON.stringify(c5))
  await t.close()

  t = await j.open({ width: 390, height: 844 })
  await t.goto('/', 2000)
  const order = await t.page.evaluate(() => ['#home-stocks-title', '#home-guide-title', '#home-chat-title'].map((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().top ?? -1)))
  j.report('C4', order.every((v, i) => v > 0 && (i === 0 || order[i - 1] < v)) && (await noOverflow(t.page)), `시세표 ${order[0]} · 처음 시작하기 ${order[1]} · 채팅 ${order[2]}`)
  await t.close()
})

await j.finish()
