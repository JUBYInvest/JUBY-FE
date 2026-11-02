import { readJson, writeJson } from './cache'
import { isSocialType } from '../api/member'
import type { SocialType } from '../types/member'

/**
 * 이 브라우저에서 마지막으로 로그인한 가입 경로(2026-11-02). 로그인 화면이 그 단추에 "최근 사용"을 붙인다 —
 * 소셜 계정마다 JUBY 회원이 따로라 다른 곳으로 로그인하면 새 계정이 생긴다.
 * 누른 단추가 아니라 로그인을 마친 콜백이 서버가 준 값(`socialType`)으로 적는다(누르고 그만두면 적지 않는다).
 * 로그아웃·탈퇴해도 둔다 — 다음 로그인 때 쓰는 값이고, 계정 정보가 아니라 이 브라우저의 기록이다.
 */
const KEY = 'lastLoginProvider'

export function readLastLoginProvider(): SocialType | null {
  const saved = readJson(KEY)
  return isSocialType(saved) ? saved : null
}

export function rememberLoginProvider(type: SocialType): void {
  writeJson(KEY, type)
}
