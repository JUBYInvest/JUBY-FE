// AI 주가분석(/ai) 블랙박스 흐름 판정(2026-10-31) — 방 목록·방 열기·보내기·그만 기다리기·다시 시도·이름 바꾸기·지우기·상세·마이페이지에서 넘어오기·
// 실패(목록·방·답·성향)·다른 방으로 옮김·다른 탭 로그아웃·좁은 화면. /api는 전부 가짜(mock.mjs), 백엔드 호스트는 막는다. 운영 빌드에서 잰다.
//   node ai.mjs <BASE> [--only A1,A2,…] [--headed] [--record]
// 화면별 /api 요청 순서를 expect/ai-order.json과 견준다(O-*). 구조를 바꾸기 전에 --record로 적어 두고, 바꾼 뒤 글자까지 같아야 한다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const args = cli()
const RECORD = process.argv.includes('--record')
const ORDER_FILE = new URL('./expect/ai-order.json', import.meta.url)
const before = !RECORD && existsSync(ORDER_FILE) ? JSON.parse(readFileSync(ORDER_FILE, 'utf8')) : null
const orders = {}
const j = await judge(args)
const { open, run, report } = j

const ROOM = '삼성전자 주가 어때?'
const ASK = /^POST \/api\/open-ai\/ask/
const SESSIONS = /^GET \/api\/chat-sessions$/
const NEW_ROOM = /^POST \/api\/chat-sessions$/
const DETAIL = /^GET \/api\/chat-sessions\/\d+$/
const box = (page) => page.getByRole('textbox', { name: '질문 입력' })
const send = (page) => page.getByRole('button', { name: '보내기' })
const room = (page, title = ROOM) => page.getByRole('button', { name: title, exact: true })
const answers = (page) => page.locator('[class*="_bubbleAnswer_"]').filter({ hasText: '요약입니다.' }).count()
const answerBubble = (page) => page.locator('[class*="_bubbleAnswer_"]').filter({ hasText: '요약입니다.' }).first()
const bubbleRetry = (page) => page.locator('[class*="_bubble_"]').getByRole('button', { name: '다시 시도' })
/** 새 대화의 빈 화면(머리글 로고도 'JUBY'라 글자로 세지 않는다) */
// 말풍선 없는 첫 화면(성향 한 줄 + 문답 예시)
const watermark = (page) => page.locator('[class*="_emptyArea_"]').count()
/** 요청 순서를 적어 두거나(--record) 기록과 견준다 */
function order(key, t) {
  const now = t.api()
  orders[key] = now
  if (before === null) return
  const was = before[key]
  if (was === undefined) report(`O-${key}`, null, `기록 없음 — 지금 ${JSON.stringify(now)}`)
  else report(`O-${key}`, JSON.stringify(was) === JSON.stringify(now), JSON.stringify(was) === JSON.stringify(now) ? `요청 ${now.length}건 순서 같음` : `전 ${JSON.stringify(was)} → 후 ${JSON.stringify(now)}`)
}
const ask = async (page, text) => { await box(page).fill(text); await box(page).press('Enter') }

/* ── A1 비로그인 ───────────────────────────────────────────────────── */
await run('A1', async () => {
  const t = await open({ loggedIn: false })
  await t.goto('/ai')
  const chips = t.page.locator('[class*="_exampleQuestion_"]')
  const n = await chips.count()
  const first = (await chips.first().innerText()).trim()
  await chips.first().click(); await sleep(100)
  const filled = (await box(t.page).inputValue()) === first
  await box(t.page).press('Enter'); await sleep(400)
  const hint = await t.page.getByText('로그인하면 질문할 수 있어요.').count()
  const side = await t.page.getByText('로그인하면 이전 대화를 저장할 수 있어요.').count()
  report('A1', n >= 3 && filled && hint === 1 && side === 1 && t.count(ASK) === 0 && t.count(SESSIONS) === 0 && t.count(/personality/) === 0,
    `예시 ${n}개, 누르면 채움 ${filled}, Enter → 로그인 안내 ${hint}, 목록 자리 안내 ${side}, 요청 ${t.api().length}건`)
  await t.close()
})

/* ── A2 목록·성향 ─────────────────────────────────────────────────── */
await run('A2', async () => {
  const t = await open()
  await t.goto('/ai', 1500)
  const listed = await room(t.page).count()
  const personality = await t.page.getByText(/^지금 투자성향은 위험중립형이에요/).count()
  const link = await t.page.getByRole('link', { name: '성향 다시 검사' }).getAttribute('href')
  // 날개 여는 단추는 넓은 화면에서 숨어 role로는 안 잡힌다 — 글자만 본다
  const count = (await t.page.locator('button[aria-controls="session-list"]').textContent()).trim()
  report('A2', listed === 1 && personality === 1 && link === '/personality-test?from=ai' && t.count(SESSIONS) === 1 && t.count(/personality/) === 1 && t.count(DETAIL) === 0 && await watermark(t.page) === 1,
    `방 ${listed}, 성향 ${personality}, 변경 링크 ${link}, 접기 단추 "${count}", 목록 ${t.count(SESSIONS)}·성향 ${t.count(/personality/)}·상세 ${t.count(DETAIL)}건`)
  order('A2', t)
  await t.close()
})

