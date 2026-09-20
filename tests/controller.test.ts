import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub @mysten/seal so no key-server IO happens: SealClient.decrypt returns bytes, and
// SessionKey.create returns a fake key. We only care about the SessionKey caching/eviction here.
// `vi.hoisted` makes createSpy available inside the hoisted vi.mock factory.
const { createSpy } = vi.hoisted(() => ({
  createSpy: vi.fn(async () => ({
    getPersonalMessage: () => new Uint8Array([1, 2, 3]),
    setPersonalMessageSignature: vi.fn(async () => {}),
  })),
}))

vi.mock('@mysten/seal', () => ({
  SealClient: class {
    constructor(_: unknown) {}
    async decrypt() {
      return new Uint8Array([9])
    }
    async encrypt() {
      return { encryptedObject: new Uint8Array() }
    }
  },
  SessionKey: { create: createSpy },
}))

import { SealController } from '../src/controller.js'
import { PolicyRegistry } from '../src/registry.js'
import type { SealPolicyProvider } from '../src/types.js'
import { createNftGateProvider } from '../src/providers/nft-gate.js'
import { bytesToHex, objectIdBytes, concatBytes, randomBytes } from '../src/bytes.js'

// A no-op provider so decrypt builds an empty PTB (no object resolution → no suiClient IO).
const noopProvider: SealPolicyProvider = {
  type: 'noop',
  buildId: () => new Uint8Array([0]),
  buildApprove: () => {},
  describe: () => ({ type: 'noop', label: '', help: '', encryptFields: [], decryptFields: [] }),
}

function makeController() {
  const registry = new PolicyRegistry().register(noopProvider)
  const suiClient = {} as never
  const cfg = { suiClient, packageId: '0x1', serverConfigs: [], threshold: 1 }
  return new SealController(cfg, registry)
}

const opts = { address: '0xabc', signPersonalMessage: vi.fn(async () => ({ signature: 'sig' })) }

beforeEach(() => {
  createSpy.mockClear()
  opts.signPersonalMessage.mockClear()
})

describe('nft-gate provider verifyId (F5 — id↔params cross-check)', () => {
  const GATE_ID = '0x' + '0a'.repeat(32)
  const provider = createNftGateProvider()

  it('accepts an id whose first 32 bytes match gateId', () => {
    const idBytes = concatBytes(objectIdBytes(GATE_ID), randomBytes(16))
    expect(() => provider.verifyId!(idBytes, { gateId: GATE_ID })).not.toThrow()
  })

  it('throws when the first 32 bytes do not match gateId', () => {
    const wrongGateId = '0x' + 'ff'.repeat(32)
    const idBytes = concatBytes(objectIdBytes(wrongGateId), randomBytes(16))
    expect(() => provider.verifyId!(idBytes, { gateId: GATE_ID })).toThrow('mismatch')
  })

  it('controller rejects decrypt with mismatched id/params before PTB build', async () => {
    const registry = new PolicyRegistry().register(createNftGateProvider())
    const suiClient = {} as never
    const cfg = { suiClient, packageId: '0x1', serverConfigs: [], threshold: 1 }
    const c = new SealController(cfg, registry)
    const wrongGateId = '0x' + 'ff'.repeat(32)
    const idBytes = concatBytes(objectIdBytes(wrongGateId), randomBytes(16))
    const id = bytesToHex(idBytes)
    await expect(
      c.decrypt('nft-gate', { gateId: GATE_ID, nftId: '0x' + '0b'.repeat(32) }, id, new Uint8Array(), opts),
    ).rejects.toThrow('mismatch')
  })
})

describe('SealController SessionKey lifecycle', () => {
  it('mints the SessionKey once and reuses it across decrypts (cache hit)', async () => {
    const c = makeController()
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(opts.signPersonalMessage).toHaveBeenCalledTimes(1)
  })

  it('re-mints after clearSession(address) — a disconnect never reuses a stale key', async () => {
    const c = makeController()
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    c.clearSession(opts.address)
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    expect(createSpy).toHaveBeenCalledTimes(2)
  })

  it('clearSession() with no argument evicts every cached session', async () => {
    const c = makeController()
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    c.clearSession()
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    expect(createSpy).toHaveBeenCalledTimes(2)
  })
})
