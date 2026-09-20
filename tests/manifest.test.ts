import { describe, it, expect } from 'vitest'
import { parseSealedManifest, SealedManifestError } from '../src/manifest.js'

const valid = {
  policyType: 'nft-gate',
  id: 'deadbeef',
  blobId: 'blob123',
  network: 'testnet',
  params: { gateId: '0x1' },
  label: 'my file',
}

describe('parseSealedManifest', () => {
  it('accepts a well-formed manifest object', () => {
    const m = parseSealedManifest(valid)
    expect(m.policyType).toBe('nft-gate')
    expect(m.id).toBe('deadbeef')
    expect(m.params).toEqual({ gateId: '0x1' })
    expect(m.label).toBe('my file')
  })

  it('accepts a well-formed JSON string', () => {
    expect(parseSealedManifest(JSON.stringify(valid)).blobId).toBe('blob123')
  })

  it('accepts a minimal manifest without optional fields', () => {
    const { params, label, ...minimal } = valid
    const m = parseSealedManifest(minimal)
    expect(m.params).toBeUndefined()
    expect(m.label).toBeUndefined()
  })

  it('rejects invalid JSON', () => {
    expect(() => parseSealedManifest('{ not json')).toThrow(SealedManifestError)
  })

  it('rejects non-objects', () => {
    expect(() => parseSealedManifest(null)).toThrow(SealedManifestError)
    expect(() => parseSealedManifest(42)).toThrow(SealedManifestError)
    expect(() => parseSealedManifest([valid])).toThrow(SealedManifestError)
  })

  it.each(['policyType', 'id', 'blobId', 'network'])('rejects a missing %s', (key) => {
    const bad = { ...valid } as Record<string, unknown>
    delete bad[key]
    expect(() => parseSealedManifest(bad)).toThrow(SealedManifestError)
  })

  it.each(['policyType', 'id', 'blobId', 'network'])('rejects an empty %s', (key) => {
    expect(() => parseSealedManifest({ ...valid, [key]: '' })).toThrow(SealedManifestError)
  })

  it('rejects a non-object params', () => {
    expect(() => parseSealedManifest({ ...valid, params: 'nope' })).toThrow(SealedManifestError)
  })

  it('rejects a non-string label', () => {
    expect(() => parseSealedManifest({ ...valid, label: 5 })).toThrow(SealedManifestError)
  })
})