/* ── A3 방 열기·다시 누르기·새 대화 ───────────────────────────────── */
await run('A3', async () => {
  const t = await open()
  await t.goto('/ai', 1500)
  await room(t.page).click()
  await t.page.getByText('완만히 올랐어요.').waitFor({ timeout: 5000 })
  const user = await t.page.getByText(ROOM, { exact: true }).count() // 사이드바 단추 + 내 말풍선
  // 답 렌더러(마크다운)는 따로 받으므로 표는 조금 뒤에 그려진다
  await t.page.locator('[class*="_bubbleAnswer_"] td').filter({ hasText: '71,000원' }).first().waitFor({ timeout: 5000 }).catch(() => {})
  const table = await t.page.locator('[class*="_bubbleAnswer_"] td').filter({ hasText: '71,000원' }).count()
  const current = await t.page.locator('button[aria-current="true"]').innerText()
  await room(t.page).click(); await sleep(400)
  const detailCalls = t.count(DETAIL)
  await t.page.getByRole('button', { name: '+ 새 대화' }).click(); await sleep(300)
  const cleared = (await t.page.locator('[class*="_bubble_"]').count()) === 0 && (await watermark(t.page)) === 1 && (await t.page.locator('button[aria-current="true"]').count()) === 0
  report('A3', user === 2 && table === 1 && current.trim() === ROOM && detailCalls === 1 && cleared,
    `방 열면 내 말풍선+사이드바 ${user}, 답 표 ${table}, 고른 방 "${current.trim()}", 또 눌러도 상세 ${detailCalls}건, 새 대화로 비움 ${cleared}`)
  await t.close()
})

/* ── A4 새 대화에서 보내기 → 방 만들기·질문·목록 다시 받기, 같은 방에 둘째 질문 ───── */
await run('A4', async () => {
  const t = await open({ askDelay: 1200 })
  await t.goto('/ai', 1500)
  await ask(t.page, '첫 질문')
  await t.page.getByRole('button', { name: '그만 기다리기' }).waitFor({ timeout: 2000 })
  const during = { mine: await t.page.getByText('첫 질문', { exact: true }).count(), boxLocked: await box(t.page).isDisabled(), sendLocked: await send(t.page).isDisabled() }
  await answerBubble(t.page).waitFor({ timeout: 5000 }); await sleep(600)
  // 휴장일(지수 띠)·성향은 화면마다 따로 받는다 — 대화 요청의 순서만 본다
  const first = t.api().filter((l) => !/holiday|personality/.test(l))
  const a = t.log.asks[0]
  const top = (await t.page.locator('[class*="_list_"] li').first().innerText()).replace(/\s+/g, ' ')
  const current = await t.page.locator('button[aria-current="true"]').count()
  report('A4a', during.mine === 1 && during.boxLocked && during.sendLocked && JSON.stringify(first) === JSON.stringify(['GET /api/chat-sessions', 'POST /api/chat-sessions', 'POST /api/open-ai/ask', 'GET /api/chat-sessions'])
    && a?.chatSessionId === 2 && a?.stockName === null && a?.question === '첫 질문' && /첫 질문/.test(top) && current === 1,
    `보내는 중 내 말풍선 ${during.mine}·입력칸 잠김 ${during.boxLocked}·보내기 잠김 ${during.sendLocked}, 순서 ${JSON.stringify(first)}, 본문 ${JSON.stringify(a)}, 맨 위 방 "${top}", 고른 방 ${current}`)
  await ask(t.page, '둘째 질문')
  await sleep(2200)
  report('A4b', await answers(t.page) === 2 && t.count(NEW_ROOM) === 1 && t.count(ASK) === 2 && t.count(SESSIONS) === 2 && t.log.asks[1]?.chatSessionId === 2 && !(await box(t.page).isDisabled()),
    `둘째 질문 뒤 답 ${await answers(t.page)}개, 방 만들기 ${t.count(NEW_ROOM)}·질문 ${t.count(ASK)}·목록 ${t.count(SESSIONS)}건(제목이 있으면 목록을 다시 받지 않는다), 입력칸 풀림 ${!(await box(t.page).isDisabled())}`)
  order('A4', t)
  await t.close()
})

/* ── A5 그만 기다리기 → (서버가 답을 끝냄) → 다시 시도는 답을 다시 받기만 한다 ───── */
await run('A5', async () => {
  const t = await open({ askDelay: 2500 })
  await t.goto('/ai', 1500)
  await ask(t.page, '느린 질문')
  await t.page.getByRole('button', { name: '그만 기다리기' }).click({ timeout: 2000 })
  await sleep(200)
  const stopped = { text: await t.page.getByText('답을 기다리지 않았어요.').count(), retry: await bubbleRetry(t.page).count(), boxFree: !(await box(t.page).isDisabled()) }
  await sleep(3000)
  await bubbleRetry(t.page).click()
  await answerBubble(t.page).waitFor({ timeout: 4000 }); await sleep(500)
  report('A5', stopped.text === 1 && stopped.retry === 1 && stopped.boxFree && t.count(ASK) === 1 && t.count(DETAIL) === 1 && await answers(t.page) === 1 && await t.page.getByText('답을 기다리지 않았어요.').count() === 0,
    `그만 기다림 안내 ${stopped.text}·다시 시도 ${stopped.retry}·입력칸 풀림 ${stopped.boxFree}, 다시 시도 뒤 질문 ${t.count(ASK)}건(다시 보내지 않음)·상세 ${t.count(DETAIL)}건, 답 ${await answers(t.page)}개`)
  order('A5', t)
  await t.close()
})

