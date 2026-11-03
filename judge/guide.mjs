// 사용설명서 판정(2026-11-03 사용자 "사용설명서에 그대로 반영해줘" — 3장 주식 백테스트, 노션에서 쓴 글과 그림 다섯 장).
// 글은 src/content/guide/*.md에서 읽어 기대값을 짓는다 — 글이 바뀌어도 판정을 고치지 않는다.
//  U1 원문 그대로: 장 제목·꼭지·표·그림·인용·식 개수가 글과 같고, 글의 모든 줄(꾸밈을 걷은 글자)이 화면에 있다
//  U2 그림: 다섯 장 모두 받아 그려지고(무손실 WebP), 자리를 미리 잡고(width·height), 그림을 설명하는 대체 글이 있다
//  U3 차례: 네 장 순서, 글이 없는 장은 "준비 중"이고 링크가 아니다, 지금 장은 aria-current와 꼭지 넷
//  U4 꼭지로 옮기기: 그 제목이 화면 위에 서고 포커스를 받는다, 주소·기록은 그대로. 움직임 줄이기면 곧바로, 아니면 부드럽게
//  U5 차례가 읽는 동안 위에 붙어 따라온다(넓은 화면). 좁은 화면은 본문 앞에 장 이름만
//  U6 주소: /guide/backtest도 같은 장, 글 없는 장·없는 장은 /guide로, 머리글 '사용설명서'가 지금 메뉴
//  U7 가로 넘침 없음(320~1920), 휴대폰 두 칸 표의 첫 칸은 한 줄, 제목 단계를 건너뛰지 않는다
// node guide.mjs <BASE> [--only U1,U2] [--headed]
import { readFileSync } from 'node:fs'
import { cli, judge, noOverflow, REPO, sleep } from './lib.mjs'

const j = await judge(cli())
const TOC = 'nav[aria-labelledby="guide-toc-title"]'
const markdown = readFileSync(`${REPO}src/content/guide/backtest.md`, 'utf8')
const lines = markdown.split('\n')
const strip = (s) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim()

