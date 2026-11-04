import { get, malformedResponse } from './client'
import { readMemo, type Memo } from './memo'
import { timeAgo } from '../utils/date'
import { finiteOrNull } from '../utils/format'
import { safeLink } from '../utils/link'
import type { NewsItem, NewsPage, NewsSort } from '../types/news'

/*
 * 뉴스 창구 셋(2026-10-31 api/stock.ts에서 나눔). 셋 다 증권사와 무관하다.
 * - 종목 뉴스 `GET /api/stocks/{code}/news` — Pinecone에 모아 둔 기사. 서버가 요청마다 검색하고(캐시 없음) 작은 서버라 미리 부르지 않는다.
 * - 네이버 뉴스 검색 `GET /api/news` — 주식 모아보기의 관심종목 뉴스. 로그인 필요, 네이버 하루 한도를 회원 모두가 나눠 쓴다.
 * - 질문으로 찾기 `GET /api/vectordb/search` — 종목 상세 뉴스의 '기사 검색하기'. 로그인 필요.
 * 같은 요청은 10분 동안 다시 쓴다(NEWS_MEMO_AGE) — 뉴스는 백엔드가 매달 1일에 넣는다.
 */
const NEWS_MEMO_AGE = 10 * 60 * 1000
const newsMemo = new Map<string, Memo<NewsPage>>()

/** GET /api/stocks/{code}/news */
interface StockNewsResponse {
  stockCode?: string | null
  stockName?: string | null
  sort?: NewsSort | null
  newsList?: NewsItemResponse[] | null
  page?: number | null
  totalCount?: number | null
}

interface NewsItemResponse {
  timeAgo?: string | null
  /** "2026-08-19T23:09:00" (시간대 없음, KST) */
  publishedAt?: string | null
  title?: string | null
  description?: string | null
  originalLink?: string | null
}

/** 서버는 page를 0~9로 제한한다(@Max(9)). 그 밖을 보내면 400이다 */
export const NEWS_LAST_PAGE = 9

/** 서버가 한 페이지에 주는 기사 수 */
export const NEWS_PAGE_SIZE = 10

/**
 * 종목 뉴스. Pinecone에 모아 둔 기사라 증권사와 무관하다.
 * 10건씩, 최신순(LATEST)은 발행일 내림차순, 관련도순(RELEVANCE)은 벡터 검색 순서다.
 */
export async function getStockNews(
  stockCode: string,
  sort: NewsSort,
  page: number,
): Promise<NewsPage> {
  const memoKey = `${stockCode}|${sort}|${page}`
  const remembered = readMemo(newsMemo, memoKey, NEWS_MEMO_AGE)
  if (remembered !== null) return remembered

  const response = await get<StockNewsResponse | null>(
    `/api/stocks/${encodeURIComponent(stockCode)}/news?sort=${sort}&page=${page}`,
  )
  if (response === null || !Array.isArray(response.newsList)) throw malformedResponse()

  const newsPage: NewsPage = {
    /*
     * 제목이나 링크가 빈 기사는 뺀다. 그리면 제목 없는 카드가 href=""로 지금 페이지를 새 탭에 연다.
     * http(s)가 아닌 링크(javascript:, data:, 상대 주소)도 toNewsItem이 비워 여기서 빠진다
     */
    items: response.newsList
      .map(toNewsItem)
      .filter((item) => item.title.trim() !== '' && item.link.trim() !== ''),
    receivedCount: response.newsList.length,
    // 쪽 번호·정렬은 보낸 값을 되돌려 주는 자리라 보낸 값을 쓴다
    page,
    // 비면 "더 보기"를 못 가린다. null로 넘기면 화면이 꽉 찬 페이지인지로 가린다
    totalCount: finiteOrNull(response.totalCount),
    sort,
  }
  newsMemo.set(memoKey, { savedAt: Date.now(), value: newsPage })
  return newsPage
}

/**
 * 제목·본문에 <b> 태그나 HTML 엔티티가 섞여 올 수 있다(원문이 네이버 검색 결과다).
 * 태그를 지운 뒤 textarea에 넣어 엔티티를 되돌린다. textarea 내용은 HTML로
 * 해석되지 않으므로 무엇이 남아 있어도 실행되지 않는다.
 */
function stripHtml(text: string): string {
  const element = document.createElement('textarea')
  element.innerHTML = text.replace(/<[^>]+>/g, '')
  return element.value
}

/** 언론사명이 응답에 없어 링크 도메인으로 대신한다 */
function toSource(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return '출처 미상'
  }
}

/** 문자열이 아니면 빈 문자열. 기사 한 건의 null 하나가 목록 전체를 실패시키지 않게 한다 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNewsItem(item: NewsItemResponse): NewsItem {
  // http·https가 아니면 빈 문자열이라 그 기사는 빠진다
  const link = safeLink(item.originalLink)
  return {
    title: stripHtml(textOf(item.title)),
    description: stripHtml(textOf(item.description)),
    link,
    source: toSource(link),
    timeAgo: textOf(item.timeAgo),
    publishedAt: new Date(textOf(item.publishedAt)),
  }
}

/* ── 네이버 뉴스 검색 ──────────────────────────────────────────────────── */

