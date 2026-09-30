import { describe, it, expect } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { buildPublishSealedContentTx, SEALED_CONTENT_LIMITS } from '../src/sealed-content.js'

const PKG = '0x' + '42'.repeat(32)
const GATE = '0x' + 'ab'.repeat(32)
const base = { gateId: GATE, blobId: 'b'.repeat(43), sealId: '0x' + 'cd'.repeat(48), label: 'Episode 1' }

describe('buildPublishSealedContentTx limits (mirror the Move constants)', () => {
  it('accepts every field at its limit', () => {
    const tx = new Transaction()
    buildPublishSealedContentTx(tx, PKG, {
      ...base,
      label: 'l'.repeat(SEALED_CONTENT_LIMITS.label),
      blobId: 'b'.repeat(SEALED_CONTENT_LIMITS.blobId),
      sealId: 's'.repeat(SEALED_CONTENT_LIMITS.sealId),
    })
    expect(JSON.stringify(tx.getData())).toContain('sealed_content')
  })

  it('counts UTF-8 bytes, not characters', () => {
    // 129 × "é" (2 bytes each) = 258 bytes > 256.
    expect(() => buildPublishSealedContentTx(new Transaction(), PKG, { ...base, label: 'é'.repeat(129) })).toThrow(
      /label is 258 bytes/,
    )
  })

  it('rejects an over-long blob id and seal id before building', () => {
    expect(() => buildPublishSealedContentTx(new Transaction(), PKG, { ...base, blobId: 'b'.repeat(129) })).toThrow(/blobId/)
    expect(() => buildPublishSealedContentTx(new Transaction(), PKG, { ...base, sealId: 's'.repeat(257) })).toThrow(/sealId/)
  })
})
