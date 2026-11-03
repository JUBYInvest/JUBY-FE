import { useEffect, useRef, useState } from 'react'
import {
  connectCommunity,
  loadCommunityPosts,
  type CommunityConnection,
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
  sendPost: (content: string, stockCode: string | null) => boolean
}

const withoutDuplicates = (list: CommunityPost[]) => list.filter((post, index) => list.findIndex((other) => other.postId === post.postId) === index)

/**
 * 커뮤니티 글 목록 + 웹소켓(src/api/community.ts). 홈 오른쪽 칸과 커뮤니티 화면이 같이 쓴다.
 * 화면을 떠나면 연결을 닫고, 닫힌 뒤 온 일은 버린다
 */
export function useCommunityFeed(): Feed {
  const [posts, setPosts] = useState<CommunityPost[] | null>(null)
  const [pending, setPending] = useState<CommunityPost[]>([])
  const [status, setStatus] = useState<CommunityStatus>('connecting')
  const connectionRef = useRef<CommunityConnection | null>(null)

  useEffect(() => {
    let isStale = false
    loadCommunityPosts().then((list) => {
      if (!isStale) setPosts(list)
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
  }, [])

  const revealPending = () => {
    setPosts((list) => withoutDuplicates([...pending, ...(list ?? [])]))
    setPending([])
  }

  const sendPost = (content: string, stockCode: string | null) => connectionRef.current?.sendPost(content, stockCode) ?? false

  return { posts, pending, status, revealPending, sendPost }
}
