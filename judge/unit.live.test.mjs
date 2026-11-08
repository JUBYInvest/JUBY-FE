// 화이트박스 단위 판정 — 홈 전체 채팅의 연결 층(api/stomp.ts·api/chat.ts). 가짜 웹소켓과 가짜 시계로 프레임·하트비트·다시 붙기·토큰 재발급의 갈래를 하나씩 지난다.
// unit.test.mjs와 따로 둔다 — 시계를 바꾸고 전역 WebSocket을 갈아 끼워 다른 판정과 섞이지 않게.
//   cd judge && node --import ./register.mjs unit.live.test.mjs [--repo DIR]
import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const REPO = process.argv.includes('--repo') ? process.argv[process.argv.indexOf('--repo') + 1] : fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const src = (path) => import(`${REPO}/src/${path}`)

/** 브라우저 WebSocket 흉내. 열기·받기는 판정이 부른다 */
class FakeSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static all = []
  constructor(url) {
    this.url = url
    this.readyState = FakeSocket.CONNECTING
    this.sent = []
    FakeSocket.all.push(this)
  }
  send(data) { this.sent.push(data) }
  close() {
    if (this.readyState === FakeSocket.CLOSED) return
    this.readyState = FakeSocket.CLOSED
    this.onclose?.({})
  }
  /** 서버가 받아 줬다 */
  accept() { this.readyState = FakeSocket.OPEN; this.onopen?.({}) }
  receive(data) { this.onmessage?.({ data }) }
  /** 서버가 STOMP CONNECTED를 보냈다 */
  connected(heartBeat = '0,0') { this.receive(`CONNECTED\nversion:1.2\nheart-beat:${heartBeat}\n\n\0`) }
  /** 보낸 프레임(끝 \0 뗀 것)을 명령·머리·본문으로 */
  frames() {
    return this.sent.filter((s) => s !== '\n').map((raw) => {
      const [head, body = ''] = raw.replace(/\0$/, '').split('\n\n')
      const [command, ...lines] = head.split('\n')
      return { command, headers: Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)])), body }
    })
  }
  subscriptionOf(destination) { return this.frames().find((f) => f.command === 'SUBSCRIBE' && f.headers.destination === destination)?.headers.id }
}
const realSocket = globalThis.WebSocket
const last = () => FakeSocket.all.at(-1)
const message = (subscription, body) => `MESSAGE\ndestination:/x\nsubscription:${subscription}\nmessage-id:1\n\n${body}\0`

beforeEach(() => {
  FakeSocket.all = []
  globalThis.WebSocket = FakeSocket
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.UTC(2026, 10, 7, 3, 0, 0) })
})
afterEach(() => {
  mock.timers.reset()
  globalThis.WebSocket = realSocket
})

