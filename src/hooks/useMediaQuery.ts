import { useCallback, useSyncExternalStore } from 'react'

/** 미디어 쿼리가 맞는지 따라간다 — 창 폭이 바뀌어 맞고 안 맞음이 갈리면 다시 그린다 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
