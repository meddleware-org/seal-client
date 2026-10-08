import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub @mysten/seal so no key-server IO happens: SealClient.decrypt returns bytes, and
// SessionKey.create returns a fake key. We only care about the SessionKey caching/eviction here.
// `vi.hoisted` makes createSpy available inside the hoisted vi.mock factory.
const { createSpy, parseSpy, encryptSpy } = vi.hoisted(() => ({
  encryptSpy: vi.fn(),
  createSpy: vi.fn(async () => ({
    getPersonalMessage: () => new Uint8Array([1, 2, 3]),
    setPersonalMessageSignature: vi.fn(async () => {}),
  })),
  // The parsed ciphertext header: by default it matches the id '00' under package 0x1.
  parseSpy: vi.fn(() => ({ id: '00', packageId: '0x1' })),
}))

vi.mock('@mysten/seal', () => ({
  SealClient: class {
    constructor(_: unknown) {}
    async decrypt() {
      return new Uint8Array([9])
    }
    async encrypt(args: unknown) {
      encryptSpy(args)
      return { encryptedObject: new Uint8Array() }
    }
  },
  SessionKey: { create: createSpy },
  EncryptedObject: { parse: parseSpy },
}))

import { SealController } from '../src/controller.js'
import { PolicyRegistry } from '../src/registry.js'
import type { SealPolicyProvider } from '../src/types.js'
import { createNftGateProvider } from '../src/providers/nft-gate.js'
import { bytesToHex, objectIdBytes, concatBytes, randomBytes } from '../src/bytes.js'