/* ── A6 그만 기다리기 → 답이 아직 없으면 다시 보낸다(방은 다시 만들지 않는다) ───── */
await run('A6', async () => {
  const t = await open({ askDelay: 3000 })
  await t.goto('/ai', 1500)
  await ask(t.page, '느린 질문')
  await t.page.getByRole('button', { name: '그만 기다리기' }).click({ timeout: 2000 })
  await sleep(300)
  await bubbleRetry(t.page).click()
  await sleep(600)
  const waiting = await t.page.getByRole('button', { name: '그만 기다리기' }).count()
  await answerBubble(t.page).waitFor({ timeout: 6000 }); await sleep(300)
  report('A6', waiting === 1 && t.count(ASK) === 2 && t.count(NEW_ROOM) === 1 && t.count(DETAIL) === 1 && t.log.asks[1]?.chatSessionId === t.log.asks[0]?.chatSessionId && await answers(t.page) >= 1,
    `다시 시도 뒤 기다리는 중 ${waiting}, 질문 ${t.count(ASK)}건·방 만들기 ${t.count(NEW_ROOM)}건·상세 ${t.count(DETAIL)}건, 같은 방 ${t.log.asks[1]?.chatSessionId === t.log.asks[0]?.chatSessionId}`)
  await t.close()
})

/* ── A7 답 실패(500) → 다시 시도 → 같은 방에 다시 보낸다 ───────────────── */
await run('A7', async () => {
  const t = await open({ askStatus: (n) => (n === 1 ? '500' : 'ok') })
  await t.goto('/ai', 1500)
  await ask(t.page, '실패할 질문')
  await t.page.getByText('답변을 가져오지 못했어요.').waitFor({ timeout: 4000 })
  const failed = { retry: await bubbleRetry(t.page).count(), boxFree: !(await box(t.page).isDisabled()), answers: await answers(t.page) }
  await bubbleRetry(t.page).click()
  await answerBubble(t.page).waitFor({ timeout: 4000 }); await sleep(300)
  report('A7', failed.retry === 1 && failed.boxFree && failed.answers === 0 && t.count(ASK) === 2 && t.count(NEW_ROOM) === 1 && t.count(DETAIL) === 1 && await t.page.getByText('답변을 가져오지 못했어요.').count() === 0,
    `실패 안내+다시 시도 ${failed.retry}, 입력칸 풀림 ${failed.boxFree}, 다시 시도 → 상세 ${t.count(DETAIL)}·질문 ${t.count(ASK)}·방 ${t.count(NEW_ROOM)}건`)
  order('A7', t)
  await t.close()
})

/* ── A8 빈 답·409 ─────────────────────────────────────────────────── */
await run('A8', async () => {
  let t = await open({ askStatus: 'empty' })
  await t.goto('/ai', 1500)
  await ask(t.page, '빈 답')
  await t.page.getByText('답변을 가져오지 못했어요.').waitFor({ timeout: 4000 })
  const emptyBubbles = await t.page.locator('[class*="_bubbleAnswer_"]').count()
  report('A8a', emptyBubbles === 0 && await bubbleRetry(t.page).count() === 1, `빈 답 → 빈 말풍선 ${emptyBubbles}개, 실패 안내 + 다시 시도 ${await bubbleRetry(t.page).count()}`)
  await t.close()

  t = await open({ askStatus: 'CHAT409_1' })
  await t.goto('/ai', 1500)
  await ask(t.page, '바쁜 방')
  await t.page.getByText('앞 질문의 답을 아직 만들고 있어요.').waitFor({ timeout: 4000 })
  report('A8b', await bubbleRetry(t.page).count() === 1 && !(await box(t.page).isDisabled()), `409 → 안내 + 다시 시도 ${await bubbleRetry(t.page).count()}, 입력칸 풀림 ${!(await box(t.page).isDisabled())}`)
  await t.close()
})

