import { describe, it, expect } from 'vitest'
import { objectIdBytes, u64beBytes, bytesToHex } from '../src/bytes.js'
import vectors from './conformance-vectors.json' with { type: 'json' }

// These vectors are shared bit-for-bit with the on-chain decode in
// repos/seal-policies-sui/tests/{nft_gate,timelock}_tests.move. If either side changes an identity
// byte layout, one of these assertions (or the matching Move test) fails — which is the point.
describe('identity byte-layout conformance vectors', () => {
  it('nft-gate: full 32-byte gate id maps to the expected prefix', () => {
    const b = objectIdBytes(vectors.nftGate.gateIdFull)
    expect(b.length).toBe(32)
    expect(bytesToHex(b)).toBe(vectors.nftGate.expectedPrefixHex)
  })

  it('nft-gate: short-form gate id right-aligns to the identical 32-byte prefix', () => {
    const short = objectIdBytes(vectors.nftGate.gateIdShort)
    expect(bytesToHex(short)).toBe(vectors.nftGate.expectedPrefixHex)
    expect(bytesToHex(short)).toBe(bytesToHex(objectIdBytes(vectors.nftGate.gateIdFull)))
  })

  it('timelock: unlock_ms encodes as the expected 8-byte big-endian prefix', () => {
    const b = u64beBytes(vectors.timelock.unlockMs)
    expect(b.length).toBe(8)
    expect(bytesToHex(b)).toBe(vectors.timelock.expectedPrefixHex)
  })
})
