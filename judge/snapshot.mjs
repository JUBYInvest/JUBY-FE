// 화면 지문 — 리팩토링(겉모습·동작을 바꾸지 않는 고치기)의 블랙박스 판정(2026-11-08 사용자 "전체적인 프론트엔드 리팩토링을 블랙박스 테스트와 화이트박스 테스트를 통해").
// 화면마다 폭 둘(1440·390)에서 ① 접근성 트리(읽어 주는 글·역할·구조, ariaSnapshot) ② 첫 화면 그림(움직임 끔) ③ 페이지 높이·가로 넘침 ④ /api 요청 순서를 적어 두고,
// 고친 뒤 같은 값인지 견준다(요청은 HTTP 순서 + 웹소켓 연결 목록). 하나라도 바뀌면 FAIL — 리팩토링은 화면에서 티가 나면 안 된다. 시계는 목 11:00(lib.mjs), /api는 전부 가짜(mock.mjs).
//   node snapshot.mjs <BASE> save <파일.json>      고치기 전 빌드에서 두 번 찍어 둔다(두 번 사이에 흔들린 칸은 견주지 않는다 — 실시간 값·도는 고리 등)
//   node snapshot.mjs <BASE> compare <파일.json>   고친 뒤 빌드에서 견준다. 다른 화면은 그림을 <파일>-diff/에 남긴다
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { judge, sleep } from './lib.mjs'

const [BASE, MODE, FILE] = process.argv.slice(2)
if (!['save', 'compare'].includes(MODE) || !FILE) {
  console.error('사용법: node snapshot.mjs <BASE> save|compare <파일.json>')
  process.exit(2)
}

/** 상세에서 바로 가기 링크를 눌러 넘어간 화면(넘겨주기 state를 거친다) */
const via = (label) => async (t) => {
  await t.goto('/stocks/005930', 1800)
  await t.page.getByRole('link', { name: label }).first().click()
  await sleep(2500)
}
const at = (path, wait = 1800) => async (t) => t.goto(path, wait)

/** [이름, 로그인, 여는 법] */
const SCREENS = [
  ['home', true, at('/', 2200)],
  ['home-out', false, at('/', 2200)],
  ['stock', true, at('/stocks/005930', 2500)],
  ['stock-out', false, at('/stocks/005930', 2500)],
  ['likes', true, at('/likes', 2000)],
  ['likes-out', false, at('/likes')],
  ['backtest', true, at('/backtest')],
  ['backtest-handoff', true, via('이 종목 백테스트')],
  ['backtest-out', false, at('/backtest')],
  ['ai', true, at('/ai', 2000)],
  ['ai-handoff', true, via('AI에게 물어보기')],
  ['ai-out', false, at('/ai')],
  ['guide', true, at('/guide')],
  ['guide-backtest', true, at('/guide/backtest')],
  ['community', true, at('/community', 2000)],
  ['community-out', false, at('/community', 2000)],
  ['community-post', true, at('/community/1', 2000)],
  ['community-write', true, at('/community/write')],
  ['mypage', true, at('/mypage', 2000)],
  ['mypage-personality', true, at('/mypage/personality')],
  ['mypage-profile', true, at('/mypage/profile')],
  ['personality-test', true, at('/personality-test')],
  ['personality-out', false, at('/personality-test')],
  ['login', false, at('/login', 1200)],
  ['not-found', false, at('/nope', 1200)],
]
const SIZES = [[1440, 900], [390, 844]]

const j = await judge({ BASE })
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 16)

/** 한 벌: { '화면@폭': { aria, image, size, api } } 와 그림 */
async function take() {
  const prints = {}
  const images = {}
  for (const [name, loggedIn, open] of SCREENS) {
    for (const [width, height] of SIZES) {
      const t = await j.open({ loggedIn, width, height })
      await open(t)
      await t.page.evaluate(() => document.fonts.ready)
      const image = await t.page.screenshot({ animations: 'disabled', caret: 'hide' })
      const key = `${name}@${width}`
      prints[key] = {
        aria: await t.page.locator('body').ariaSnapshot(),
        image: sha(image),
        size: await t.page.evaluate(() => `${document.documentElement.scrollHeight}×${document.documentElement.scrollWidth - innerWidth}`),
        // 웹소켓 연결은 HTTP 요청과 도착 때가 본래 엇갈린다(손 인사 대 응답) — HTTP 순서와 따로, 무엇이 붙었는지만 견준다
        api: [...t.api().filter((line) => !line.startsWith('WS ')), '— 웹소켓 —', ...t.api().filter((line) => line.startsWith('WS ')).sort()].join('\n'),
      }
      images[key] = image
      await t.close()
    }
  }
  return { prints, images }
}

/** 두 글의 첫 다른 줄 */
function firstDiff(a, b) {
  const x = a.split('\n'), y = b.split('\n')
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) if (x[i] !== y[i]) return `${i + 1}째 줄 "${(x[i] ?? '(없음)').trim().slice(0, 90)}" → "${(y[i] ?? '(없음)').trim().slice(0, 90)}"`
  return ''
}

if (MODE === 'save') {
  const one = await take()
  const two = await take()
  const saved = {}
  for (const [key, print] of Object.entries(one.prints)) {
    const again = two.prints[key]
    // 두 번 찍어 다른 칸은 흔들리는 칸이다 — 견주지 않는다(null)
    saved[key] = Object.fromEntries(Object.entries(print).map(([field, value]) => [field, value === again[field] ? value : null]))
    const shaky = Object.keys(print).filter((field) => saved[key][field] === null)
    j.report(`save ${key}`, null, shaky.length === 0 ? '고정' : `흔들림 ${shaky.join('·')} — 견주지 않는다`)
  }
  writeFileSync(FILE, JSON.stringify(saved, null, 1))
} else {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'))
  const { prints, images } = await take()
  const diffDir = FILE.replace(/\.json$/, '') + '-diff'
  for (const [key, before] of Object.entries(saved)) {
    const now = prints[key]
    const changed = Object.entries(before).filter(([field, value]) => value !== null && now?.[field] !== value)
    if (changed.length > 0) {
      mkdirSync(diffDir, { recursive: true })
      writeFileSync(`${diffDir}/${key}.png`, images[key])
    }
    const checked = Object.values(before).filter((value) => value !== null).length
    j.report(`S ${key}`, changed.length === 0, changed.length === 0 ? `같다(${checked}칸)` : changed.map(([field, value]) => `${field}: ${field === 'image' ? '그림이 다르다' : firstDiff(value, now?.[field] ?? '')}`).join(' / '))
  }
}
await j.finish()
