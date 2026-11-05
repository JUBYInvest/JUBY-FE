import { readJson, writeJson } from './cache'
import { getAccountId } from './auth'

/*
 * 홈 오른쪽 위 "처음 시작하기" 진행표를 다 마친 계정. 다 마친 회원은 다음부터 진행표 대신
 * 사용설명서 칸을 곧바로 본다 — 안 적어 두면 홈에 올 때마다 성향을 받는 짧은 사이 진행표가 비쳤다가 사용설명서로 바뀐다.
 * 계정마다 따로다(최근 본 백테스트와 같은 까닭 — 한 브라우저에서 두 계정을 쓰면 섞인다).
 */
const KEY = 'startStepsDone'

export function isStartFinished(): boolean {
  const owner = getAccountId()
  if (owner === null) return false
  const saved = readJson(KEY)
  return Array.isArray(saved) && saved.includes(owner)
}

export function rememberStartFinished(): void {
  const owner = getAccountId()
  if (owner === null || isStartFinished()) return
  const saved = readJson(KEY)
  const owners = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []
  writeJson(KEY, [...owners, owner].slice(-10))
}
