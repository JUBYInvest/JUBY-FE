/**
 * AI 답변의 수식 표기를 remark-math가 읽는 모양(`$$…$$`)으로 바꾼다. 마크다운으로 읽기 **전에** 해야 한다.
 *
 * 모델은 수식을 `\( … \)`(글 안)·`\[ … \]`(따로 한 줄)로 주는 일이 많은데, 마크다운은 `\(`·`\[`를 괄호의 이스케이프로 읽어
 * 역슬래시를 지우고, 수식 속 `P_{peak}`의 `_`를 기울임으로 먹는다. 그래서 글자 단계에서 `$$`로 감싸 둔다.
 *
 * 한 개 달러(`$…$`)는 remark-math에서 끈다(`singleDollarTextMath: false`). 켜면 "$100에서 $120으로"의 두 달러 사이가
 * 수식이 되어 금액이 망가진다(2026-09-30 확인). 대신 여기서 금액이 아닌 것만 골라 `$$`로 바꾼다 — 안에 한글이 없고,
 * 여는 `$` 뒤·닫는 `$` 앞이 공백이 아니고, 닫는 `$` 바로 뒤가 숫자가 아니며, 여는 `$` 앞이 글자·숫자가 아닐 때(US$100 제외).
 *
 * 코드(``` 블록, ` 칸) 안은 건드리지 않는다.
 */
export function normalizeMath(text: string): string {
  return text
    .split(CODE)
    .map((part, index) => (index % 2 === 1 ? part : convertMath(part)))
    .join('')
}

/** 코드 블록(닫히지 않은 것은 끝까지)과 코드 칸. split이 이 부분을 홀수 번째에 끼워 준다 */
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/

/**
 * `\(`·`\[` 안이 수식인가. 한글이 없거나, 있어도 LaTeX 명령(`\text{수익률}`)이 있으면 수식이다.
 * "\[참고\]"처럼 대괄호를 이스케이프한 글은 수식이 아니다.
 */
function looksLikeMath(body: string): boolean {
  return !HANGUL.test(body) || body.includes('\\')
}

function convertMath(part: string): string {
  return (
    part
      // \[ … \] → 따로 한 줄의 $$ 블록
      .replace(/\\\[([\s\S]+?)\\\]/g, (whole: string, body: string) =>
        looksLikeMath(body) ? `\n$$\n${body.trim()}\n$$\n` : whole,
      )
      // \( … \) → 글 안의 $$…$$
      .replace(/\\\(([\s\S]+?)\\\)/g, (whole: string, body: string) =>
        looksLikeMath(body) ? `$$${body.trim()}$$` : whole,
      )
      // $x$ → $$x$$ (금액이 아닌 것만. 위 설명)
      .replace(
        /(^|[^\w$\\])\$(?![\s$])([^$\n]*?[^\s\\$])\$(?![\d$])/g,
        (whole: string, before: string, body: string) =>
          HANGUL.test(body) ? whole : `${before}$$${body}$$`,
      )
  )
}