/** 글에서 지은 기대값 */
const expected = {
  title: strip(lines.find((l) => /^# /.test(l)).slice(2)),
  sections: lines.filter((l) => /^## /.test(l)).map((l) => strip(l.slice(3))),
  h4: lines.filter((l) => /^### /.test(l)).length,
  h5: lines.filter((l) => /^#### /.test(l)).length,
  tables: lines.filter((l) => /^\|\s*-{3}/.test(l)).length,
  images: lines.filter((l) => /^!\[/.test(l)).map((l) => /\]\(([^)]+)\)/.exec(l)[1]),
  quotes: lines.filter((l, i) => /^>/.test(l) && !/^>/.test(lines[i - 1] ?? '')).length,
  formulas: lines.filter((l) => /^`[^`]+`$/.test(l.trim())).length,
  // 화면에 있어야 할 글 조각: 표는 칸마다, 나머지는 줄마다(제목 줄·그림·표 구분 줄 빼고)
  texts: lines.slice(1).flatMap((l) => {
    if (l.trim() === '' || /^\|\s*-{3}/.test(l) || /^!\[/.test(l)) return []
    if (/^\|/.test(l)) return l.split('|').slice(1, -1).map(strip).filter(Boolean)
    return [strip(l.replace(/^#+\s+/, '').replace(/^>\s?/, '').replace(/^\d+\.\s+/, ''))].filter(Boolean)
  }),
}

async function openGuide(opts = {}, path = '/guide') {
  const t = await j.open({ width: 1440, height: 900, ...opts })
  await t.goto(path, 1500)
  await t.page.evaluate(() => document.fonts.ready)
  return t
}

await j.run('U1', async () => {
  const t = await openGuide()
  const got = await t.page.evaluate(() => {
    const article = document.querySelector('main article')
    if (article === null) return null
    return {
      title: document.getElementById('guide-chapter-title')?.textContent.trim() ?? null,
      sections: [...article.querySelectorAll('h3')].map((h) => h.textContent.trim()),
      h4: article.querySelectorAll('h4').length,
      h5: article.querySelectorAll('h5').length,
      tables: article.querySelectorAll('table').length,
      images: article.querySelectorAll('img').length,
      quotes: article.querySelectorAll('blockquote').length,
      formulas: [...article.querySelectorAll('p')].filter((p) => getComputedStyle(p).borderLeftWidth === '3px').length,
      text: article.innerText.replace(/\s+/g, ' '),
    }
  })
  if (got === null) {
    j.report('U1a', false, '본문(article)이 없다')
    j.report('U1b', false, '본문이 없어 글자를 견줄 수 없다')
  } else {
    const same = got.title === expected.title && JSON.stringify(got.sections) === JSON.stringify(expected.sections) && got.h4 === expected.h4 && got.h5 === expected.h5 &&
      got.tables === expected.tables && got.images === expected.images.length && got.quotes === expected.quotes && got.formulas === expected.formulas
    j.report('U1a', same, `장 제목 "${got.title}", 꼭지 ${got.sections.length}/${expected.sections.length}, 소제목 ${got.h4}/${expected.h4}·${got.h5}/${expected.h5}, 표 ${got.tables}/${expected.tables}, 그림 ${got.images}/${expected.images.length}, 인용 ${got.quotes}/${expected.quotes}, 식 ${got.formulas}/${expected.formulas}`)
    const missing = expected.texts.filter((s) => !got.text.includes(s))
    j.report('U1b', missing.length === 0, `글 ${expected.texts.length}조각 중 화면에 없는 것 ${missing.length}${missing.length ? '\n    ' + missing.slice(0, 6).join('\n    ') : ''}`)
  }
  await t.close()
})

await j.run('U2', async () => {
  const t = await j.open({ width: 1440, height: 900 })
  const types = new Map()
  t.page.on('response', (r) => { if (/\/guide\/.+\.(webp|png)$/.test(new URL(r.url()).pathname)) types.set(new URL(r.url()).pathname, r.headers()['content-type']) })
  await t.goto('/guide', 1500)
  const imgs = await t.page.locator('main article img').all()
  const rows = []
  for (const img of imgs) {
    await img.scrollIntoViewIfNeeded()
    await t.page.waitForFunction((el) => el.complete, await img.elementHandle(), { timeout: 4000 }).catch(() => {})
    rows.push(await img.evaluate((el) => ({ src: new URL(el.src).pathname, natural: el.naturalWidth, attr: el.getAttribute('width') !== null && el.getAttribute('height') !== null,
      ratio: Math.abs(el.getBoundingClientRect().width / el.getBoundingClientRect().height - el.naturalWidth / el.naturalHeight) < 0.02, alt: el.alt, lazy: el.loading === 'lazy' })))
  }
  const loaded = rows.length === expected.images.length && rows.every((r, i) => r.src === expected.images[i] && r.natural === 1344 && r.ratio)
  j.report('U2a', loaded, `그림 ${rows.length}장, 글의 순서·주소와 같고 다 그려졌다 — ${rows.map((r) => `${r.src.split('/').pop()} ${r.natural}px`).join(', ')}`)
  j.report('U2b', rows.length > 0 && rows.every((r) => r.attr && r.lazy), '그림이 오기 전에 자리를 잡고(width·height) 화면 가까이 와서 받는다(loading=lazy)')
  j.report('U2c', rows.length > 0 && rows.every((r) => r.alt.length >= 20 && !/\.(png|webp)$/i.test(r.alt)), `대체 글이 그림을 설명한다(노션 이름 image.png가 아니다) — ${rows.map((r) => r.alt.slice(0, 18) + '…').join(' | ')}`)
  j.report('U2d', types.size === expected.images.length && [...types.values()].every((v) => v === 'image/webp'), `WebP로 받는다 — ${JSON.stringify([...types.values()])}`)
  await t.close()
})

await j.run('U3', async () => {
  const t = await openGuide()
  const toc = await t.page.evaluate((sel) => {
    const nav = document.querySelector(sel)
    if (nav === null) return null
    return [...nav.querySelectorAll(':scope > ol > li')].map((li) => {
      const head = li.firstElementChild
      return { text: head.textContent.replace(/\s+/g, ' ').trim(), link: head.tagName === 'A', current: head.getAttribute('aria-current'),
        sections: [...li.querySelectorAll(':scope ol a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })) }
    })
  }, TOC)
  if (toc === null) j.report('U3', false, '차례가 없다')
  else {
    const names = toc.map((c) => c.text)
    const ok = JSON.stringify(names) === JSON.stringify(['1 JUBY 소개 준비 중', '2 투자성향 준비 중', '3 주식 백테스트', '4 AI 투자챗봇 준비 중'])
      && toc.filter((c) => c.link).length === 1 && toc[2].link && toc[2].current === 'page'
      && JSON.stringify(toc[2].sections.map((s) => s.text)) === JSON.stringify(expected.sections) && toc[2].sections.every((s, i) => s.href === `#backtest-${i + 1}`)
    j.report('U3', ok, `차례 ${JSON.stringify(names)}, 링크 ${toc.filter((c) => c.link).length}개, 지금 장 꼭지 ${JSON.stringify(toc[2]?.sections.map((s) => s.text))}`)
  }
  await t.close()
})

await j.run('U4', async () => {
  const target = expected.sections[1]
  const measure = (page) => page.evaluate(() => {
    const h = document.getElementById('backtest-2')
    return h === null ? null : { top: Math.round(h.getBoundingClientRect().top), focused: document.activeElement === h, url: location.pathname + location.search + location.hash, len: history.length }
  })
  const t = await openGuide()
  const before = await t.page.evaluate(() => ({ url: location.pathname + location.search + location.hash, len: history.length }))
  await t.page.locator(`${TOC} a`, { hasText: target }).click()
  await sleep(60)
  const early = await measure(t.page)
  await sleep(1200)
  const after = await measure(t.page)
  j.report('U4a', after !== null && after.top >= 0 && after.top <= 48 && after.focused && after.url === before.url && after.len === before.len,
    `"${target}"을 누르면 그 제목이 화면 위(${after?.top}px)에 서고 포커스를 받는다, 주소·기록 그대로(${after?.url}, ${before.len} → ${after?.len})`)
  j.report('U4b', early !== null && early.top > 200, `부드럽게 옮긴다 — 60ms 뒤 아직 ${early?.top}px`)
  await t.close()

  const r = await j.open({ width: 1440, height: 900 })
  await r.page.emulateMedia({ reducedMotion: 'reduce' })
  await r.goto('/guide', 1500)
  await r.page.locator(`${TOC} a`, { hasText: target }).click()
  await sleep(60)
  const instant = await measure(r.page)
  j.report('U4c', instant !== null && instant.top >= 0 && instant.top <= 48, `움직임 줄이기 설정에서는 곧바로 선다 — 60ms 뒤 ${instant?.top}px`)
  await r.close()
})

await j.run('U5', async () => {
  const t = await openGuide()
  await t.page.evaluate(() => window.scrollTo(0, 4000))
  await sleep(300)
  const wide = await t.page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null }, TOC)
  j.report('U5a', wide !== null && wide.top >= 0 && wide.top <= 40 && wide.bottom < 900 - 44, `넓은 화면: 4000px 내려도 차례가 위에 붙어 다 보인다 — ${JSON.stringify(wide)}`)
  await t.close()

  const m = await openGuide({ width: 390, height: 844 })
  const narrow = await m.page.evaluate((sel) => {
    const nav = document.querySelector(sel)
    const article = document.querySelector('main article')
    if (nav === null || article === null) return null
    const sectionsShown = [...nav.querySelectorAll('ol ol')].some((ol) => ol.offsetParent !== null)
    window.scrollTo(0, 2000)
    return { before: nav.getBoundingClientRect().bottom <= article.getBoundingClientRect().top + 1, sectionsShown }
  }, TOC)
  await sleep(200)
  const scrolled = await m.page.evaluate((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0), TOC)
  j.report('U5b', narrow !== null && narrow.before && !narrow.sectionsShown && scrolled < 0, `좁은 화면: 차례(장 이름만)가 본문 앞이고 따라오지 않는다 — ${JSON.stringify(narrow)}, 2000px 내린 뒤 차례 아래 끝 ${scrolled}`)
  await m.close()
})

