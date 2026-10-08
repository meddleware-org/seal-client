import { describe, it, expect, vi } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { createNftGateProvider } from '../src/providers/nft-gate.js'
import { timeLockProvider } from '../src/providers/timelock.js'
import { objectIdBytes, u64beBytes, bytesToHex } from '../src/bytes.js'

const GATE = '0x' + '11'.repeat(32)
const NFT = '0x' + '22'.repeat(32)
const PKG = '0x' + 'ab'.repeat(32)
const POLICY = '0x' + 'cc'.repeat(32)
const TARGET = { publishedAt: PKG, policyConfigId: POLICY }

const nftGateProvider = createNftGateProvider()

describe('nftGateProvider', () => {
  it('namespaces the identity to the gate (first 32 bytes) + a nonce', () => {
    const id = nftGateProvider.buildId({ gateId: GATE })
    expect(id.length).toBe(48) // 32-byte gate id + 16-byte nonce
    expect(bytesToHex(id.slice(0, 32))).toBe(bytesToHex(objectIdBytes(GATE)))
  })

  it('builds a seal_approve move call for a transferable pass', () => {
    const tx = new Transaction()
    const id = nftGateProvider.buildId({ gateId: GATE })
    nftGateProvider.buildApprove(tx, TARGET, id, { gateId: GATE, nftId: NFT, soulbound: false })
    const json = JSON.stringify(tx.getData())
    expect(json).toContain('nft_gate')
    expect(json).toContain('seal_approve')
    expect(json).not.toContain('seal_approve_soulbound')
  })

  it('passes (id, PolicyConfig, gate, nft) in that order', () => {
    const tx = new Transaction()
    nftGateProvider.buildApprove(tx, TARGET, nftGateProvider.buildId({ gateId: GATE }), { gateId: GATE, nftId: NFT })
    const data = tx.getData()
    const call = data.commands[0]!.MoveCall!
    expect(call.package).toBe(PKG)
    const objectIds = call.arguments.slice(1).map((a) => (a as { Input: number }).Input).map((i) => data.inputs[i]!.UnresolvedObject?.objectId)
    expect(objectIds).toEqual([POLICY, GATE, NFT])
  })

  it('selects the soulbound entry when requested', () => {
    const tx = new Transaction()
    const id = nftGateProvider.buildId({ gateId: GATE })
    nftGateProvider.buildApprove(tx, TARGET, id, { gateId: GATE, nftId: NFT, soulbound: true })
    expect(JSON.stringify(tx.getData())).toContain('seal_approve_soulbound')
  })

  it('requires an nftId to decrypt', () => {
    const tx = new Transaction()
    const id = nftGateProvider.buildId({ gateId: GATE })
    expect(() => nftGateProvider.buildApprove(tx, TARGET, id, { gateId: GATE })).toThrowError(
      /requires `nftId`/,
    )
  })
})

describe('timeLockProvider', () => {
  it('encodes the unlock time big-endian (first 8 bytes) + a nonce', () => {
    const id = timeLockProvider.buildId({ unlockMs: 256, allowPast: true })
    expect(id.length).toBe(16) // 8-byte unlock + 8-byte nonce
    expect(bytesToHex(id.slice(0, 8))).toBe(bytesToHex(u64beBytes(256)))
  })

  it('nft-gate refuses an empty, 0x-only, non-hex or zero gate id (it would namespace to a gate nobody can unlock)', () => {
    for (const gateId of ['', '0x', '0x0', '0x' + '00'.repeat(32), 'gate', '0xzz', '0x' + 'a'.repeat(65)]) {
      expect(() => nftGateProvider.buildId({ gateId }), gateId).toThrow()
    }
    expect(() => nftGateProvider.buildId({ gateId: '0xa' })).not.toThrow()
  })

  it('builds a timelock seal_approve move call over the Clock', () => {
    const tx = new Transaction()
    const id = timeLockProvider.buildId({ unlockMs: 1000, allowPast: true })
    timeLockProvider.buildApprove(tx, TARGET, id, {})
    const data = tx.getData()
    expect(JSON.stringify(data)).toContain('timelock')
    const call = data.commands[0]!.MoveCall!
    const objectIds = call.arguments.slice(1).map((a) => (a as { Input: number }).Input).map((i) => data.inputs[i]!.UnresolvedObject?.objectId)
    expect(objectIds).toEqual([POLICY, '0x0000000000000000000000000000000000000000000000000000000000000006'])
  })

  it('refuses an unlock time that would wrap, or that has already passed', () => {
    expect(() => timeLockProvider.buildId({ unlockMs: 2n ** 64n })).toThrow(/at most/)
    expect(() => timeLockProvider.buildId({ unlockMs: 2 ** 64 })).toThrow(/safe integer/)
    expect(() => timeLockProvider.buildId({ unlockMs: Date.now() - 1000 })).toThrow(/not in the future/)
    expect(() => timeLockProvider.buildId({ unlockMs: 0 })).toThrow(/not in the future/)
    expect(() => timeLockProvider.buildId({ unlockMs: Date.now() + 60_000 })).not.toThrow()
    expect(() => timeLockProvider.buildId({ unlockMs: 2n ** 64n - 1n })).not.toThrow()
    expect(() => timeLockProvider.buildId({ unlockMs: Date.now() - 1000, allowPast: true })).not.toThrow()
  })

  it('requires unlockMs to encrypt', () => {
    expect(() => timeLockProvider.buildId({})).toThrowError(/requires `unlockMs`/)
  })

  it('accepts only the 16-byte [unlock_ms][nonce] layout on decrypt', () => {
    const id = timeLockProvider.buildId({ unlockMs: 1, allowPast: true })
    expect(() => timeLockProvider.verifyId?.(id, {})).not.toThrow()
    expect(() => timeLockProvider.verifyId?.(id.slice(0, 8), {})).toThrowError(/16 bytes/)
  })
})