describe('api/stomp — 프레임·하트비트', async () => {
  const { openStomp } = await src('api/stomp.ts')
  const handlers = () => {
    const log = []
    return { log, onConnect: () => log.push('connect'), onError: (code) => log.push(`error:${code}`), onClose: () => log.push('close') }
  }

  test('열리면 CONNECT(판·하트비트·host·머리), CONNECTED 뒤에야 구독·보내기', () => {
    const h = handlers()
    const session = openStomp('wss://api.example.test/ws/live-chat', { Authorization: 'Bearer tok' }, h)
    assert.equal(session.send('/app/x', '{}'), false, '열리기 전엔 보내지 않는다')
    last().accept()
    const [connect] = last().frames()
    assert.equal(connect.command, 'CONNECT')
    assert.deepEqual(connect.headers, { 'accept-version': '1.2', 'heart-beat': '10000,10000', host: 'api.example.test', Authorization: 'Bearer tok' })
    assert.ok(last().sent[0].endsWith('\0'))
    session.subscribe('/topic/a', () => {})
    assert.equal(last().frames().length, 1, 'CONNECTED 전 구독은 보내지 않는다')
    assert.equal(session.send('/app/x', '{}'), false)
    last().connected()
    assert.deepEqual(h.log, ['connect'])
    session.subscribe('/topic/a', () => {})
    assert.equal(session.send('/app/live-chat/messages', '{"content":"hi"}'), true)
    const [, sub, send] = last().frames()
    assert.deepEqual(sub, { command: 'SUBSCRIBE', headers: { id: 'sub-1', destination: '/topic/a', ack: 'auto' }, body: '' })
    assert.deepEqual(send, { command: 'SEND', headers: { destination: '/app/live-chat/messages', 'content-type': 'application/json' }, body: '{"content":"hi"}' })
  })

  test('웹소켓 메시지 하나에 프레임 둘·프레임 반쪽·하트비트 줄바꿈을 모두 읽는다', () => {
    const got = []
    const session = openStomp('wss://h/ws', {}, handlers())
    last().accept()
    last().connected()
    session.subscribe('/topic/a', (body) => got.push(`a:${body}`))
    session.subscribe('/topic/b', (body) => got.push(`b:${body}`))
    last().receive(message('sub-1', 'one') + '\n' + message('sub-2', 'two'))
    const third = message('sub-1', '{"x":"세 번째"}')
    last().receive(third.slice(0, 20))
    assert.deepEqual(got, ['a:one', 'b:two'], '반쪽은 \\0이 올 때까지 모은다')
    last().receive(third.slice(20))
    last().receive('\n')
    last().receive('\r\n')
    last().receive(message('sub-9', 'nobody'))
    assert.deepEqual(got, ['a:one', 'b:two', 'a:{"x":"세 번째"}'])
  })

  test('ERROR 프레임: 머리의 escape를 풀어 코드를 알리고 끊는다(끊김도 한 번 알린다)', () => {
    const h = handlers()
    openStomp('wss://h/ws', {}, h)
    last().accept()
    last().receive('ERROR\nmessage:AUTH401\\c1\n\n\0')
    assert.deepEqual(h.log, ['error:AUTH401:1', 'close'])
    assert.equal(last().readyState, FakeSocket.CLOSED)
  })

  test('CONNECTED가 10초 안에 안 오면 끊고 한 번 알린다', () => {
    const h = handlers()
    openStomp('wss://h/ws', {}, h)
    last().accept()
    mock.timers.tick(9_999)
    assert.deepEqual(h.log, [])
    mock.timers.tick(1)
    assert.deepEqual(h.log, ['close'])
    assert.equal(last().readyState, FakeSocket.CLOSED)
  })

  test('하트비트: 10초마다 줄바꿈을 보내고, 받는 쪽이 20초 넘게 조용하면 죽은 연결로 끊는다', () => {
    const h = handlers()
    openStomp('wss://h/ws', {}, h)
    last().accept()
    last().connected('10000,10000')
    mock.timers.tick(10_000)
    assert.equal(last().sent.filter((s) => s === '\n').length, 1)
    last().receive('\n')
    mock.timers.tick(20_000)
    assert.deepEqual(h.log, ['connect'], '15초 전에 받았으니 살아 있다')
    mock.timers.tick(10_000)
    assert.deepEqual(h.log, ['connect', 'close'])
  })

  test('서버가 하트비트를 원치 않으면(0,0) 보내지도 기다리지도 않는다', () => {
    const h = handlers()
    openStomp('wss://h/ws', {}, h)
    last().accept()
    last().connected('0,0')
    mock.timers.tick(120_000)
    assert.equal(last().sent.filter((s) => s === '\n').length, 0)
    assert.deepEqual(h.log, ['connect'])
  })

  test('부르는 쪽이 닫으면 DISCONNECT를 보내고 끊김은 알리지 않는다', () => {
    const h = handlers()
    const session = openStomp('wss://h/ws', {}, h)
    last().accept()
    last().connected()
    session.close()
    assert.equal(last().frames().at(-1).command, 'DISCONNECT')
    assert.deepEqual(h.log, ['connect'])
  })

  test('웹소켓을 만들지 못하면(잘못된 주소) 던지지 않고 다음 틱에 끊김을 알린다', () => {
    globalThis.WebSocket = class { constructor() { throw new SyntaxError('bad url') } }
    const h = handlers()
    const warn = mock.method(console, 'warn', () => {})
    const session = openStomp('nope', {}, h)
    assert.equal(session.send('/x', ''), false)
    mock.timers.tick(0)
    assert.deepEqual(h.log, ['close'])
    warn.mock.restore()
  })
})