/* ── A9 성향 없음·성향 실패 ───────────────────────────────────────── */
await run('A9', async () => {
  let t = await open({ personality: 'none', askStatus: 'MEMBER404_2' })
  await t.goto('/ai', 1500)
  const invite = await t.page.getByText('투자성향을 정하면 질문할 수 있어요. 답도 내 성향에 맞춰 나와요.').count()
  const testLink = await t.page.getByRole('link', { name: '투자성향 검사하기' }).getAttribute('href')
  await ask(t.page, '성향 없이')
  await t.page.getByText('투자성향을 먼저 정해야 답할 수 있어요.').waitFor({ timeout: 4000 })
  const noticeLink = await t.page.locator('[class*="_notice_"]').getByRole('link', { name: '투자성향 검사하기' }).getAttribute('href')
  report('A9a', invite === 1 && testLink === '/personality-test?from=ai' && noticeLink === '/personality-test?from=ai' && await bubbleRetry(t.page).count() === 0 && !(await box(t.page).isDisabled()),
    `검사 권유 ${invite}, 링크 ${testLink}, 404(MEMBER404_2) 뒤 안내 링크 ${noticeLink}, 다시 시도 없음 ${await bubbleRetry(t.page).count() === 0}`)
  await t.close()

  t = await open({ personality: 'error' })
  await t.goto('/ai', 1500)
  const failed = await t.page.getByText('성향을 불러오지 못했어요.').count()
  const noInvite = await t.page.getByRole('link', { name: '투자성향 검사하기' }).count()
  await t.page.locator('[class*="_personality_"]').getByRole('button', { name: '다시 시도' }).click(); await sleep(600)
  report('A9b', failed === 1 && noInvite === 0 && t.count(/personality/) === 2, `성향 500 → 실패 안내 ${failed}, 검사 권유 안 함 ${noInvite === 0}, 다시 시도 → 성향 요청 ${t.count(/personality/)}건`)
  await t.close()
})

/* ── A10 목록 실패·방 실패·없어진 방 ─────────────────────────────── */
await run('A10', async () => {
  let t = await open({ sessionsStatus: 500 })
  await t.goto('/ai', 1500)
  const failed = await t.page.getByText('목록을 불러오지 못했어요.').count()
  await t.page.locator('aside').getByRole('button', { name: '다시 시도' }).click(); await sleep(500)
  await ask(t.page, '목록 없이 질문')
  await answerBubble(t.page).waitFor({ timeout: 4000 })
  report('A10a', failed === 1 && t.count(SESSIONS) >= 2 && t.count(ASK) === 1, `목록 500 → 안내 ${failed}, 다시 시도 → 목록 요청 ${t.count(SESSIONS)}건, 그래도 질문은 된다(${t.count(ASK)}건)`)
  await t.close()

  t = await open({ sessionDetailStatus: 500 })
  await t.goto('/ai', 1500)
  await room(t.page).click()
  await t.page.getByText('대화를 불러오지 못했습니다.').waitFor({ timeout: 4000 })
  const locked = await send(t.page).isDisabled()
  await t.page.locator('section').getByRole('button', { name: '다시 시도' }).click(); await sleep(500)
  report('A10b', locked && t.count(DETAIL) === 2, `방 500 → 안내, 보내기 잠김 ${locked}, 다시 시도 → 상세 ${t.count(DETAIL)}건`)
  await t.close()

  t = await open({ sessionDetailStatus: 404 })
  await t.goto('/ai', 1500)
  await room(t.page).click()
  await t.page.getByText('이 대화방을 찾을 수 없어요. 새 대화에서 다시 물어봐 주세요.').waitFor({ timeout: 4000 })
  report('A10c', await room(t.page).count() === 0 && await t.page.getByText('이전 대화가 없습니다').count() === 1 && await watermark(t.page) === 1,
    `없어진 방(404) → 목록에서 뺌 ${await room(t.page).count() === 0}, "이전 대화가 없습니다" ${await t.page.getByText('이전 대화가 없습니다').count()}, 새 대화 ${await watermark(t.page)}`)
  await t.close()
})

/* ── A11 이름 바꾸기 ───────────────────────────────────────────────── */
await run('A11', async () => {
  const t = await open()
  await t.goto('/ai', 1500)
  const more = t.page.getByRole('button', { name: /대화 관리/ })
  await more.click()
  await t.page.getByRole('button', { name: '이름 바꾸기' }).click()
  const input = t.page.getByRole('textbox', { name: '대화 이름' })
  const initial = await input.inputValue()
  await input.fill('   ')
  const saveLocked = await t.page.getByRole('button', { name: '저장' }).isDisabled()
  await input.fill('  내   방 ')
  await input.press('Enter'); await sleep(600)
  const renamed = await room(t.page, '내 방').count()
  const patch = t.log.find((l) => /^PATCH/.test(l))
  const sentTitle = await t.page.evaluate(() => null) // 본문은 mock이 적용한 제목으로 본다(목록에 '내 방')
  // 같은 이름으로 다시 저장하면 보내지 않는다
  await more.click(); await t.page.getByRole('button', { name: '이름 바꾸기' }).click()
  await input.press('Enter'); await sleep(400)
  const patches = t.count(/^PATCH/)
  // Escape는 취소
  await more.click(); await t.page.getByRole('button', { name: '이름 바꾸기' }).click()
  await input.fill('버릴 이름'); await input.press('Escape'); await sleep(300)
  report('A11a', initial === ROOM && saveLocked && renamed === 1 && patch === 'PATCH /api/chat-sessions/1' && patches === 1 && t.count(SESSIONS) === 2 && await room(t.page, '내 방').count() === 1 && await input.count() === 0,
    `이름칸 초기값 "${initial}", 빈 이름 저장 잠김 ${saveLocked}, 공백 정리해 저장 → 목록 "내 방" ${renamed}·${patch}·목록 다시 받기 ${t.count(SESSIONS)}건, 같은 이름은 안 보냄(PATCH ${patches}), Escape 취소 ${await input.count() === 0}`)
  void sentTitle
  await t.close()

  const f = await open({ renameStatus: 500 })
  await f.goto('/ai', 1500)
  await f.page.getByRole('button', { name: /대화 관리/ }).click()
  await f.page.getByRole('button', { name: '이름 바꾸기' }).click()
  await f.page.getByRole('textbox', { name: '대화 이름' }).fill('새 이름')
  await f.page.getByRole('button', { name: '저장' }).click()
  await f.page.getByRole('alert').waitFor({ timeout: 4000 })
  const alert = (await f.page.getByRole('alert').innerText()).trim()
  report('A11b', /이름을 바꾸지 못했어요/.test(alert) && (await f.page.getByRole('textbox', { name: '대화 이름' }).inputValue()) === '새 이름' && await room(f.page).count() === 0,
    `500 → 안내 "${alert}", 쓴 글 남음 "${await f.page.getByRole('textbox', { name: '대화 이름' }).inputValue()}"`)
  await f.close()
})