/** GET /api/news */
interface NaverNewsResponse {
  display?: number | null
  items?: (NaverNewsItemResponse | null)[] | null
}

/** 네이버 응답 그대로의 이름이다(originallink는 소문자). pubDate는 "Wed, 29 Oct 2026 10:00:00 +0900" */
interface NaverNewsItemResponse {
  title?: string | null
  originallink?: string | null
  description?: string | null
  pubDate?: string | null
}

const naverMemo = new Map<string, Memo<NewsItem[]>>()

/**
 * 검색어로 찾은 네이버 뉴스(주식 모아보기의 관심종목 뉴스). **로그인해야 한다** — 서버가 네이버 검색 API를 대신 불러 20건을 준다.
 * 증권사와 무관하지만 네이버 호출 한도가 있어(서버는 429면 잠깐 기다렸다 몇 번 다시 부른다) 같은 검색어는 10분 동안 다시 쓴다.
 * 네이버는 정확도순으로 주므로 화면에서는 새 기사부터 보이게 날짜순으로 다시 세운다. 같은 기사(링크)가 겹치면 하나만 둔다.
 */
export async function searchNews(query: string): Promise<NewsItem[]> {
  const keyword = query.trim()
  const remembered = readMemo(naverMemo, keyword, NEWS_MEMO_AGE)
  if (remembered !== null) return remembered

  const response = await get<NaverNewsResponse | null>(`/api/news?query=${encodeURIComponent(keyword)}`)
  if (typeof response !== 'object' || response === null || !Array.isArray(response.items)) throw malformedResponse()

  const seen = new Set<string>()
  const items = response.items
    .flatMap((row) => (typeof row === 'object' && row !== null ? [toNaverNewsItem(row)] : []))
    .filter((item) => {
      if (item.title.trim() === '' || item.link === '' || seen.has(item.link)) return false
      seen.add(item.link)
      return true
    })
    // 날짜를 못 읽은 기사는 뒤로
    .sort((left, right) => (right.publishedAt.getTime() || 0) - (left.publishedAt.getTime() || 0))
  naverMemo.set(keyword, { savedAt: Date.now(), value: items })
  return items
}

function toNaverNewsItem(item: NaverNewsItemResponse): NewsItem {
  const link = safeLink(item.originallink)
  const publishedAt = new Date(textOf(item.pubDate))
  return {
    title: stripHtml(textOf(item.title)),
    description: stripHtml(textOf(item.description)),
    link,
    source: toSource(link),
    // 종목 뉴스와 달리 서버가 "3시간 전"을 지어 주지 않는다
    timeAgo: timeAgo(publishedAt.getTime()),
    publishedAt,
  }
}

/* ── 뉴스에서 질문으로 찾기 ───────────────────────────────────────────── */

/** GET /api/vectordb/search 한 건. pubDate는 네이버 형식("Mon, 11 Aug 2026 14:32:00 +0900")이다 */
interface NewsHitResponse {
  id?: string | null
  score?: number | null
  title?: string | null
  description?: string | null
  originalLink?: string | null
  pubDate?: string | null
}

const askMemo = new Map<string, Memo<NewsItem[]>>()

/**
 * 종목 뉴스 가운데 질문과 가장 가까운 기사 3건(종목 상세 뉴스의 '기사 검색하기'). **로그인해야 한다.**
 * 서버가 Pinecone에 모아 둔 그 종목 기사에서 질문 글로 찾는다 — 증권사와 무관하다. 순서는 서버가 준 가까운 순 그대로다.
 * 같은 종목·질문은 10분 동안 다시 쓴다.
 */
export async function askStockNews(stockName: string, question: string): Promise<NewsItem[]> {
  const asked = question.trim()
  const memoKey = `${stockName}|${asked}`
  const remembered = readMemo(askMemo, memoKey, NEWS_MEMO_AGE)
  if (remembered !== null) return remembered

  const query = new URLSearchParams({ question: asked, stockName }).toString()
  const rows = await get<(NewsHitResponse | null)[] | null>(`/api/vectordb/search?${query}`)
  if (!Array.isArray(rows)) throw malformedResponse()

  const items = rows
    .flatMap((row) => (typeof row === 'object' && row !== null ? [toHitItem(row)] : []))
    .filter((item) => item.title.trim() !== '' && item.link !== '')
  askMemo.set(memoKey, { savedAt: Date.now(), value: items })
  return items
}

function toHitItem(row: NewsHitResponse): NewsItem {
  const link = safeLink(row.originalLink)
  const publishedAt = new Date(textOf(row.pubDate))
  return {
    title: stripHtml(textOf(row.title)),
    description: stripHtml(textOf(row.description)),
    link,
    source: toSource(link),
    timeAgo: timeAgo(publishedAt.getTime()),
    publishedAt,
  }
}
