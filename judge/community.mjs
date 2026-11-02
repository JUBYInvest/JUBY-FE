// 홈 커뮤니티 채팅 칸 판정(2026-11-02 사용자 요청 "커뮤니티가 글 형식이 아니라 채팅 형식이었으면 좋겠어").
// 백엔드가 없어 예시 대화이고 입력칸은 잠겨 있다. /api는 전부 가짜(mock.mjs), 시계는 목 11:00(THU_11).
// node community.mjs <BASE> [--only C1,C2] [--headed]
import { cli, judge, noOverflow, sleep } from './lib.mjs'

const j = await judge(cli())
const SECTION = 'section[aria-labelledby="home-community-title"]'
/** src/content/communityPreview.ts의 말하는 사람 — 같은 사람이 이어 말한 8번째 말은 이름을 다시 보이지 않는다 */
const AUTHORS_SHOWN = ['월급쟁이투자', '주린이공부중', '반도체관심', '처음이에요', '차트독학', '처음이에요', '주린이공부중', '반도체관심']

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
  const t = await j.open({ width: 1920, height: 1080 })
  await t.goto('/', 1800)
  const section = t.page.locator(SECTION)
  const logs = await section.getByRole('log', { name: '커뮤니티 예시 대화' }).count()
  const items = await section.locator('[role="log"] li').count()
  const text = (await section.textContent()) ?? ''
  const sortGroup = await section.getByRole('group', { name: '글 정렬' }).count()
  j.report('C1', logs === 1 && items === 9 && !/댓글 \d|좋아요 \d/.test(text) && sortGroup === 0,
    `대화창 ${logs}개, 말 ${items}개, 댓글·좋아요 수 ${/댓글 \d|좋아요 \d/.test(text) ? '있음' : '없음'}, 정렬 탭 ${sortGroup}`)

  // C2 처음에는 최신 말(맨 아래)이 보이고, 대화창 안에서만 스크롤한다(페이지는 움직이지 않는다)
  await t.page.evaluate(() => document.fonts.ready)
  await sleep(300)
  const m = await measure(t.page)
  j.report('C2', m !== null && m.scrolls && m.items.at(-1) > 0.99 && m.items[0] < 0.5 && m.pageY === 0,
    `창 높이 ${m?.logH}px, 안에서 스크롤 ${m?.scrolls}, 마지막 말 보임 ${m?.items.at(-1)?.toFixed(2)}, 첫 말 보임 ${m?.items[0]?.toFixed(2)}, 페이지 스크롤 ${m?.pageY}`)

  // C3 시각: 한국 시각 "오전 9:56"(64분 전)부터 "오전 10:56"(4분 전)까지, 오래된 말이 위
  const times = await section.locator('[role="log"] time').evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), at: e.getAttribute('datetime') })))
  const ordered = times.every((x, i) => i === 0 || Date.parse(times[i - 1].at) <= Date.parse(x.at))
  j.report('C3', times[0]?.text === '오전 9:56' && times.at(-1)?.text === '오전 10:56' && ordered && times.every((x) => !Number.isNaN(Date.parse(x.at))),
    `시각 ${times.length}개 — 처음 ${times[0]?.text}(${times[0]?.at}), 마지막 ${times.at(-1)?.text}, 오래된 순 ${ordered}`)

  // C4 같은 사람이 이어 말하면 이름은 한 번만 보이고, 읽어 주는 쪽에는 이름을 남긴다
  const shown = await section.locator('[role="log"] [data-author]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 1).map((e) => e.textContent.trim()))
  const spoken = await section.locator('[role="log"] li').evaluateAll((lis) => lis.map((li) => li.textContent.includes('주린이공부중')))
  j.report('C4', JSON.stringify(shown) === JSON.stringify(AUTHORS_SHOWN) && spoken[7] === true,
    `보이는 이름 ${JSON.stringify(shown)}, 이어 말한 8번째 말이 이름을 읽어 줌 ${spoken[7]}`)

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
  j.report('C5', c5.input && /준비 중/.test(c5.placeholder ?? '') && c5.font >= 16 && c5.send && c5.sample >= 1 && c5.notice && t.api().length === before && items2 === 9,
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
  j.report('C7', c7.tinted === 0 && c7.bubbles === 9 && c7.sub === 9, `등락색 칠한 요소 ${c7.tinted}, 말풍선 ${c7.bubbles}개 중 옅은 면 ${c7.sub}`)
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
  j.report('C9', items === 9 && locked && hits.length === 0, `비로그인 말 ${items}개, 입력칸 잠김 ${locked}, 커뮤니티·채팅 요청 ${hits.length}건`)
  await t.close()
})

await j.finish()
