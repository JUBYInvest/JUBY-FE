// Node가 저장소의 .ts 원본을 그대로 불러 돌릴 수 있게 하는 로더(테스트 러너를 들이지 않는다 — CLAUDE.md "지킬 것").
//   cd judge && node --import ./register.mjs unit.test.mjs
// - 확장자 없는 상대 경로(`./format`)에 `.ts`를 붙인다
// - `import.meta.env.X`를 `globalThis.__viteEnv.X`로 바꾼다(Vite 전용 문법)
// - `*.module.css`·이미지는 빈 모듈로 둔다
// - `파일?raw`(사용설명서 글 — Vite의 글자 그대로 불러오기)는 그 파일 글자를 default로 내보내는 모듈로 바꾼다
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (/\.(module\.css|css|svg|png)$/.test(specifier)) return { url: 'data:text/javascript,export default {}', shortCircuit: true }
  if (specifier.endsWith('?raw') && context.parentURL?.startsWith('file:')) {
    const text = readFileSync(fileURLToPath(new URL(specifier.slice(0, -4), context.parentURL)), 'utf8')
    return { url: `data:text/javascript,export default ${encodeURIComponent(JSON.stringify(text))}`, shortCircuit: true }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/.test(specifier) && context.parentURL?.startsWith('file:')) {
    const base = fileURLToPath(new URL(specifier, context.parentURL))
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      if (existsSync(base + ext)) return nextResolve(specifier + ext, context)
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (url.endsWith('.ts') && result.source) {
    const source = String(result.source).replace(/import\.meta\.env/g, 'globalThis.__viteEnv')
    return { ...result, source }
  }
  return result
}
