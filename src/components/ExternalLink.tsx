import type { ReactNode } from 'react'
import { safeLink } from '../utils/link'

/** 마크다운 속 바깥 링크(AI 답·사용설명서). http·https만 새 탭으로 열고 그 밖(javascript: 등)은 글자만 남긴다 */
export default function ExternalLink({ href, children }: { href: unknown; children?: ReactNode }) {
  const link = safeLink(href)
  if (link === '') return <>{children}</>
  return (
    <a href={link} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