// A minimal provider: one seal_approve call with a typed pure argument (no object resolution → no
// suiClient IO).
const noopProvider: SealPolicyProvider = {
  type: 'noop',
  buildId: () => new Uint8Array([0]),
  verifyId: () => {},
  buildApprove: (tx, target, idBytes) => {
    tx.moveCall({ target: `${target.publishedAt}::noop::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(idBytes))] })
  },
  describe: () => ({ type: 'noop', label: '', help: '', encryptFields: [], decryptFields: [] }),
}

function makeController() {
  const registry = new PolicyRegistry().register(noopProvider)
  const suiClient = {} as never
  const cfg = { suiClient, originalId: '0x1', publishedAt: '0x1', policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 1 }
  return new SealController(cfg, registry)
}

const opts = { address: '0xabc', signPersonalMessage: vi.fn(async () => ({ signature: 'sig' })) }

beforeEach(() => {
  parseSpy.mockImplementation(() => ({ id: '00', packageId: '0x1' }))
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
    const cfg = { suiClient, originalId: '0x1', publishedAt: '0x1', policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 1 }
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

describe('SealController ciphertext and committee checks', () => {
  it('refuses to decrypt a ciphertext sealed to a different identity', async () => {
    parseSpy.mockImplementation(() => ({ id: 'ff', packageId: '0x1' }))
    await expect(makeController().decrypt('noop', {}, '00', new Uint8Array(), opts)).rejects.toThrow(
      /identity does not match/,
    )
  })

  it('refuses to decrypt a ciphertext sealed under another policy package', async () => {
    parseSpy.mockImplementation(() => ({ id: '00', packageId: '0x2' }))
    await expect(makeController().decrypt('noop', {}, '00', new Uint8Array(), opts)).rejects.toThrow(
      /different policy package/,
    )
  })

  it('rejects a threshold above the total server weight', () => {
    const registry = new PolicyRegistry().register(noopProvider)
    expect(
      () =>
        new SealController(
          { suiClient: {} as never, originalId: '0x1', publishedAt: '0x1', policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 2 },
          registry,
        ),
    ).toThrow(/threshold/)
  })
})

describe('SealController after a package upgrade', () => {
  it('seals and scopes sessions at the original id, and calls seal_approve at published-at', async () => {
    const approveTargets: Array<{ publishedAt: string; policyConfigId: string }> = []
    const recording: SealPolicyProvider = {
      ...noopProvider,
      buildApprove: (tx, target, idBytes, params) => {
        approveTargets.push(target)
        noopProvider.buildApprove(tx, target, idBytes, params)
      },
    }
    const c = new SealController(
      { suiClient: {} as never, originalId: '0x1', publishedAt: '0x9', policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 1 },
      new PolicyRegistry().register(recording),
    )
    await c.decrypt('noop', {}, '00', new Uint8Array(), opts)
    expect(approveTargets).toEqual([{ publishedAt: '0x9', policyConfigId: '0x7' }])
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ packageId: '0x1' }))
  })

  it('refuses a ciphertext sealed under the published-at id instead of the original', async () => {
    parseSpy.mockImplementation(() => ({ id: '00', packageId: '0x9' }))
    const c = new SealController(
      { suiClient: {} as never, originalId: '0x1', publishedAt: '0x9', policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 1 },
      new PolicyRegistry().register(noopProvider),
    )
    await expect(c.decrypt('noop', {}, '00', new Uint8Array(), opts)).rejects.toThrow('different policy package')
  })
})

describe('approve PTB and identity checks (SEAL lens)', () => {
  const ID = '00'
  const sealed = new Uint8Array([1])

  function controllerWith(provider: SealPolicyProvider) {
    const registry = new PolicyRegistry().register(provider)
    const cfg = { suiClient: {} as never, originalId: '0x1', publishedAt: '0x1', policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs' }], threshold: 1 }
    return new SealController(cfg, registry)
  }

  it('refuses an approve PTB with anything but seal_approve* calls to the policy package', async () => {
    const extra: SealPolicyProvider = {
      ...noopProvider,
      type: 'extra',
      buildApprove: (tx, target) => {
        tx.moveCall({ target: `${target.publishedAt}::noop::seal_approve`, arguments: [] })
        tx.moveCall({ target: `${target.publishedAt}::noop::steal`, arguments: [] })
      },
    }
    await expect(controllerWith(extra).decrypt('extra', {}, ID, sealed, opts)).rejects.toThrow(/only seal_approve/)
    const otherPkg: SealPolicyProvider = {
      ...noopProvider,
      type: 'other',
      buildApprove: (tx) => {
        tx.moveCall({ target: `0x${'2'.repeat(64)}::noop::seal_approve`, arguments: [] })
      },
    }
    await expect(controllerWith(otherPkg).decrypt('other', {}, ID, sealed, opts)).rejects.toThrow(/only seal_approve/)
    const empty: SealPolicyProvider = { ...noopProvider, type: 'empty', buildApprove: () => {} }
    await expect(controllerWith(empty).decrypt('empty', {}, ID, sealed, opts)).rejects.toThrow(/empty/)
  })

  it('always runs the provider\'s verifyId before approving', async () => {
    const verifyId = vi.fn(() => {
      throw new Error('layout mismatch')
    })
    const strict: SealPolicyProvider = { ...noopProvider, type: 'strict', verifyId }
    await expect(controllerWith(strict).decrypt('strict', {}, ID, sealed, opts)).rejects.toThrow(/layout mismatch/)
    expect(verifyId).toHaveBeenCalledOnce()
  })
})

describe('encrypt binds to the original id (not published-at) and the configured threshold', () => {
  const ORIGINAL = '0x' + '11'.repeat(32)
  const PUBLISHED = '0x' + '22'.repeat(32)
  const mk = (extra: Record<string, unknown> = {}, suiClient: unknown = {}) =>
    new SealController(
      { suiClient: suiClient as never, originalId: ORIGINAL, publishedAt: PUBLISHED, policyConfigId: '0x7', serverConfigs: [{ objectId: '0xs1' }, { objectId: '0xs2' }], threshold: 2, ...extra },
      new PolicyRegistry().register(noopProvider).register(createNftGateProvider()),
    )

  it('after a package upgrade the namespace is still the ORIGINAL id', async () => {
    encryptSpy.mockClear()
    const { id } = await mk().encrypt('noop', {}, new Uint8Array([1]))
    expect(encryptSpy).toHaveBeenCalledWith(expect.objectContaining({ packageId: ORIGINAL, threshold: 2, id }))
    expect(encryptSpy.mock.calls[0]![0].packageId).not.toBe(PUBLISHED)
  })

  it('reads the gate first and refuses one that is not a Gate of the linked access_gate package', async () => {
    const LINKED = '0x' + 'a5'.repeat(32)
    const GATE = '0x' + '0a'.repeat(32)
    const client = (type?: string, json: Record<string, unknown> = { soulbound: true }) => ({
      core: { getObject: vi.fn(async () => ({ object: { objectId: GATE, type, json } })) },
    })
    encryptSpy.mockClear()
    await mk({ accessGateOriginalId: LINKED }, client(`${LINKED}::access_gate::Gate`)).encrypt('nft-gate', { gateId: GATE }, new Uint8Array([1]))
    expect(encryptSpy).toHaveBeenCalledTimes(1)
    for (const type of [`${'0x' + 'b6'.repeat(32)}::access_gate::Gate`, `${LINKED}::access_gate::AdminCap`, `${LINKED}::other::Gate`, undefined]) {
      encryptSpy.mockClear()
      await expect(mk({ accessGateOriginalId: LINKED }, client(type)).encrypt('nft-gate', { gateId: GATE }, new Uint8Array([1]))).rejects.toThrow(/not a Gate of the linked/)
      expect(encryptSpy).not.toHaveBeenCalled()
    }
  })
})

describe('encrypt and transferable gates', () => {
  const LINKED = '0x' + 'a5'.repeat(32)
  const GATE = '0x' + '0a'.repeat(32)
  const mk = (extra: Record<string, unknown>, json: Record<string, unknown> | null) =>
    new SealController(
      {
        suiClient: { core: { getObject: vi.fn(async () => ({ object: { objectId: GATE, type: `${LINKED}::access_gate::Gate`, json } })) } } as never,
        originalId: '0x' + '11'.repeat(32), publishedAt: '0x' + '22'.repeat(32), policyConfigId: '0x7',
        serverConfigs: [{ objectId: '0xs1' }, { objectId: '0xs2' }], threshold: 2, accessGateOriginalId: LINKED, ...extra,
      },
      new PolicyRegistry().register(createNftGateProvider()),
    )

  it('refuses a gate that mints transferable passes (a holder can freeze one into public access)', async () => {
    encryptSpy.mockClear()
    await expect(mk({}, { soulbound: false }).encrypt('nft-gate', { gateId: GATE }, new Uint8Array([1]))).rejects.toThrow(/transferable passes/)
    await expect(mk({}, null).encrypt('nft-gate', { gateId: GATE }, new Uint8Array([1]))).rejects.toThrow(/transferable passes/)
    expect(encryptSpy).not.toHaveBeenCalled()
  })

  it('seals to a soulbound gate, and to a transferable one only when asked to', async () => {
    encryptSpy.mockClear()
    await mk({}, { soulbound: true }).encrypt('nft-gate', { gateId: GATE }, new Uint8Array([1]))
    await mk({ allowTransferableGates: true }, { soulbound: false }).encrypt('nft-gate', { gateId: GATE }, new Uint8Array([1]))
    expect(encryptSpy).toHaveBeenCalledTimes(2)
  })
})

describe('SessionKey cache timing and coalescing', () => {
  it('counts the early-expiry margin from key creation, not from when the slow signature returns', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const c = makeController()
      const slowSign = vi.fn(async () => {
        vi.advanceTimersByTime(5 * 60_000) // the user takes five minutes to approve
        return { signature: 'sig' }
      })
      await c.decrypt('noop', {}, '00', new Uint8Array(), { address: '0xabc', signPersonalMessage: slowSign })
      createSpy.mockClear()
      // sessionTtlMin default 10 → valid until created + 9 min; now is created + 5 min: still cached.
      await c.decrypt('noop', {}, '00', new Uint8Array(), { address: '0xabc', signPersonalMessage: slowSign })
      expect(createSpy).not.toHaveBeenCalled()
      vi.advanceTimersByTime(4 * 60_000 + 1) // created + 9 min + 1 ms: past the margin
      await c.decrypt('noop', {}, '00', new Uint8Array(), { address: '0xabc', signPersonalMessage: slowSign })
      expect(createSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('concurrent decrypts share one mint and one wallet prompt', async () => {
    const c = makeController()
    const sign = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { signature: 'sig' }
    })
    createSpy.mockClear()
    const o = { address: '0xabc', signPersonalMessage: sign }
    await Promise.all([c.decrypt('noop', {}, '00', new Uint8Array(), o), c.decrypt('noop', {}, '00', new Uint8Array(), o), c.decrypt('noop', {}, '00', new Uint8Array(), o)])
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(sign).toHaveBeenCalledTimes(1)
  })
})
