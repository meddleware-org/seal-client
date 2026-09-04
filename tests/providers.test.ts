import { describe, it, expect } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { nftGateProvider } from '../src/providers/nft-gate.js'
import { timeLockProvider } from '../src/providers/timelock.js'
import { objectIdBytes, u64beBytes, bytesToHex } from '../src/bytes.js'

const GATE = '0x' + '11'.repeat(32)
const NFT = '0x' + '22'.repeat(32)
const PKG = '0x' + 'ab'.repeat(32)

describe('nftGateProvider', () => {
  it('namespaces the identity to the gate (first 32 bytes) + a nonce', () => {
    const id = nftGateProvider.buildId({ gateId: GATE })
    expect(id.length).toBe(48) // 32-byte gate id + 16-byte nonce
    expect(bytesToHex(id.slice(0, 32))).toBe(bytesToHex(objectIdBytes(GATE)))
  })

  it('builds a seal_approve move call for a transferable pass', () => {
    const tx = new Transaction()
    const id = nftGateProvider.buildId({ gateId: GATE })
    nftGateProvider.buildApprove(tx, PKG, id, { gateId: GATE, nftId: NFT, soulbound: false })
    const json = JSON.stringify(tx.getData())
    expect(json).toContain('nft_gate')
    expect(json).toContain('seal_approve')
    expect(json).not.toContain('seal_approve_soulbound')
  })

  it('selects the soulbound entry when requested', () => {
    const tx = new Transaction()
    const id = nftGateProvider.buildId({ gateId: GATE })
    nftGateProvider.buildApprove(tx, PKG, id, { gateId: GATE, nftId: NFT, soulbound: true })
    expect(JSON.stringify(tx.getData())).toContain('seal_approve_soulbound')
  })

  it('requires an nftId to decrypt', () => {
    const tx = new Transaction()
    const id = nftGateProvider.buildId({ gateId: GATE })
    expect(() => nftGateProvider.buildApprove(tx, PKG, id, { gateId: GATE })).toThrowError(
      /requires `nftId`/,
    )
  })
})

describe('timeLockProvider', () => {
  it('encodes the unlock time big-endian (first 8 bytes) + a nonce', () => {
    const id = timeLockProvider.buildId({ unlockMs: 256 })
    expect(id.length).toBe(16) // 8-byte unlock + 8-byte nonce
    expect(bytesToHex(id.slice(0, 8))).toBe(bytesToHex(u64beBytes(256)))
  })

  it('builds a timelock seal_approve move call over the Clock', () => {
    const tx = new Transaction()
    const id = timeLockProvider.buildId({ unlockMs: 1000 })
    timeLockProvider.buildApprove(tx, PKG, id, {})
    expect(JSON.stringify(tx.getData())).toContain('timelock')
  })

  it('requires unlockMs to encrypt', () => {
    expect(() => timeLockProvider.buildId({})).toThrowError(/requires `unlockMs`/)
  })
})
