import { useCallback, useEffect, useRef, useState } from 'react'

export type Load<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error' }

/**
 * 화면이 들어오자마자 받는 값 하나의 상태(불러오는 중·받음·실패)와 다시 받기. 마이페이지 세 화면이 같이 쓴다.
 * 다시 받는 사이 먼저 보낸 응답이 늦게 오면 버린다. 실패는 콘솔에 what과 함께 남긴다.
 * load는 안정된 참조여야 한다(모듈의 API 함수를 그대로 넘긴다) — 렌더마다 새 함수면 매번 다시 받는다.
 * 돌려주는 둘: 다시 받기(뼈대부터 — 실패 뒤 다시 시도), 조용히 다시 받기(보던 값을 둔 채 바꾼다 — 저장 뒤.
 * 뼈대로 바꾸면 화면이 깜빡이고 닫힌 상자가 포커스를 돌려줄 단추가 사라진다).
 */
export function useLoad<T>(load: () => Promise<T>, what: string): [Load<T>, () => void, () => void] {
  const [state, setState] = useState<Load<T>>({ kind: 'loading' })
  const seqRef = useRef(0)

  const fetchValue = useCallback((quiet: boolean) => {
    seqRef.current += 1
    const seq = seqRef.current
    if (!quiet) setState({ kind: 'loading' })
    load()
      .then((value) => {
        if (seq === seqRef.current) setState({ kind: 'ready', value })
      })
      .catch((error: unknown) => {
        console.warn(`${what} 조회 실패`, error)
        if (seq === seqRef.current) setState({ kind: 'error' })
      })
  }, [load, what])

  const run = useCallback(() => fetchValue(false), [fetchValue])
  const refresh = useCallback(() => fetchValue(true), [fetchValue])
  useEffect(run, [run])
  return [state, run, refresh]
}
