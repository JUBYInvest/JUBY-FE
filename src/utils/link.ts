/**
 * 새 탭으로 열어도 되는 주소만 남긴다(http·https). 서버가 주는 링크라도(뉴스 기사, AI 답변 속 링크) javascript:·data:·상대 주소는
 * 그대로 두면 누르는 순간 이 사이트 안에서 뭔가가 실행되거나 열린다. 못 쓰면 빈 문자열이다.
 */
export function safeLink(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:' ? value : ''
  } catch {
    // 기준 주소 없이 풀리지 않는 값(상대 주소 등)
    return ''
  }
}
