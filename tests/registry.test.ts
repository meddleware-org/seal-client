import { describe, it, expect } from 'vitest'
import { PolicyRegistry } from '../src/registry.js'
import { createDefaultRegistry } from '../src/default-registry.js'
import { nftGateProvider } from '../src/providers/nft-gate.js'
import { timeLockProvider } from '../src/providers/timelock.js'

describe('PolicyRegistry', () => {
  it('registers, looks up, and lists providers', () => {
    const r = new PolicyRegistry().register(nftGateProvider)
    expect(r.has('nft-gate')).toBe(true)
    expect(r.get('nft-gate').type).toBe('nft-gate')
    expect(r.list().map((p) => p.type)).toEqual(['nft-gate'])
  })

  it('throws a helpful error for unknown types', () => {
    const r = new PolicyRegistry()
    expect(() => r.get('nope')).toThrowError(/Unknown Seal policy type "nope"/)
  })

  it('default registry contains the built-in providers as peers', () => {
    const r = createDefaultRegistry()
    expect(r.list().map((p) => p.type).sort()).toEqual(['nft-gate', 'time-lock'])
    expect(r.get('time-lock')).toBe(timeLockProvider)
  })
})
