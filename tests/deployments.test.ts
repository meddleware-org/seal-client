import { describe, it, expect } from 'vitest'
import { SEAL_POLICIES_DEPLOYMENTS, sealPoliciesDeployment } from '../src/deployments.js'

describe('deployments', () => {
  it('records testnet with full-length ids', () => {
    const t = sealPoliciesDeployment('testnet')
    expect(t.originalId).toMatch(/^0x[0-9a-f]{64}$/)
    expect(t.publishedAt).toMatch(/^0x[0-9a-f]{64}$/)
    expect(SEAL_POLICIES_DEPLOYMENTS.testnet).toBe(t)
  })

  it('throws for a network without a deployment', () => {
    expect(() => sealPoliciesDeployment('devnet')).toThrow(/no seal_policies deployment recorded/)
  })
})
