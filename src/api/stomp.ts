/*
 * 최소 STOMP 1.2 클라이언트 — 홈 전체 채팅(api/chat.ts)이 쓴다. 새 의존성(@stomp/stompjs)을 들이지 않으려고 채팅이 쓰는 것만 다룬다:
 * CONNECT → CONNECTED, SUBSCRIBE, SEND, 받는 MESSAGE·ERROR, 하트비트(빈 줄). 한 번 끊기면 끝이다 — 다시 붙는 때는 부르는 쪽이 정한다.
 *
 * 프레임: `명령\n머리:값\n…\n\n본문\0`. 웹소켓 메시지 하나에 프레임이 여럿이거나 반쪽일 수 있어 \0까지 모아 자른다.
 * 하트비트는 서로 10초를 바란다(백엔드 LiveChatWebSocketConfig HEARTBEAT). 받는 쪽이 두 번 넘게 조용하면 죽은 연결로 보고 끊는다 —
 * 와이파이가 바뀌는 때처럼 소켓이 닫힘 신호 없이 멎으면 브라우저는 한참 뒤에야 알려 준다.
 */

interface StompFrame {
  command: string
  headers: Record<string, string>
  body: string
}

interface StompHandlers {
  onConnect: () => void
  /** 서버가 ERROR 프레임을 보냈다(message 머리 = 에러 코드, 예: AUTH401_1). 서버는 그 뒤 연결을 끊는다 */
  onError: (code: string) => void
  /** 연결이 끊겼다(정상·비정상, 열리지도 못한 것까지). 한 번만 부른다. close()로 끊은 때는 부르지 않는다 */
  onClose: () => void
}

export interface StompSession {
  /** CONNECTED 뒤에만 부른다 */
  subscribe: (destination: string, onMessage: (body: string) => void) => void
  /** 보냈으면 true. 아직 연결 전이거나 끊겼으면 false */
  send: (destination: string, body: string) => boolean
  close: () => void
}

const HEARTBEAT_MS = 10_000
/** 열고 나서 이만큼 안에 CONNECTED가 안 오면 끊는다 — 안 그러면 "연결하는 중"에 영영 멈춘다 */
const CONNECT_TIMEOUT_MS = 10_000

/** STOMP 1.2 머리 값 escaping(CONNECT·CONNECTED는 하지 않는다) */
function escapeHeader(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/:/g, '\\c')
}

function unescapeHeader(value: string): string {
  return value.replace(/\\(.)/g, (_, char: string) => (char === 'r' ? '\r' : char === 'n' ? '\n' : char === 'c' ? ':' : char))
}

function serialize(command: string, headers: Record<string, string>, body = ''): string {
  const escape = command === 'CONNECT' ? (value: string) => value : escapeHeader
  const lines = Object.entries(headers).map(([key, value]) => `${escape(key)}:${escape(value)}`)
  return `${command}\n${lines.join('\n')}\n\n${body}\0`
}

/** 프레임 하나(끝의 \0을 뗀 것). 모양이 틀리면 null */
function parseFrame(raw: string): StompFrame | null {
  const text = raw.replace(/^(\r?\n)+/, '')
  if (text === '') return null
  const split = text.search(/\r?\n\r?\n/)
  const head = split === -1 ? text : text.slice(0, split)
  const body = split === -1 ? '' : text.slice(split).replace(/^\r?\n\r?\n/, '')
  const [command, ...lines] = head.split(/\r?\n/)
  if (command === undefined || command === '') return null
  const unescape = command === 'CONNECTED' ? (value: string) => value : unescapeHeader
  const headers: Record<string, string> = {}
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = unescape(line.slice(0, colon))
    // 같은 머리가 두 번 오면 앞의 것을 쓴다(STOMP 1.2)
    if (!(key in headers)) headers[key] = unescape(line.slice(colon + 1))
  }
  return { command, headers, body }
}