await j.run('U6', async () => {
  const t = await openGuide({}, '/guide/backtest')
  const same = await t.page.evaluate((sel) => ({ title: document.getElementById('guide-chapter-title')?.textContent.trim(),
    current: document.querySelector(`${sel} a[aria-current="page"]`)?.textContent.replace(/\s+/g, ' ').trim(),
    menu: document.querySelector('header nav a[aria-current="page"]')?.dataset.label, doc: document.title }), TOC)
  j.report('U6a', same.title === expected.title && same.current === '3 주식 백테스트' && same.menu === '사용설명서' && /주식 백테스트 사용설명서/.test(same.doc),
    `/guide/backtest도 같은 장, 머리글 지금 메뉴 ${same.menu}, 탭 제목 "${same.doc}"`)
  const paths = []
  for (const path of ['/guide/juby', '/guide/nope']) {
    await t.goto(path, 1000)
    paths.push(await t.page.evaluate(() => location.pathname + ' ' + (document.getElementById('guide-chapter-title')?.textContent.trim() ?? '')))
  }
  j.report('U6b', paths.every((p) => p === `/guide ${expected.title}`), `글 없는 장·없는 장은 /guide로 — ${JSON.stringify(paths)}`)
  await t.goto('/', 1200)
  await t.page.locator('header nav a[data-label="사용설명서"]').click()
  await sleep(1200)
  const viaMenu = await t.page.evaluate(() => location.pathname + ' ' + (document.getElementById('guide-chapter-title')?.textContent.trim() ?? ''))
  j.report('U6c', viaMenu === `/guide ${expected.title}`, `머리글 메뉴로 오면 주소를 바꾸지 않고(/guide) 첫 장이 선다 — ${viaMenu}`)
  await t.close()
})

