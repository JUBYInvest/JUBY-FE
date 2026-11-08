import { ApiError, get, malformedResponse, patch, post, remove } from './client'
import { isStockCode } from './stock'
import { fromKstDateTime, toIsoTime } from '../utils/date'
import { finiteOrNull } from '../utils/format'
import { textOrEmpty } from '../utils/text'

/*
 * 커뮤니티 — 백엔드 `/api/community/**`. 화면은 이 파일만 부른다.
 * 글 조회(목록·인기·상세·종목 카드)는 로그인 없이 되고, 토큰을 실으면 likedByMe·isMine이 채워진다. 댓글은 보기도 로그인이 필요하다.
 * 글·댓글 쓰기는 닉네임까지 있어야 한다(없으면 403 COMMUNITY403_1). 목록은 커서로 넘긴다.
 */

/** 제목·본문·댓글 길이 한도(서버 검증과 같다). 글쓰기 칸의 maxLength다 */
export const COMMUNITY_LIMITS = { title: 40, content: 1000, comment: 500 } as const
/** 한 번에 받는 글·댓글 수 */
const PAGE_SIZE = 20

interface PostBase {
  postId: number
  stockCode: string | null
  stockName: string | null
  title: string
  /** 쓴 사람 닉네임. 탈퇴했으면 "탈퇴한 회원" */
  author: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  isMine: boolean
  isEdited: boolean
  /** ISO 시각 */
  createdAt: string
}

/** 목록의 글 한 건 */
export interface PostSummary extends PostBase {
  /** 전일 대비 등락률(%). 종목 없는 글이거나 시세를 못 받았으면 null */
  changeRate: number | null
  /** 본문 앞 100자 */
  preview: string
}

/** 글 상세 — 본문 전체. 등락률·미리보기는 없다(목록에서 실어 온 값을 쓴다) */
export interface PostDetail extends PostBase {
  content: string
}

export interface CommunityComment {
  commentId: number
  postId: number
  content: string
  author: string
  likeCount: number
  likedByMe: boolean
  isMine: boolean
  isEdited: boolean
  createdAt: string
}

export type PostOrder = 'latest' | 'popular'

/** 다음 쪽을 받을 커서. 최신·댓글은 cursor 하나, 인기는 좋아요 수와 글 번호를 함께 보낸다 */
export type PageCursor = { cursor: number } | { cursorLikeCount: number; cursorId: number }

interface Page<T> {
  items: T[]
  /** 마지막 쪽이면 null */
  next: PageCursor | null
}

export interface StockCard {
  stockCode: string
  stockName: string
  postCount: number
  changeRate: number | null
}

export interface StockCards {
  /** 전체 글 수(종목 없는 글 포함) */
  totalPostCount: number
  /** 글이 많은 순 최대 10개 */
  stocks: StockCard[]
  /** 등락률 기준 시각(ms). 하나도 못 받았으면 null */
  priceAsOf: number | null
}

/* ── 응답 거르기 ── */

type Raw = Record<string, unknown>
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null
const count = (value: unknown): number => Math.max(0, finiteOrNull(value) ?? 0)
const stockOf = (row: Raw): { stockCode: string | null; stockName: string | null } => {
  const code = typeof row.stockCode === 'string' && isStockCode(row.stockCode) ? row.stockCode : null
  return { stockCode: code, stockName: code !== null && typeof row.stockName === 'string' && row.stockName !== '' ? row.stockName : code === null ? null : code }
}
/** 서버 시각 글자(한국 시각, 시간대 없음) → ISO. 못 읽으면 "" */
const timeOf = (value: unknown): string => {
  const ms = fromKstDateTime(typeof value === 'string' ? value : null)
  return ms === null ? '' : toIsoTime(ms)
}

function toBase(row: Raw): PostBase | null {
  const postId = finiteOrNull(row.postId)
  if (postId === null) return null
  return {
    postId,
    ...stockOf(row),
    title: textOrEmpty(row.title),
    author: textOrEmpty(row.writerNickname) || '알 수 없음',
    likeCount: count(row.likeCount),
    commentCount: count(row.commentCount),
    likedByMe: row.likedByMe === true,
    isMine: row.isMine === true,
    isEdited: row.isEdited === true,
    createdAt: timeOf(row.createdAt),
  }
}

