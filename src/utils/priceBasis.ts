import { toKoreanDate, toKoreanDateTime } from './date'

/** 가격 목록이 어느 때 값인가. 서버는 장중에 종가 자리에 현재가를 넣어 준다(realtime) */
export interface PriceBasis {
  /** YYYYMMDD. 장 밖 값의 거래일 */
  baseDate: string
  /** 서버가 값을 만든 때(ms). 모르면 null */
  asOf: number | null
  realtime: boolean
}

/**
 * 가격 옆에 한 번 적는 기준. 실시간 연결로 값을 받는 중이면 "실시간", 서버가 장중 값을 줬으면 그 시각("11월 5일 11:02 기준"),
 * 아니면 그날 종가("10월 28일 종가 기준"). 날짜를 모르면 ""(그 줄을 숨긴다)
 */
export function basisLabel(basis: PriceBasis, live: boolean): string {
  if (live) return '실시간'
  if (basis.realtime) return basis.asOf !== null && toKoreanDateTime(basis.asOf) !== '' ? `${toKoreanDateTime(basis.asOf)} 기준` : '장중 현재가'
  const date = toKoreanDate(basis.baseDate)
  return date === '' ? '' : `${date} 종가 기준`
}
