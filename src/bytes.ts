// Small, dependency-free byte helpers. Kept local so the identity-byte layout is defined in
// exactly one place and matches the `seal_policies` Move modules bit-for-bit.

/** Hex (with or without `0x`) → bytes. Odd-length input is left-padded with a nibble. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex
  if (clean.length > 0 && !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`hexToBytes: non-hex characters in input: ${hex}`)
  }
  const padded = clean.length % 2 ? '0' + clean : clean
  const out = new Uint8Array(padded.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** Bytes → lowercase hex (no `0x`). */
export function bytesToHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/** A Sui object id → its canonical 32-byte (right-aligned) representation. */
export function objectIdBytes(id: string): Uint8Array {
  const raw = hexToBytes(id)
  if (raw.length === 32) return raw
  if (raw.length > 32) throw new Error(`object id too long: ${id}`)
  const out = new Uint8Array(32)
  out.set(raw, 32 - raw.length)
  return out
}

/** A u64 → 8 big-endian bytes (matches the on-chain decode in `seal_policies::timelock`). */
export function u64beBytes(v: number | bigint): Uint8Array {
  let n = BigInt(v)
  if (n < 0n) throw new Error('u64 must be non-negative')
  const out = new Uint8Array(8)
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(n & 0xffn)
    n >>= 8n
  }
  return out
}

/** Cryptographically-random bytes (Web Crypto; available in browsers and Node ≥ 18). */
export function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len))
}

/** Concatenate byte arrays. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