/** @public 판정(judge/unit.test.mjs)도 부른다 */
export function toPostSummary(raw: unknown): PostSummary | null {
  if (!isRaw(raw)) return null
  const base = toBase(raw)
  if (base === null) return null
  return { ...base, changeRate: base.stockCode === null ? null : finiteOrNull(raw.changeRate), preview: textOrEmpty(raw.preview) }
}

function toPostDetail(raw: unknown): PostDetail | null {
  if (!isRaw(raw)) return null
  const base = toBase(raw)
  return base === null ? null : { ...base, content: textOrEmpty(raw.content) }
}

function toComment(raw: unknown): CommunityComment | null {
  if (!isRaw(raw)) return null
  const commentId = finiteOrNull(raw.commentId)
  const postId = finiteOrNull(raw.postId)
  if (commentId === null || postId === null) return null
  return {
    commentId,
    postId,
    content: textOrEmpty(raw.content),
    author: textOrEmpty(raw.writerNickname) || '알 수 없음',
    likeCount: count(raw.likeCount),
    likedByMe: raw.likedByMe === true,
    isMine: raw.isMine === true,
    isEdited: raw.isEdited === true,
    createdAt: timeOf(raw.createdAt),
  }
}

function listOf<T>(rows: unknown, to: (raw: unknown) => T | null): T[] {
  if (!Array.isArray(rows)) throw malformedResponse()
  return rows.flatMap((row) => {
    const item = to(row)
    return item === null ? [] : [item]
  })
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) search.set(key, String(value))
  return search.toString()
}

/* ── 조회(로그인 없이 된다 — 토큰이 있으면 싣고, 만료돼도 로그인 화면으로 끌고 가지 않는다) ── */

const PUBLIC = { ignoreUnauthorized: true } as const

/** 종목 카드 줄(`GET /api/community/stocks`) */
export async function getCommunityStocks(): Promise<StockCards> {
  const result = await get<Raw | null>('/api/community/stocks', PUBLIC)
  if (!isRaw(result)) throw malformedResponse()
  const stocks = listOf(result.stocks, (raw): StockCard | null => {
    if (!isRaw(raw)) return null
    const { stockCode, stockName } = stockOf(raw)
    return stockCode === null || stockName === null ? null : { stockCode, stockName, postCount: count(raw.postCount), changeRate: finiteOrNull(raw.changeRate) }
  })
  return { totalPostCount: count(result.totalPostCount), stocks, priceAsOf: fromKstDateTime(typeof result.priceAsOf === 'string' ? result.priceAsOf : null) }
}

/** 최신(`/api/community/posts`)·이번 주 인기(`/popular`) 목록 한 쪽. 종목을 주면 그 종목 글만 */
export async function getPosts(order: PostOrder, stockCode: string | null, cursor: PageCursor | null = null): Promise<Page<PostSummary>> {
  const path = order === 'latest' ? '/api/community/posts' : '/api/community/posts/popular'
  const result = await get<Raw | null>(`${path}?${query({ stockCode, size: PAGE_SIZE, ...(cursor ?? {}) })}`, PUBLIC)
  if (!isRaw(result)) throw malformedResponse()
  const items = listOf(result.posts, toPostSummary)
  let next: PageCursor | null = null
  if (result.hasNext === true) {
    const cursorValue = finiteOrNull(result.nextCursor)
    const likes = finiteOrNull(result.nextCursorLikeCount)
    const id = finiteOrNull(result.nextCursorId)
    next = order === 'latest' ? (cursorValue === null ? null : { cursor: cursorValue }) : likes === null || id === null ? null : { cursorLikeCount: likes, cursorId: id }
  }
  return { items, next }
}

/** 글 상세. 없거나 지운 글이면 null(404 COMMUNITY404_1) */
export async function getPost(postId: number): Promise<PostDetail | null> {
  try {
    const detail = toPostDetail(await get<unknown>(`/api/community/posts/${postId}`, PUBLIC))
    if (detail === null) throw malformedResponse()
    return detail
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'COMMUNITY404_1') return null
    throw error
  }
}

/** 댓글 한 쪽(오래된 순). 로그인해야 부른다 */
export async function getComments(postId: number, cursor: number | null = null): Promise<Page<CommunityComment>> {
  const result = await get<Raw | null>(`/api/community/posts/${postId}/comments?${query({ cursor, size: PAGE_SIZE })}`)
  if (!isRaw(result)) throw malformedResponse()
  const next = result.hasNext === true ? finiteOrNull(result.nextCursor) : null
  return { items: listOf(result.comments, toComment), next: next === null ? null : { cursor: next } }
}

