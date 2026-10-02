import { describe, it, expect } from 'vitest'
import { BUILDERS, PROVIDERS, allMoveCalls, exportedBuilders, registeredPolicies, PKG } from './abi-table.js'

describe('ABI table (feeds the testnet drift check)', () => {
  it('covers every exported transaction builder', () => {
    expect(Object.keys(BUILDERS).sort()).toEqual(exportedBuilders)
  })

  it('covers every policy in the default registry', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(registeredPolicies)
  })

  it('every call targets the given package, and each provider calls its own module', () => {
    const calls = allMoveCalls()
    for (const c of calls) expect(c.package).toBe(PKG)
    expect(calls.map((c) => `${c.module}::${c.function}`).sort()).toEqual([
      'nft_gate::seal_approve',
      'nft_gate::seal_approve_soulbound',
      'sealed_content::publish',
      'timelock::seal_approve',
    ])
  })
})