/* ── A12 지우기 ───────────────────────────────────────────────────── */
await run('A12', async () => {
  const t = await open()
  await t.goto('/ai', 1500)
  await room(t.page).click()
  await t.page.getByText('완만히 올랐어요.').waitFor({ timeout: 5000 })
  await t.page.getByRole('button', { name: /대화 관리/ }).click()
  await t.page.getByRole('button', { name: '지우기' }).click()
  const dialog = t.page.getByRole('dialog')
  const asked = await dialog.getByText('이 대화를 지울까요?').count()
  await dialog.getByRole('button', { name: '취소' }).click(); await sleep(200)
  const kept = await room(t.page).count()
  // 취소하면 '⋯' 메뉴는 펼친 채 남는다 — 접혀 있을 때만 다시 연다
  if ((await t.page.getByRole('button', { name: '지우기' }).count()) === 0) await t.page.getByRole('button', { name: /대화 관리/ }).click()
  await t.page.getByRole('button', { name: '지우기' }).click()
  await dialog.getByRole('button', { name: '지우기' }).click(); await sleep(700)
  report('A12a', asked === 1 && kept === 1 && t.count(/^DELETE \/api\/chat-sessions\/1$/) === 1 && await room(t.page).count() === 0 && await t.page.getByText('이전 대화가 없습니다').count() === 1 && await watermark(t.page) === 1 && t.count(SESSIONS) === 2,
    `확인 상자 ${asked}, 취소하면 그대로 ${kept}, 지우기 → DELETE ${t.count(/^DELETE/)}건, 목록 비움 ${await room(t.page).count() === 0}, 보던 방이라 새 대화 ${await watermark(t.page)}, 목록 다시 받기 ${t.count(SESSIONS)}건`)
  order('A12', t)
  await t.close()

  const f = await open({ deleteStatus: 500 })
  await f.goto('/ai', 1500)
  await f.page.getByRole('button', { name: /대화 관리/ }).click()
  await f.page.getByRole('button', { name: '지우기' }).click()
  await f.page.getByRole('dialog').getByRole('button', { name: '지우기' }).click()
  await f.page.getByRole('alert').waitFor({ timeout: 4000 })
  const alert = (await f.page.getByRole('alert').innerText()).trim()
  await f.page.getByRole('dialog').getByRole('button', { name: '취소' }).click(); await sleep(200)
  report('A12b', /지우지 못했어요/.test(alert) && await room(f.page).count() === 1 && await f.page.getByRole('dialog').count() === 0, `500 → 안내 "${alert}", 방 남음 ${await room(f.page).count()}, 취소로 닫힘`)
  await f.close()
})

/* ── A13 종목 상세·마이페이지에서 넘어오기 ───────────────────────── */
await run('A13', async () => {
  let t = await open()
  await t.goto('/stocks/005930', 1500)
  await t.page.getByRole('link', { name: /AI에게 물어보기/ }).click()
  await t.page.waitForURL('**/ai', { timeout: 5000 })
  await answerBubble(t.page).waitFor({ timeout: 6000 }); await sleep(500)
  const a = t.log.asks[0]
  // 사이드바 제목도 같은 글이라 내 말풍선만 센다
  const mine = await t.page.locator('[class*="_bubbleUser_"]').filter({ hasText: '삼성전자의 주가에 대해서 간단하게 브리핑을 해줘' }).count()
  const state = await t.page.evaluate(() => window.history.state?.usr ?? null)
  await t.page.reload(); await sleep(1500)
  report('A13a', new URL(t.page.url()).pathname === '/ai' && t.count(NEW_ROOM) === 1 && t.count(ASK) === 1 && a?.stockName === '삼성전자' && mine === 1 && state === null && (await box(t.page).inputValue()) === '',
    `상세 → /ai: 방 ${t.count(NEW_ROOM)}·질문 ${t.count(ASK)}건(새로고침 뒤에도), 본문 ${JSON.stringify(a)}, 내 말풍선 ${mine}, 남은 state ${JSON.stringify(state)}`)
  order('A13', t)
  await t.close()

  t = await open()
  await t.goto('/mypage', 1500)
  await t.page.getByRole('region', { name: '최근 AI 대화' }).getByRole('link', { name: /삼성전자 주가 어때/ }).click()
  await t.page.getByText('완만히 올랐어요.').waitFor({ timeout: 6000 }); await sleep(300)
  report('A13b', new URL(t.page.url()).pathname === '/ai' && t.count(DETAIL) === 1 && (await t.page.locator('button[aria-current="true"]').innerText()).trim() === ROOM && t.count(ASK) === 0,
    `마이페이지 최근 AI 대화 → 그 방을 연다(상세 ${t.count(DETAIL)}건, 고른 방 "${(await t.page.locator('button[aria-current="true"]').innerText()).trim()}", 질문 ${t.count(ASK)}건)`)
  await t.close()
})

