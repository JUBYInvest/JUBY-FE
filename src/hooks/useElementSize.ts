import { useEffect, useRef, useState, type RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

/**
 * 칸의 실제 안쪽 크기를 잰다(ResizeObserver). 재기 전에는 null이다.
 * 폭이 화면에 따라 달라 좌표를 미리 정할 수 없는 그림(홈 카드 그래프·관심종목 지도)이 잰 크기로 좌표를 만든다
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>(): [RefObject<T | null>, ElementSize | null] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ElementSize | null>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
