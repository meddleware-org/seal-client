import { describe, it, expect } from 'vitest'
import { hexToBytes, bytesToHex, objectIdBytes, u64beBytes, concatBytes } from '../src/bytes.js'

describe('bytes', () => {
  it('round-trips hex', () => {
    expect(bytesToHex(hexToBytes('0xdeadbeef'))).toBe('deadbeef')
    expect(bytesToHex(hexToBytes('00ff'))).toBe('00ff')
  })

  it('right-aligns short object ids to 32 bytes', () => {
    const b = objectIdBytes('0x6')
    expect(b.length).toBe(32)
    expect(b[31]).toBe(6)
    expect(b[0]).toBe(0)
  })

  it('keeps full 32-byte ids intact', () => {
    const full = '0x' + 'ab'.repeat(32)
    const b = objectIdBytes(full)
    expect(b.length).toBe(32)
    expect(bytesToHex(b)).toBe('ab'.repeat(32))
  })

  it('encodes u64 big-endian', () => {
    expect(Array.from(u64beBytes(1))).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(Array.from(u64beBytes(256))).toEqual([0, 0, 0, 0, 0, 0, 1, 0])
  })

  it('concatenates', () => {
    const out = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]))
    expect(Array.from(out)).toEqual([1, 2, 3])
  })

  it('throws on non-hex characters (F4)', () => {
    expect(() => hexToBytes('0xgg')).toThrow(/non-hex/)
    expect(() => hexToBytes('xyz')).toThrow(/non-hex/)
    expect(() => hexToBytes('dead!!')).toThrow(/non-hex/)
  })

  it('accepts empty input and standard short ids', () => {
    expect(hexToBytes('').length).toBe(0)
    expect(hexToBytes('0x').length).toBe(0)
    // odd-length is left-padded — expected for short ids like 0x6
    expect(hexToBytes('0x6')).toEqual(new Uint8Array([0x06]))
  })
})