// F2: the per-policy nonce widths are intentional and documented (see each provider's NONCE_LEN
// comment + SECURITY.md). These assertions lock the widths so a change on this side without the
// matching on-chain `seal_policies` layout change is caught here.
describe('nonce widths (F2)', () => {
  it('nft-gate identity is 32-byte gate id + 16-byte nonce (48 total)', () => {
    const id = nftGateProvider.buildId({ gateId: GATE })
    expect(id.length).toBe(48)
    expect(id.length - objectIdBytes(GATE).length).toBe(16) // nonce width
  })

  it('time-lock identity is 8-byte unlock + 8-byte nonce (16 total)', () => {
    const id = timeLockProvider.buildId({ unlockMs: 1, allowPast: true })
    expect(id.length).toBe(16)
    expect(id.length - u64beBytes(1).length).toBe(8) // nonce width
  })

  it('nonces are unique per encryption (nft-gate)', () => {
    const a = nftGateProvider.buildId({ gateId: GATE })
    const b = nftGateProvider.buildId({ gateId: GATE })
    // Same 32-byte prefix, different 16-byte nonce tail.
    expect(bytesToHex(a.slice(0, 32))).toBe(bytesToHex(b.slice(0, 32)))
    expect(bytesToHex(a.slice(32))).not.toBe(bytesToHex(b.slice(32)))
  })

  it('nonces are unique per encryption (time-lock)', () => {
    const a = timeLockProvider.buildId({ unlockMs: 1000, allowPast: true })
    const b = timeLockProvider.buildId({ unlockMs: 1000, allowPast: true })
    expect(bytesToHex(a.slice(0, 8))).toBe(bytesToHex(b.slice(0, 8)))
    expect(bytesToHex(a.slice(8))).not.toBe(bytesToHex(b.slice(8)))
  })
})

describe('nft-gate verifyId layout', () => {
  it('rejects an id that is not exactly [32-byte gate][16-byte nonce]', () => {
    const p = createNftGateProvider()
    const ok = p.buildId({ gateId: GATE })
    expect(() => p.verifyId(ok, { gateId: GATE })).not.toThrow()
    expect(() => p.verifyId(ok.slice(0, 40), { gateId: GATE })).toThrow(/48 bytes/)
    expect(() => p.verifyId(new Uint8Array([...ok, 0]), { gateId: GATE })).toThrow(/48 bytes/)
  })
})

describe('nft-gate suggest', () => {
  const ORIGINAL = '0x' + 'a1'.repeat(32)
  const CAP = '0x' + '33'.repeat(32)
  const client = (capType: string) => ({
    core: {
      listOwnedObjects: vi.fn(async ({ cursor }: { cursor?: string | null }) =>
        cursor
          ? { objects: [], hasNextPage: false, cursor: null }
          : { objects: [{ objectId: CAP, type: capType, json: { gate_id: GATE } }], hasNextPage: true, cursor: 'p2' },
      ),
      getObject: vi.fn(async () => ({
        object: {
          objectId: GATE,
          type: `${ORIGINAL}::access_gate::Gate`,
          // A complete Gate: access-gate-client's parser rejects one with a missing field.
          json: {
            price_mist: '0',
            payment_recipient: CAP,
            default_uses: '0',
            soulbound: false,
            auto_burn_at_zero: false,
            paused: false,
            frozen: false,
            nft_name: 'Members',
            nft_image_url: '',
            nft_description: '',
            policy: { freeze_requires_unpaused: false, lock_commission_on_freeze: false, pause_blocks_decryption: false, pause_blocks_access: false },
            locked_commission: null,
            free_fee_paid: true,
          },
        },
      })),
    },
  })

  it('lists the gates the account administers, reading every page', async () => {
    const c = client(`${ORIGINAL}::access_gate::AdminCap`)
    const s = await createNftGateProvider(ORIGINAL).suggest!({ account: '0xabc', client: c })
    expect(s).toEqual({ gateId: [{ value: GATE, label: 'Members' }] })
    expect(c.core.listOwnedObjects).toHaveBeenCalledTimes(2)
  })

  it('ignores caps of a look-alike package', async () => {
    const c = client(`0x${'a2'.repeat(32)}::access_gate::AdminCap`)
    expect(await createNftGateProvider(ORIGINAL).suggest!({ account: '0xabc', client: c })).toEqual({})
  })

  it('suggests nothing without an access_gate id or account', async () => {
    const c = client(`${ORIGINAL}::access_gate::AdminCap`)
    expect(await createNftGateProvider().suggest!({ account: '0xabc', client: c })).toEqual({})
    expect(await createNftGateProvider(ORIGINAL).suggest!({ account: '', client: c })).toEqual({})
    expect(c.core.listOwnedObjects).not.toHaveBeenCalled()
  })
})