/** 서버의 heart-beat 머리("10000,10000")와 우리가 바란 값으로 보낼 간격·기다릴 간격(ms). 0이면 하지 않는다 */
function heartbeatPlan(serverValue: string | undefined): { send: number; expect: number } {
  const [serverSends = 0, serverWants = 0] = (serverValue ?? '0,0').split(',').map((part) => Number.parseInt(part, 10) || 0)
  return {
    send: serverWants > 0 ? Math.max(HEARTBEAT_MS, serverWants) : 0,
    expect: serverSends > 0 ? Math.max(HEARTBEAT_MS, serverSends) : 0,
  }
}

export function openStomp(url: string, connectHeaders: Record<string, string>, handlers: StompHandlers): StompSession {
  let socket: WebSocket
  try {
    socket = new WebSocket(url)
  } catch (error: unknown) {
    console.warn('채팅 연결을 열지 못했습니다', error)
    window.setTimeout(handlers.onClose, 0)
    return { subscribe: () => {}, send: () => false, close: () => {} }
  }
  let connected = false
  let finished = false
  let buffer = ''
  let lastReceived = Date.now()
  let beat: number | undefined
  let nextSubscription = 0
  const listeners = new Map<string, (body: string) => void>()

  const stopTimers = () => {
    if (beat !== undefined) window.clearInterval(beat)
    beat = undefined
    window.clearTimeout(connectTimer)
  }

  const finish = (notify: boolean) => {
    if (finished) return
    finished = true
    connected = false
    stopTimers()
    if (notify) handlers.onClose()
  }

  const startHeartbeat = (plan: { send: number; expect: number }) => {
    const tick = Math.min(...[plan.send, plan.expect].filter((ms) => ms > 0))
    if (!Number.isFinite(tick)) return
    beat = window.setInterval(() => {
      if (plan.send > 0 && socket.readyState === WebSocket.OPEN) socket.send('\n')
      // 바란 간격의 두 배가 넘도록 아무것도 안 왔으면 죽은 연결이다. 닫힘 인사가 끝나기를(반쯤 열린 연결이면 수십 초) 기다리지 않고 곧바로 끝낸다
      if (plan.expect > 0 && Date.now() - lastReceived > plan.expect * 2) {
        finish(true)
        socket.close()
      }
    }, tick)
  }

  const handleFrame = (frame: StompFrame) => {
    if (frame.command === 'CONNECTED') {
      window.clearTimeout(connectTimer)
      connected = true
      startHeartbeat(heartbeatPlan(frame.headers['heart-beat']))
      handlers.onConnect()
    } else if (frame.command === 'MESSAGE') {
      listeners.get(frame.headers.subscription ?? '')?.(frame.body)
    } else if (frame.command === 'ERROR') {
      handlers.onError(frame.headers.message ?? '')
      socket.close()
    }
  }

  socket.onopen = () => {
    socket.send(serialize('CONNECT', { 'accept-version': '1.2', 'heart-beat': `${HEARTBEAT_MS},${HEARTBEAT_MS}`, host: new URL(url).host, ...connectHeaders }))
  }
  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data !== 'string') return
    lastReceived = Date.now()
    buffer += event.data
    let end = buffer.indexOf('\0')
    while (end !== -1) {
      const frame = parseFrame(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      if (frame !== null && !finished) handleFrame(frame)
      end = buffer.indexOf('\0')
    }
    // \0 없이 남은 것이 줄바꿈뿐이면 하트비트다
    if (/^(\r?\n)*$/.test(buffer)) buffer = ''
  }
  socket.onclose = () => finish(true)
  const connectTimer = window.setTimeout(() => {
    if (connected || finished) return
    finish(true)
    socket.close()
  }, CONNECT_TIMEOUT_MS)

  return {
    subscribe: (destination, onMessage) => {
      if (!connected) return
      nextSubscription += 1
      const id = `sub-${nextSubscription}`
      listeners.set(id, onMessage)
      socket.send(serialize('SUBSCRIBE', { id, destination, ack: 'auto' }))
    },
    send: (destination, body) => {
      if (!connected || socket.readyState !== WebSocket.OPEN) return false
      socket.send(serialize('SEND', { destination, 'content-type': 'application/json' }, body))
      return true
    },
    close: () => {
      finish(false)
      if (socket.readyState === WebSocket.OPEN) socket.send(serialize('DISCONNECT', {}))
      socket.close()
    },
  }
}