await j.run('U7', async () => {
  const over = []
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    const t = await openGuide({ width, height: 900 })
    if (!(await noOverflow(t.page))) over.push(`${width}: ${await t.page.evaluate(() => document.documentElement.scrollWidth)}`)
    if (width === 390) {
      const wrapped = await t.page.evaluate(() => [...document.querySelectorAll('main article table')]
        .filter((table) => table.querySelectorAll('thead th').length === 2)
        .flatMap((table) => [...table.querySelectorAll('tbody td:first-child')])
        .filter((td) => { const r = document.createRange(); r.selectNodeContents(td); return r.getBoundingClientRect().height > 30 })
        .map((td) => td.textContent.trim()))
      j.report('U7b', wrapped.length === 0, `390px 두 칸 표의 첫 칸이 한 줄 — 꺾인 칸 ${JSON.stringify(wrapped)}`)
    }
    if (width === 1440) {
      const levels = await t.page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map((h) => Number(h.tagName[1])))
      const skip = levels.some((level, i) => i > 0 && level > levels[i - 1] + 1)
      j.report('U7c', levels[0] === 1 && levels.filter((l) => l === 1).length === 1 && !skip, `제목 단계를 건너뛰지 않는다 — h1 ${levels.filter((l) => l === 1).length}개, 순서 ${levels.slice(0, 12).join('')}…`)
    }
    await t.close()
  }
  j.report('U7a', over.length === 0, `가로 넘침 없음(320·390·768·1024·1440·1920)${over.length ? ' — ' + over.join(', ') : ''}`)
})

await j.finish()
