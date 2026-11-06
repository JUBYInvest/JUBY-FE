import ReactMarkdown, { type Components, type Options } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import ExternalLink from './ExternalLink'
import { normalizeMath } from '../utils/markdownMath'
import styles from './MarkdownAnswer.module.css'

/*
 * 한 개 달러는 수식으로 읽지 않는다 — "$100에서 $120으로"가 수식이 된다. 모델이 쓰는 \( \)·\[ \]·$x$는
 * normalizeMath가 미리 $$로 바꿔 둔다(utils/markdownMath.ts)
 */
const remarkPlugins: Options['remarkPlugins'] = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]]
/*
 * 틀린 수식은 던지지 않고 그 자리에 원문으로 둔다. KaTeX 기본은 빨간 글자(#cc0000)라 보조 글자색으로 바꾼다 — 빨강은 등락 전용이다.
 * \text{} 안의 한글은 경고 없이 받는다
 */
const rehypePlugins: Options['rehypePlugins'] = [[rehypeKatex, { throwOnError: false, strict: 'ignore', errorColor: 'var(--color-text-sub)' }]]

const components: Components = {
  a: ({ href, children }) => <ExternalLink href={href}>{children}</ExternalLink>,
  // 넓은 표는 말풍선 안에서 가로로 밀어 본다. 표가 페이지를 밀어내면 320px에서 화면 전체가 가로로 흔들린다
  table: ({ children }) => (
    <div className={styles.tableWrap}>
      <table>{children}</table>
    </div>
  ),
}

interface Props {
  text: string
}

/**
 * AI 답변을 마크다운(표 포함)·수식으로 그린다. 사용자 질문은 여기로 오지 않고 글자 그대로 그린다(ChatMessages).
 *
 * 모델 출력 속 HTML은 그리지 않는다(react-markdown 기본, rehype-raw를 쓰지 않는다) — dangerouslySetInnerHTML과 같은 문제가
 * 된다. 이미지도 그리지 않는다. 모델이 지은 바깥 주소를 이 화면이 불러오게 된다.
 */
export default function MarkdownAnswer({ text }: Props) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        disallowedElements={['img']}
        unwrapDisallowed
      >
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  )
}