/* ── A14 답을 기다리다 다른 방으로 옮기면 늦게 온 답을 버린다 ────── */
await run('A14', async () => {
  const t = await open({ rooms: 2, askDelay: 2000 })
  await t.goto('/ai', 1500)
  await room(t.page).click()
  await t.page.getByText('완만히 올랐어요.').waitFor({ timeout: 5000 })
  await ask(t.page, '1번 방 질문')
  await sleep(300)
  await room(t.page, '2번째 방').click()
  await t.page.getByText('2번째 방의 답입니다.').waitFor({ timeout: 5000 })
  await sleep(2500)
  const late = await answers(t.page)
  const own = await t.page.getByText('2번째 방의 답입니다.').count()
  const pendingUi = await t.page.getByRole('button', { name: '그만 기다리기' }).count()
  report('A14', late === 0 && own === 1 && pendingUi === 0 && t.count(ASK) === 1 && !(await box(t.page).isDisabled()),
    `2번째 방에 1번 방 답 ${late}개(버림), 제 답 ${own}, 기다리는 표시 ${pendingUi}, 입력칸 풀림 ${!(await box(t.page).isDisabled())}`)
  await t.close()
})

/* ── A15 다른 탭에서 로그아웃 ─────────────────────────────────────── */
await run('A15', async () => {
  const t = await open()
  await t.goto('/ai', 1500)
  await room(t.page).click()
  await t.page.getByText('완만히 올랐어요.').waitFor({ timeout: 5000 })
  await t.page.evaluate(() => { localStorage.removeItem('accessToken'); window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: null })) })
  await sleep(500)
  const side = await t.page.getByText('로그인하면 이전 대화를 저장할 수 있어요.').count()
  const bubbles = await t.page.locator('[class*="_bubble_"]').count()
  const examples = await t.page.locator('[class*="_exampleQuestion_"]').count()
  const personality = await t.page.getByText(/투자성향은/).count()
  report('A15', side === 1 && bubbles === 0 && examples >= 3 && personality === 0, `로그아웃 뒤 목록 자리 안내 ${side}, 말풍선 ${bubbles}, 예시 ${examples}, 성향 글 ${personality}`)
  await t.close()
})

/* ── A16 좁은 화면 — 이전 대화는 왼쪽 날개(2026-11-04 사용자 "claude처럼 이전 대화를 날개 형식으로") ─ */
await run('A16', async () => {
  const t = await open({ width: 375, height: 812 })
  await t.goto('/ai', 1500)
  const toggle = t.page.getByRole('button', { name: /^이전 대화/ })
  const closed = await toggle.getAttribute('aria-expanded')
  const hiddenRoom = await room(t.page).isVisible()
  await toggle.click(); await sleep(200)
  const opened = await toggle.getAttribute('aria-expanded')
  const shownRoom = await room(t.page).isVisible()
  await room(t.page).click()
  await t.page.getByText('완만히 올랐어요.').waitFor({ timeout: 5000 })
  const collapsed = await toggle.getAttribute('aria-expanded')
  const over375 = await noOverflow(t.page)
  await t.page.setViewportSize({ width: 320, height: 640 }); await sleep(400)
  const over320 = await noOverflow(t.page)
  report('A16', closed === 'false' && !hiddenRoom && opened === 'true' && shownRoom && collapsed === 'false' && over375 && over320,
    `닫힘 ${closed}(방 보임 ${hiddenRoom}) → 열림 ${opened}(방 보임 ${shownRoom}) → 방 고르면 닫힘 ${collapsed}, 가로 넘침 없음 375 ${over375}·320 ${over320}`)
  await t.close()
})

/*
 * A16b 날개: 왼쪽 끝에서 화면 높이를 다 쓰고 머리글·지수 띠 위에 선다, 뒤는 어둡고 스크롤이 잠긴다, 열면 날개로 포커스·탭은 안에서 돈다,
 * Esc·뒤 누르기·닫기 단추·왼쪽으로 밀기로 닫히고 포커스는 연 단추로, 닫힌 날개 안은 탭으로 닿지 않는다(inert),
 * 날개 안에서 연 지우기 확인 상자가 날개 위에 서고 상자의 Esc는 상자만 닫는다
 */