describe('api/chat openLiveChat — 상태·다시 붙기·재발급', async () => {
  const { openLiveChat, loadChatPage } = await src('api/chat.ts')
  const auth = await src('utils/auth.ts')
  const calls = []
  let responder = () => ({ status: 200, body: { isSuccess: true, code: 'OK', message: '', result: null } })
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const reply = await responder(String(url), init)
    const text = JSON.stringify(reply.body)
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, text: async () => text, json: async () => JSON.parse(text) }
  }
  const ok = (result) => ({ status: 200, body: { isSuccess: true, code: 'OK', message: 'ok', result } })
  const fail = (status, code) => ({ status, body: { isSuccess: false, code, message: 'x', result: null } })
  const open = () => {
    const log = { status: [], messages: [], errors: [], signedOut: 0 }
    const chat = openLiveChat({
      onStatus: (s) => log.status.push(s),
      onMessage: (m) => log.messages.push(m),
      onSendError: (code) => log.errors.push(code),
      onSignedOut: () => { log.signedOut += 1 },
    })
    return { chat, log }
  }
  /** 마이크로태스크(재발급 fetch)까지 흘려 보낸다 */
  const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve() }
  beforeEach(() => { calls.length = 0; auth.clearTokens(); mock.method(console, 'warn', () => {}) })
  afterEach(() => mock.restoreAll())

  test('처음은 "connecting", CONNECTED면 "live"이고 /topic·/user/queue/errors를 구독한다. 주소는 백엔드로 곧장(wss)', () => {
    const { chat, log } = open()
    assert.equal(last().url, 'wss://api.example.test/ws/live-chat')
    last().accept()
    last().connected()
    assert.deepEqual(log.status, ['connecting', 'live'])
    assert.deepEqual(last().frames().filter((f) => f.command === 'SUBSCRIBE').map((f) => f.headers.destination), ['/topic/live-chat', '/user/queue/errors'])
    assert.equal(last().frames()[0].headers.Authorization, undefined, '토큰이 없으면 읽기 전용으로 붙는다')
    chat.close()
  })

  test('받은 말: 한국 시각 글자를 ms로, 빈 닉네임은 "알 수 없음", 모양이 틀리면 버린다', () => {
    const { chat, log } = open()
    last().accept()
    last().connected()
    const topic = last().subscriptionOf('/topic/live-chat')
    last().receive(message(topic, JSON.stringify({ messageId: 7, writerNickname: '  ', content: '안녕', createdAt: '2026-11-07T12:00:00' })))
    last().receive(message(topic, JSON.stringify({ messageId: '8', content: 'x', createdAt: '2026-11-07T12:00:00' })))
    last().receive(message(topic, 'not json'))
    assert.deepEqual(log.messages, [{ id: 7, author: '알 수 없음', text: '안녕', at: Date.UTC(2026, 10, 7, 3, 0, 0) }])
    chat.close()
  })

  test('보내기: 붙어 있을 때만 SEND {content}', () => {
    const { chat } = open()
    assert.equal(chat.send('먼저'), false)
    last().accept()
    last().connected()
    assert.equal(chat.send('안녕'), true)
    assert.deepEqual(last().frames().at(-1), { command: 'SEND', headers: { destination: '/app/live-chat/messages', 'content-type': 'application/json' }, body: '{"content":"안녕"}' })
    chat.close()
  })

  test('끊기면 1·2·4·8·16초 뒤 다시 붙고, 다섯 번 실패하면 "offline" — "다시 연결"은 곧바로 붙고 횟수를 처음부터 센다', () => {
    const { chat, log } = open()
    last().accept()
    last().connected()
    last().close()
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000]) {
      const before = FakeSocket.all.length
      mock.timers.tick(wait - 1)
      assert.equal(FakeSocket.all.length, before, `${wait}ms 전엔 붙지 않는다`)
      mock.timers.tick(1)
      assert.equal(FakeSocket.all.length, before + 1)
      last().close()
    }
    assert.deepEqual(log.status, ['connecting', 'live', 'retrying', 'retrying', 'retrying', 'retrying', 'retrying', 'offline'])
    mock.timers.tick(60_000)
    const count = FakeSocket.all.length
    chat.reconnect()
    assert.equal(FakeSocket.all.length, count + 1)
    last().close()
    mock.timers.tick(1_000)
    assert.equal(FakeSocket.all.length, count + 2, '다시 연결 뒤 첫 실패는 1초 뒤')
    chat.close()
  })

  test('붙어 있거나 붙는 중이면 "다시 연결"은 아무것도 하지 않는다. 닫은 뒤에는 다시 붙지 않는다', () => {
    const { chat } = open()
    chat.reconnect()
    assert.equal(FakeSocket.all.length, 1)
    last().accept()
    last().connected()
    chat.reconnect()
    assert.equal(FakeSocket.all.length, 1)
    chat.close()
    mock.timers.tick(60_000)
    assert.equal(FakeSocket.all.length, 1)
  })

  test('CONNECT를 토큰 만료로 거절당하면 재발급한 새 토큰으로 다시 붙는다', async () => {
    auth.saveTokens('old')
    responder = (url) => (url.includes('/api/auth/reissue') ? ok({ accessToken: 'new' }) : fail(500, 'X'))
    const { chat, log } = open()
    last().accept()
    assert.equal(last().frames()[0].headers.Authorization, 'Bearer old')
    last().receive('ERROR\nmessage:AUTH401_1\n\n\0')
    await flush()
    assert.equal(calls.filter((c) => c.url.includes('/api/auth/reissue')).length, 1)
    last().accept()
    assert.equal(last().frames()[0].headers.Authorization, 'Bearer new')
    last().connected()
    assert.deepEqual(log.status, ['connecting', 'retrying', 'live'])
    assert.equal(log.signedOut, 0)
    chat.close()
  })

  test('재발급이 안 되면 읽기 전용(토큰 없이)으로 붙고 알린다 — 보내기는 막는다', async () => {
    auth.saveTokens('old')
    responder = (url) => (url.includes('/api/auth/reissue') ? fail(401, 'AUTH401_2') : fail(500, 'X'))
    const { chat, log } = open()
    last().accept()
    last().receive('ERROR\nmessage:AUTH401_5\n\n\0')
    await flush()
    assert.equal(log.signedOut, 1)
    last().accept()
    assert.equal(last().frames()[0].headers.Authorization, undefined)
    last().connected()
    assert.equal(chat.send('안녕'), false)
    chat.close()
  })

  test('새 토큰도 거절당하면 또 재발급하지 않는다(재발급·연결이 끝없이 돌지 않게)', async () => {
    auth.saveTokens('old')
    responder = (url) => (url.includes('/api/auth/reissue') ? ok({ accessToken: 'new' }) : fail(500, 'X'))
    const { chat, log } = open()
    last().accept()
    last().receive('ERROR\nmessage:AUTH401_1\n\n\0')
    await flush()
    last().accept()
    last().receive('ERROR\nmessage:AUTH401_2\n\n\0')
    await flush()
    assert.equal(calls.filter((c) => c.url.includes('/api/auth/reissue')).length, 1)
    assert.equal(log.signedOut, 1)
    chat.close()
  })

  test('토큰과 무관한 거절은 다시 붙기 순서를 따른다', () => {
    const { chat, log } = open()
    last().accept()
    last().receive('ERROR\nmessage:SERVER500\n\n\0')
    assert.deepEqual(log.status, ['connecting', 'retrying'])
    mock.timers.tick(1_000)
    assert.equal(FakeSocket.all.length, 2)
    chat.close()
  })

  test('붙은 뒤 내 실패(/user/queue/errors): 코드를 알리고, 토큰 만료면 재발급해 다시 붙는다', async () => {
    auth.saveTokens('old')
    responder = (url) => (url.includes('/api/auth/reissue') ? ok({ accessToken: 'new' }) : fail(500, 'X'))
    const { chat, log } = open()
    last().accept()
    last().connected()
    const errors = last().subscriptionOf('/user/queue/errors')
    last().receive(message(errors, '{"code":"LIVECHAT429_1"}'))
    last().receive(message(errors, 'broken'))
    assert.deepEqual(log.errors, ['LIVECHAT429_1', ''])
    assert.equal(FakeSocket.all.length, 1)
    last().receive(message(errors, '{"code":"AUTH401_1"}'))
    await flush()
    assert.equal(FakeSocket.all.length, 2)
    last().accept()
    assert.equal(last().frames()[0].headers.Authorization, 'Bearer new')
    chat.close()
  })

  test('지난 대화 한 쪽: 오래된 순 그대로, hasNext일 때만 커서, 틀린 줄은 뺀다', async () => {
    responder = (url) => {
      assert.match(url, /\/api\/live-chat\/messages\?size=50(&cursor=9)?$/)
      return ok({ messages: [{ messageId: 1, writerNickname: 'a', content: 'x', createdAt: '2026-11-07T09:00:00' }, { messageId: 2, content: 'no time' }], nextCursor: 1, hasNext: url.includes('cursor') ? false : true })
    }
    const first = await loadChatPage(null)
    assert.deepEqual(first.messages.map((m) => m.id), [1])
    assert.equal(first.nextCursor, 1)
    assert.equal((await loadChatPage(9)).nextCursor, null)
    responder = () => ok({ nope: true })
    await assert.rejects(loadChatPage(null))
  })
})
