import { readJson, writeJson } from './cache'
import { isSocialType } from './social'
import type { SocialType } from '../types/member'

/**
 * 이 브라우저에서 마지막으로 로그인한 가입 경로(2026-11-02). 로그인 화면이 그 단추에 "최근 사용"을 붙인다 —
 * 소셜 계정마다 JUBY 회원이 따로라 다른 곳으로 로그인하면 새 계정이 생긴다.
 * 누른 단추가 아니라 로그인을 마친 콜백이 서버가 준 값(`socialType`)으로 적는다(누르고 그만두면 적지 않는다).
 * 서버가 가입 경로를 못 알려 주면 지운다 — 지난 값을 두면 이번에 다른 곳으로 들어왔어도 다음에 그 단추를 가리킨다.
 * 로그아웃해도 두고(다음 로그인 때 쓰는 값이다), 탈퇴하면 지운다(가리키던 계정이 없어졌다).
 */
const KEY = 'lastLoginProvider'

export function readLastLoginProvider(): SocialType | null {
  const saved = readJson(KEY)
  return isSocialType(saved) ? saved : null
}

export function rememberLoginProvider(type: SocialType): void {
  writeJson(KEY, type)
}

export function forgetLoginProvider(): void {
  writeJson(KEY, null)
}
