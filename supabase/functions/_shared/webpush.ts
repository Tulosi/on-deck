// Web Push sender: payload encryption (RFC 8291, aes128gcm / RFC 8188) and VAPID auth (RFC 8292), on WebCrypto
// only, so it runs the same on Supabase Edge Functions (Deno) and in Node (tests). No third-party library.

const enc = new TextEncoder()

/** Bytes backed by a plain ArrayBuffer, the only kind WebCrypto and fetch bodies accept under TypeScript 5.7+. */
type Bytes = Uint8Array<ArrayBuffer>

export const b64url = {
  encode(bytes: Uint8Array): string {
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(s: string): Bytes {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
    return Uint8Array.from(b, (c) => c.charCodeAt(0))
  },
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** Raw uncompressed P-256 public key (65 bytes) → JWK x / y. */
const xy = (raw: Uint8Array) => ({ x: b64url.encode(raw.slice(1, 33)), y: b64url.encode(raw.slice(33, 65)) })

export interface Subscription {
  endpoint: string
  /** Browser's public key (base64url, 65 bytes raw). */
  p256dh: string
  /** Browser's auth secret (base64url, 16 bytes). */
  auth: string
}

/** Optional fixed inputs, for the RFC 8291 test vector only. */
export interface EncryptOverrides {
  salt?: Bytes
  serverPrivate?: string // base64url d
  serverPublic?: string // base64url raw
}

/** Encrypts a push payload for one subscription → the HTTP request body (aes128gcm, single record). */
export async function encryptPayload(sub: Subscription, payload: Uint8Array, o: EncryptOverrides = {}): Promise<Bytes> {
  const uaPublic = b64url.decode(sub.p256dh)
  const authSecret = b64url.decode(sub.auth)

  // Application server's one-off ECDH key pair.
  let asPrivate: CryptoKey
  let asPublic: Bytes
  if (o.serverPrivate && o.serverPublic) {
    asPublic = b64url.decode(o.serverPublic)
    asPrivate = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', d: o.serverPrivate, ...xy(asPublic), ext: true },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    asPrivate = pair.privateKey
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256))

  // RFC 8291 §3.4: combine the shared secret with the auth secret.
  const prkKey = await hmac(authSecret, shared)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]))
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32)

  // RFC 8188: content encryption key and nonce.
  const salt = o.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const plain = concat(payload, new Uint8Array([2])) // 0x02 = last (only) record, no padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain))

  // Header: salt (16) · record size (uint32, 4096) · key id length (1) · key id = server public key (65).
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  return concat(header, asPublic, cipher)
}

export interface VapidKeys {
  /** Private key as a JWK (EC P-256, with d, x, y). */
  privateJwk: JsonWebKey
  /** Public key, base64url raw (65 bytes) — the same value the browser subscribes with. */
  publicKey: string
  /** Contact for push services: a mailto: or https: URL. */
  subject: string
}

/** RFC 8292 VAPID Authorization header value for an endpoint. */
export async function vapidAuth(endpoint: string, keys: VapidKeys): Promise<string> {
  const header = b64url.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64url.encode(
    enc.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: keys.subject }),
    ),
  )
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64url.encode(sig)}, k=${keys.publicKey}`
}

export interface PushResult {
  status: number
  /** The subscription no longer exists (404 / 410) — delete it. */
  gone: boolean
}

/** Sends one push message. `payload` is JSON (title, body, url, tag …) read by public/push-sw.js. */
export async function sendPush(sub: Subscription, payload: unknown, keys: VapidKeys, ttlSeconds = 24 * 60 * 60): Promise<PushResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'normal',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  await res.body?.cancel()
  return { status: res.status, gone: res.status === 404 || res.status === 410 }
}