await run('A16b', async () => {
  const t = await open({ width: 375, height: 812, touch: true })
  await t.goto('/ai', 1500)
  const opener = t.page.getByRole('button', { name: /^이전 대화/ })
  const drawer = () => t.page.evaluate(() => {
    const a = document.getElementById('session-list')
    const r = a.getBoundingClientRect()
    const header = document.querySelector('header')
    const band = document.querySelector('aside[aria-label="국내 지수"]')
    const topAt = (x, y) => document.elementFromPoint(x, y)?.closest('#session-list') !== null
    return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), vh: innerHeight, open: a.hasAttribute('data-open'), inert: a.inert,
      focusIn: a.contains(document.activeElement), onOpener: document.activeElement?.getAttribute('aria-controls') === 'session-list',
      lock: document.body.style.overflow, overHeader: header ? topAt(20, header.getBoundingClientRect().top + 10) : null,
      overBand: band ? topAt(20, band.getBoundingClientRect().top + 10) : null }
  })
  const closedState = await drawer()
  // 닫힌 날개 안 방 단추는 탭으로 닿지 않는다
  await opener.focus()
  const reachable = await t.page.evaluate(() => { const b = document.querySelector('#session-list button'); b?.focus(); return document.activeElement === b })
  await opener.click(); await sleep(400)
  const openState = await drawer()
  // 탭을 열 번 눌러도 날개 밖으로 나가지 않는다
  for (let i = 0; i < 10; i++) await t.page.keyboard.press('Tab')
  const trapped = await t.page.evaluate(() => document.getElementById('session-list').contains(document.activeElement))
  await t.page.keyboard.press('Escape'); await sleep(400)
  const esc = await drawer()
  report('A16b-1', closedState.x < 0 && !closedState.open && closedState.inert && !reachable
    && openState.open && openState.x === 0 && openState.h === openState.vh && openState.w >= 280 && openState.w <= 320 && openState.focusIn && openState.lock === 'hidden'
    && openState.overHeader && openState.overBand && trapped && !esc.open && esc.onOpener && esc.lock === '',
    `닫힘: 왼쪽 ${closedState.x}px·inert ${closedState.inert}·방 단추 닿음 ${reachable} → 열림: 왼쪽 ${openState.x}px·폭 ${openState.w}·높이 ${openState.h}/${openState.vh}, 머리글 위 ${openState.overHeader}·지수 띠 위 ${openState.overBand}, `
    + `포커스 날개 안 ${openState.focusIn}·스크롤 잠금 ${openState.lock}, 탭 10번 뒤 안 ${trapped} → Esc 닫힘 ${!esc.open}·포커스 연 단추 ${esc.onOpener}·잠금 풂 "${esc.lock}"`)

  // 뒤 누르기·닫기 단추·왼쪽으로 밀기
  await opener.click(); await sleep(400)
  await t.page.touchscreen.tap(360, 400); await sleep(400)
  const byBackdrop = !(await drawer()).open
  await opener.click(); await sleep(400)
  await t.page.getByRole('button', { name: '목록 닫기' }).click(); await sleep(400)
  const byClose = !(await drawer()).open
  await opener.click(); await sleep(400)
  const cdp = await t.context.newCDPSession(t.page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  await touch('touchStart', 250, 400)
  for (let i = 1; i <= 8; i++) { await touch('touchMove', 250 - i * 20, 404); await sleep(16) }
  await touch('touchEnd'); await sleep(400)
  const bySwipe = !(await drawer()).open
  // 날개 안에서 지우기 확인 상자 — 상자가 위에 서고, 상자의 Esc는 상자만 닫는다
  await opener.click(); await sleep(400)
  await t.page.getByRole('button', { name: `‘${ROOM}’ 대화 관리` }).click()
  await t.page.getByRole('button', { name: '지우기', exact: true }).click(); await sleep(300)
  const modalOnTop = await t.page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return false; const r = d.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + 10)?.closest('[role="dialog"]') !== null })
  await t.page.keyboard.press('Escape'); await sleep(300)
  const afterModalEsc = { modal: await t.page.locator('[role="dialog"]').count(), drawer: (await drawer()).open }
  await cdp.detach()
  report('A16b-2', byBackdrop && byClose && bySwipe && modalOnTop && afterModalEsc.modal === 0 && afterModalEsc.drawer,
    `뒤 누르기 닫힘 ${byBackdrop}, 닫기 단추 ${byClose}, 왼쪽으로 밀기 ${bySwipe}, 지우기 확인 상자가 날개 위 ${modalOnTop}, 상자 Esc → 상자 ${afterModalEsc.modal}개·날개 열림 ${afterModalEsc.drawer}`)
  await t.close()
})

/* ── A17 Shift+Enter는 줄바꿈, 빈 글은 못 보낸다 ────────────────── */
await run('A17', async () => {
  const t = await open()
  await t.goto('/ai', 1500)
  const emptyLocked = await send(t.page).isDisabled()
  await box(t.page).fill('   ')
  const blankLocked = await send(t.page).isDisabled()
  await box(t.page).fill('첫 줄')
  await box(t.page).press('Shift+Enter'); await sleep(200)
  const value = await box(t.page).inputValue()
  report('A17', emptyLocked && blankLocked && value === '첫 줄\n' && t.count(ASK) === 0, `빈 글 잠김 ${emptyLocked}, 공백만 잠김 ${blankLocked}, Shift+Enter 뒤 "${JSON.stringify(value)}", 질문 ${t.count(ASK)}건`)
  await t.close()
})

