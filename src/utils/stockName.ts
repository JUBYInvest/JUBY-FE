import { normalize } from '../api/stock'
import { STOCK_LIST } from '../api/stockList'

/**
 * 질문 문장에서 종목명을 찾아낸다.
 *
 * 백엔드가 `stock_name`을 별도 파라미터로 요구한다. Pinecone 검색을 종목명으로 필터링하는데
 * 질문에서 종목을 뽑는 로직이 서버에 없어서 프론트가 대신 한다.
 * **서버가 이 추출을 맡게 되면 이 파일은 통째로 지운다.**
 *
 * 목록에 있는 이름만 찾는다. 목록 밖 종목은 어차피 백엔드 벡터DB에도 없다.
 */

/** 로마자·숫자·&만으로 된 이름(SK, LS, KT, KT&G, KODEX 200 …). 영어 단어 안에서도 걸린다 */
const ROMAN_ONLY = /^[a-z0-9&]+$/

/**
 * 로마자 이름은 원문(소문자)에서 앞뒤에 로마자·숫자가 붙지 않은 자리만 맞은 것으로 본다.
 * 띄어쓰기를 지운 글에서 찾으면 "RSI risk"의 SK, "ETF details"의 LS, "task"의 SK를 종목으로 잡아
 * 다른 종목의 뉴스로 답이 만들어졌다. 뒤에 한글이 붙는 "SK어때"는 맞는다.
 * 이름 안 글자 사이의 띄어쓰기("S K", "KODEX 200")는 봐준다.
 */
function romanPattern(key: string): RegExp {
  const body = [...key].map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
  return new RegExp(`(?:^|[^a-z0-9])${body}(?![a-z0-9])`)
}

/*
 * 긴 이름부터 본다. "삼성전자우"를 "삼성전자"로, "한화에어로스페이스"를 "한화"로,
 * "LG에너지솔루션"을 "LG"로 잘못 집는 것을 막는다. 목록이 고정이라 모듈을 읽을 때 한 번만 정렬한다.
 * 비교는 검색창과 같은 정규화(띄어쓰기 제거·소문자)로 한다 — 원문 그대로 찾으면
 * "LG에너지 솔루션"에서 "LG"만 걸리고 "sk하이닉스"는 아예 못 찾았다.
 */
const NAMES_BY_LENGTH = STOCK_LIST.map((stock) => {
  const key = normalize(stock.stockName)
  return { name: stock.stockName, key, pattern: ROMAN_ONLY.test(key) ? romanPattern(key) : null }
}).sort((a, b) => b.key.length - a.key.length)

/** 못 찾으면 빈 문자열. 그때는 화면이 종목명을 같이 적어달라고 안내한다 */
export function findStockName(question: string): string {
  const text = normalize(question)
  const lower = question.toLowerCase()
  return (
    NAMES_BY_LENGTH.find(({ key, pattern }) =>
      pattern === null ? text.includes(key) : pattern.test(lower),
    )?.name ?? ''
  )
}
