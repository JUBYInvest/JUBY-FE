import { useEffect, useRef, useState } from 'react'
import {
  connectCommunity,
  initialCommunityStatus,
  loadCommunityPosts,
  type CommunityConnection,
  type CommunityDraft,
  type CommunityEvent,
  type CommunityPost,
  type CommunityStatus,
} from '../api/community'

interface Feed {
  /** 화면에 선 글(최신이 앞). 처음 목록을 받기 전엔 null */
  posts: CommunityPost[] | null
  /** 보고 있는 동안 들어온 새 글. 바로 끼워 넣으면 읽던 글이 밀려 "새 글 N개"로 모았다가 누르면 위에 세운다 */
  pending: CommunityPost[]
  status: CommunityStatus
  revealPending: () => void
  /** 글을 서버로 보낸다(실제 연결이 열렸을 때만). 서버가 POST_CREATED로 되돌려 주면 새 글로 들어온다. 못 보내면 false */
  sendPost: (draft: CommunityDraft) => boolean
  /**
   * 당겨서 새로고침(커뮤니티 목록). 쌓인 새 글 + 지금 받아 오는 새 글(목업은 다음 예시 글) + 다시 받은 처음 목록에서 목록에 없던 글을 위에 세운다.
   * 위에 선 글을 돌려준다(없으면 빈 목록 — "새 글이 없어요")
   */
  refresh: () => Promise<CommunityPost[]>
}

const withoutDuplicates = (list: CommunityPost[]) => list.filter((post, index) => list.findIndex((other) => other.postId === post.postId) === index)

/**
 * 커뮤니티 글 목록 + 웹소켓(src/api/community.ts). 홈 오른쪽 칸, 커뮤니티 목록·글 상세·글쓰기 화면이 같이 쓴다.
 * 화면을 떠나면 연결을 닫고, 닫힌 뒤 온 일은 버린다.
 * `seed`는 눌러 온 글이다(글 상세) — 처음 목록에 없으면(보고 있는 동안 들어온 새 글) 목록에 넣는다. 부르는 쪽은 한 번 읽어 둔 값(useCommunityHandoff)을 넘긴다 —
 * 렌더마다 새 객체를 넘기면 그때마다 다시 연결한다
 */
export function useCommunityFeed(seed: CommunityPost | null = null): Feed {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [pending, setPending] = useState<CommunityPost[]>([])
  const [status, setStatus] = useState<CommunityStatus>(initialCommunityStatus)
  const connectionRef = useRef<CommunityConnection | null>(null)

  useEffect(() => {
    let isStale = false
    loadCommunityPosts().then((list) => {
      if (!isStale) setPosts(seed === null ? list : withoutDuplicates([...list, seed]))
    })

    const update = (list: CommunityPost[], event: CommunityEvent) => {
      if (event.type === 'POST_DELETED') return list.filter((post) => post.postId !== event.postId)
      if (event.type === 'POST_UPDATED') {
        return list.map((post) =>
          post.postId === event.postId ? { ...post, likeCount: event.likeCount, commentCount: event.commentCount } : post,
        )
      }
      return list
    }
    const connection = connectCommunity({
      onStatus: (next) => {
        if (!isStale) setStatus(next)
      },
      onEvent: (event) => {
        if (isStale) return
        if (event.type === 'POST_CREATED') {
          setPending((list) => withoutDuplicates([event.post, ...list]))
          return
        }
        setPosts((list) => (list === null ? list : update(list, event)))
        setPending((list) => update(list, event))
      },
    })
    connectionRef.current = connection
    return () => {
      isStale = true
      connectionRef.current = null
      connection.close()
    }
  }, [seed])

  // 이미 목록에 선 글은 새 글로 세지 않는다(홈에서 눌러 온 새 글이 웹소켓으로 다시 오는 경우)
  const fresh = posts === null ? pending : pending.filter((post) => !posts.some((shown) => shown.postId === post.postId))

  const revealPending = () => {
    setPosts((list) => withoutDuplicates([...fresh, ...(list ?? [])]))
    setPending([])
  }

  const sendPost = (draft: CommunityDraft) => connectionRef.current?.sendPost(draft) ?? false

  // 새로고침은 기다린 뒤(처음 목록을 다시 받는다) 그때의 목록·쌓인 새 글과 견준다 — 부를 때 잡힌 값은 낡았다
  const latestRef = useRef<{ posts: CommunityPost[] | null; pending: CommunityPost[] }>({ posts: null, pending: [] })
  useEffect(() => {
    latestRef.current = { posts, pending: fresh }
  })

  const refresh = async () => {
    const pulled = connectionRef.current?.pullNow() ?? []
    const loaded = await loadCommunityPosts()
    const { posts: shown, pending: waiting } = latestRef.current
    const known = new Set((shown ?? []).map((post) => post.postId))
    const incoming = withoutDuplicates([...pulled, ...waiting, ...loaded]).filter((post) => !known.has(post.postId))
    setPosts((list) => withoutDuplicates([...incoming, ...(list ?? [])]))
    setPending([])
    return incoming
  }

  return { posts, pending: fresh, status, revealPending, sendPost, refresh }
}