/* ── A18 AI 쪽 말풍선이 보인다(2026-11-03 사용자 "AI가 대답하는 곳에 말풍선을 띄워줘(지금은 아무것도 안보임)") ─────
   바탕이 흰색 하나가 된 뒤(10-30) AI 쪽 말풍선(답·기다리는 점·그만 기다림·실패)은 대화창과 같은 흰색이라 글자만 떠 있었다.
   말풍선 바탕이 대화창 바탕과 달라야 하고, 답 안의 표 머리·코드 바탕은 말풍선 바탕과 또 달라야 한다(같으면 말풍선 안에서 사라진다) */
const fill = (locator) => locator.evaluate((el) => {
  const bg = (node) => getComputedStyle(node).backgroundColor
  const clear = (c) => c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c)
  let back = el.parentElement
  while (back && clear(bg(back))) back = back.parentElement
  return { own: bg(el), behind: back ? bg(back) : 'none', padLeft: parseFloat(getComputedStyle(el).paddingLeft) }
})
await run('A18', async () => {
  const t = await open({ askDelay: 1500 })
  await t.goto('/ai', 1500)
  await ask(t.page, '말풍선 질문')
  const dots = t.page.locator('[class*="_loading_"]').first()
  await dots.waitFor({ timeout: 2000 })
  const waiting = await fill(dots)
  await answerBubble(t.page).waitFor({ timeout: 5000 }); await sleep(300)
  const answer = await fill(answerBubble(t.page))
  const mine = await fill(t.page.locator('[class*="_bubbleUser_"]').first())
  report('A18a', !/rgba\(.*,\s*0\)$|transparent/.test(answer.own) && answer.own !== answer.behind && waiting.own !== waiting.behind && answer.padLeft >= 12 && mine.own !== answer.own,
    `답 말풍선 ${answer.own} / 뒤 ${answer.behind}, 기다리는 점 ${waiting.own} / 뒤 ${waiting.behind}, 안 여백 ${answer.padLeft}px, 내 말풍선 ${mine.own}`)
  await t.close()

  const r = await open()
  await r.goto('/ai', 1500)
  await room(r.page).click()
  const th = r.page.locator('[class*="_bubbleAnswer_"] th').first()
  await th.waitFor({ timeout: 5000 }).catch(() => {})
  const head = (await th.count()) ? await fill(th) : null
  report('A18b', head !== null && head.own !== head.behind && !/transparent/.test(head.own), `답 안 표 머리 ${head?.own} / 말풍선 ${head?.behind}`)
  await r.close()
})

/* A19 첫 화면(2026-11-05 사용자 "안내 디자인이 미려하지 않아"): 가운데 맞춘 성향 줄과 왼쪽 맞춘 예시 표가 따로 놀았다.
   제목·성향 줄·답 말풍선·예시 줄이 한 왼쪽 끝에 서고, 첫 예시는 대화와 같은 말풍선 한 쌍(질문은 진한 면 오른쪽 끝, 답은 옅은 면, 내 성향으로 적힘).
   예시는 넷, 누르면 그 질문이 채워진다. 1440·390 넘침 없음 */
await run('A19', async () => {
  for (const width of [1440, 390]) {
    const t = await open({ width, height: width > 600 ? 900 : 844 })
    await t.goto('/ai', 1500)
    const r = await t.page.evaluate(() => {
      const area = document.querySelector('[class*="_emptyArea_"]')
      const box = (sel) => area.querySelector(sel)?.getBoundingClientRect() ?? null
      const title = box('h2'), line = box('p'), ask = box('[class*="_demoAsk_"]'), answer = box('[class*="_demoAnswer_"]'), row = box('[class*="_example_"]')
      const column = area.querySelector('section').getBoundingClientRect()
      const bg = (sel) => getComputedStyle(area.querySelector(sel)).backgroundColor
      return {
        lefts: [title, line, answer, row].map((b) => Math.round(b.left - column.left)),
        askRight: Math.round(column.right - ask.right), askAbove: ask.bottom <= answer.top,
        askBg: bg('[class*="_demoAsk_"]'), answerBg: bg('[class*="_demoAnswer_"]'),
        mine: /위험중립형/.test(area.querySelector('[class*="_demoAnswer_"]').textContent),
        examples: area.querySelectorAll('[class*="_exampleQuestion_"]').length,
      }
    })
    const chips = t.page.locator('[class*="_exampleQuestion_"]')
    const last = (await chips.last().innerText()).trim()
    await chips.last().click(); await sleep(100)
    const filled = (await box(t.page).inputValue()) === last
    report(`A19-${width}`, r.lefts.every((x) => x === 0) && r.askRight === 0 && r.askAbove && r.askBg !== r.answerBg && r.mine && r.examples === 4 && filled && (await noOverflow(t.page)),
      `왼쪽 끝(제목·성향·답·예시 줄) ${r.lefts.join('/')}px, 질문 오른쪽 끝 ${r.askRight}px, 질문이 답 위 ${r.askAbove}, 면 ${r.askBg} / ${r.answerBg}, 내 성향 답 ${r.mine}, 예시 ${r.examples}, 마지막 예시 채움 ${filled}`)
    await t.close()
  }
})

if (RECORD) { writeFileSync(ORDER_FILE, JSON.stringify(orders, null, 1) + '\n'); console.log(`요청 순서 기록 → ${ORDER_FILE.pathname}`) }
await j.finish()