/* ── 쓰기(로그인 필요). 글 수가 바뀌는 일 뒤에는 종목 카드를 다시 받게 한다 ── */

interface PostDraft {
  title: string
  content: string
}

export async function createPost(draft: PostDraft & { stockCode: string | null }): Promise<PostDetail> {
  // 종목이 없으면 칸을 뺀다 — 빈 문자열은 400이다
  const body = draft.stockCode === null ? { title: draft.title, content: draft.content } : draft
  const created = toPostDetail(await post<unknown>('/api/community/posts', body))
  if (created === null) throw malformedResponse()
  return created
}

export async function updatePost(postId: number, draft: PostDraft): Promise<PostDetail> {
  const updated = toPostDetail(await patch<unknown>(`/api/community/posts/${postId}`, draft))
  if (updated === null) throw malformedResponse()
  return updated
}

export async function deletePost(postId: number): Promise<void> {
  await remove<unknown>(`/api/community/posts/${postId}`)
}

interface LikeState {
  liked: boolean
  likeCount: number
}

function toLike(raw: unknown): LikeState {
  if (!isRaw(raw) || typeof raw.liked !== 'boolean') throw malformedResponse()
  return { liked: raw.liked, likeCount: count(raw.likeCount) }
}

/** 좋아요 토글 — 누른 뒤의 상태를 준다 */
export async function togglePostLike(postId: number): Promise<LikeState> {
  return toLike(await post<unknown>(`/api/community/posts/${postId}/likes`, null))
}

export async function toggleCommentLike(commentId: number): Promise<LikeState> {
  return toLike(await post<unknown>(`/api/community/comments/${commentId}/likes`, null))
}

export async function createComment(postId: number, content: string): Promise<CommunityComment> {
  const created = toComment(await post<unknown>(`/api/community/posts/${postId}/comments`, { content }))
  if (created === null) throw malformedResponse()
  return created
}

export async function updateComment(commentId: number, content: string): Promise<CommunityComment> {
  const updated = toComment(await patch<unknown>(`/api/community/comments/${commentId}`, { content }))
  if (updated === null) throw malformedResponse()
  return updated
}

export async function deleteComment(commentId: number): Promise<void> {
  await remove<unknown>(`/api/community/comments/${commentId}`)
}

/** 닉네임이 없어 쓰지 못했는가(403 COMMUNITY403_1) — 화면이 닉네임 창을 띄운다 */
export const needsNickname = (error: unknown): boolean => error instanceof ApiError && error.code === 'COMMUNITY403_1'

/** 서버가 받고도 실패했다(5xx). 화면이 "커뮤니티 서버에 문제가 생겨"라고 알린다 — 연결 끊김·시간 초과는 그냥 "못 불러왔어요"다 */
export const isServerFault = (error: unknown): boolean => error instanceof ApiError && error.status >= 500


function isPostBase(value: Raw): boolean {
  return (
    typeof value.postId === 'number' &&
    typeof value.title === 'string' &&
    typeof value.author === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.stockCode === null || (typeof value.stockCode === 'string' && isStockCode(value.stockCode)))
  )
}

/** 주소 기록(넘겨주기 state)에 남은 목록 글이 모양이 맞는가 — 글 상세가 등락률·미리보기를 이어 쓴다 */
export function isPostSummary(value: unknown): value is PostSummary {
  return (
    isRaw(value) &&
    isPostBase(value) &&
    typeof value.preview === 'string' &&
    (value.changeRate === null || typeof value.changeRate === 'number')
  )
}

/** 주소 기록에 남은 방금 저장한 글(올리기·고치기 응답)이 모양이 맞는가 — 글 상세가 서버에 다시 묻기 전에 그대로 그린다 */
export function isPostDetail(value: unknown): value is PostDetail {
  return (
    isRaw(value) &&
    isPostBase(value) &&
    typeof value.content === 'string' &&
    (value.stockName === null || typeof value.stockName === 'string') &&
    typeof value.likeCount === 'number' &&
    typeof value.commentCount === 'number' &&
    typeof value.likedByMe === 'boolean' &&
    typeof value.isMine === 'boolean' &&
    typeof value.isEdited === 'boolean'
  )
}
