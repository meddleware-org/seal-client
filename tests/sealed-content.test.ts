import { describe, it, expect, vi } from 'vitest'
import { bcs } from '@mysten/sui/bcs'
import { Transaction } from '@mysten/sui/transactions'
import { toBase64 } from '@mysten/sui/utils'
import type { CoreEventEntry } from '@meddleware/access-gate-client'
import {
  buildPublishSealedContentTransaction,
  buildPublishSealedContentTx,
  listSealedContent,
  parseSealedContentEvent,
  SEALED_CONTENT_LIMITS,
  sealedContentEventType,
  type SealEventsClient,
} from '../src/sealed-content.js'

const PKG = '0x' + '42'.repeat(32)
const POLICY = '0x' + 'ee'.repeat(32)
const TARGET = { publishedAt: PKG, policyConfigId: POLICY }
const GATE = '0x' + 'ab'.repeat(32)
const base = { gateId: GATE, blobId: 'b'.repeat(43), sealId: '0x' + 'cd'.repeat(48), label: 'Episode 1' }

describe('buildPublishSealedContentTx limits (mirror the Move constants)', () => {
  it('accepts every field at its limit', () => {
    const tx = new Transaction()
    buildPublishSealedContentTx(tx, TARGET, {
      ...base,
      label: 'l'.repeat(SEALED_CONTENT_LIMITS.label),
      blobId: 'b'.repeat(SEALED_CONTENT_LIMITS.blobId),
      sealId: 's'.repeat(SEALED_CONTENT_LIMITS.sealId),
    })
    expect(JSON.stringify(tx.getData())).toContain('sealed_content')
  })

  it('counts UTF-8 bytes, not characters', () => {
    // 129 × "é" (2 bytes each) = 258 bytes > 256.
    expect(() => buildPublishSealedContentTx(new Transaction(), TARGET, { ...base, label: 'é'.repeat(129) })).toThrow(
      /label is 258 bytes/,
    )
  })

  it('rejects an over-long blob id and seal id before building', () => {
    expect(() => buildPublishSealedContentTx(new Transaction(), TARGET, { ...base, blobId: 'b'.repeat(129) })).toThrow(/blobId/)
    expect(() => buildPublishSealedContentTx(new Transaction(), TARGET, { ...base, sealId: 's'.repeat(257) })).toThrow(/sealId/)
  })
})

describe('buildPublishSealedContentTransaction', () => {
  it('returns a complete transaction calling publish at the given package', () => {
    const json = JSON.stringify(buildPublishSealedContentTransaction(TARGET, base).getData())
    expect(json).toContain('"module":"sealed_content"')
    expect(json).toContain('"function":"publish"')
    // PolicyConfig (version gate) is the first argument.
    const data = buildPublishSealedContentTransaction(TARGET, base).getData()
    const first = data.commands[0].MoveCall!.arguments[0] as { Input: number }
    expect(data.inputs[first.Input].UnresolvedObject?.objectId).toBe(POLICY)
  })
})

// Test-side encoder, written from the Move struct independently of the parser's layout.
const Published = bcs.struct('SealedContentPublished', {
  content_id: bcs.Address,
  gate_id: bcs.Address,
  blob_id: bcs.string(),
  seal_id: bcs.string(),
  label: bcs.string(),
  publisher: bcs.Address,
})
const OTHER_GATE = '0x' + 'ef'.repeat(32)
let seq = 0
function event(gateId: string, label = 'Episode', pkg = PKG): CoreEventEntry {
  return {
    eventType: `${pkg}::sealed_content::SealedContentPublished`,
    sender: '0x1',
    bcs: Published.serialize({
      content_id: '0x' + '0c'.repeat(32),
      gate_id: gateId,
      blob_id: 'blob',
      seal_id: 'seal',
      label,
      publisher: '0x' + '0d'.repeat(32),
    }).toBytes(),
    checkpoint: '7',
    transactionDigest: `tx${++seq}`,
    eventIndex: 0,
  }
}

function eventsClient(pages: CoreEventEntry[][]) {
  const listEvents = vi.fn(async ({ before }: { before?: string | null }) => {
    const i = before ? Number(before) : 0
    const hasNextPage = i + 1 < pages.length
    return { events: pages[i] ?? [], hasNextPage, endCursor: hasNextPage ? String(i + 1) : null }
  })
  return { core: { listEvents } } satisfies SealEventsClient
}

describe('parseSealedContentEvent', () => {
  it('decodes a pointer with its transaction', () => {
    expect(parseSealedContentEvent(event(GATE, 'Ep 2'), PKG)).toMatchObject({
      gateId: GATE,
      label: 'Ep 2',
      blobId: 'blob',
      sealId: 'seal',
      txDigest: expect.stringMatching(/^tx/),
      checkpoint: '7',
    })
  })

  it('rejects the same event name from a look-alike package', () => {
    expect(parseSealedContentEvent(event(GATE, 'x', '0x' + '43'.repeat(32)), PKG)).toBeNull()
  })

  it('names the event at the normalised original id', () => {
    expect(sealedContentEventType('0x42')).toBe(`0x${'0'.repeat(62)}42::sealed_content::SealedContentPublished`)
  })
})

describe('listSealedContent', () => {
  it('pages the full node, keeps only the gate, and returns a cursor', async () => {
    const client = eventsClient([[event(OTHER_GATE)], [event(GATE, 'a')], [event(GATE, 'b')]])
    const page = await listSealedContent(client, { originalId: PKG, gateId: GATE, limit: 1 })
    expect(page.pointers.map((p) => p.label)).toEqual(['a'])
    expect(page.cursor).toEqual({ source: 'rpc', value: '2' })
    expect(client.core.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { eventType: sealedContentEventType(PKG) }, order: 'descending' }),
    )
  })

  it('reads the indexer and falls back to the full node on a first page', async () => {
    const ok = vi.fn(async () =>
      Response.json({
        events: [event(GATE, 'idx'), event(OTHER_GATE)].map((e) => ({ ...e, bcs: toBase64(e.bcs as Uint8Array) })),
        cursor: null,
        indexedFromCheckpoint: '5',
      }),
    )
    const indexed = await listSealedContent(eventsClient([[]]), {
      originalId: PKG,
      gateId: GATE,
      indexer: { url: 'https://i.example', network: 'testnet', fetch: ok as unknown as typeof fetch },
    })
    expect(indexed).toMatchObject({ source: 'indexer', indexedFromCheckpoint: '5' })
    expect(indexed.pointers.map((p) => p.label)).toEqual(['idx'])
    expect(new URL(String((ok.mock.calls[0] as unknown[])[0])).pathname).toBe('/v1/testnet/sealed-content')

    const down = vi.fn(async () => new Response('', { status: 502 }))
    const fallback = await listSealedContent(eventsClient([[event(GATE, 'rpc')]]), {
      originalId: PKG,
      gateId: GATE,
      indexer: { url: 'https://i.example', network: 'testnet', fetch: down as unknown as typeof fetch },
    })
    expect(fallback).toMatchObject({ source: 'rpc', indexerError: 'indexer responded 502' })
    expect(fallback.pointers.map((p) => p.label)).toEqual(['rpc'])
  })

  it('never reads a plain-http indexer (shared reader); the first page comes from the full node', async () => {
    const fetchFn = vi.fn()
    const page = await listSealedContent(eventsClient([[event(GATE, 'rpc')]]), {
      originalId: PKG,
      gateId: GATE,
      indexer: { url: 'http://i.example', network: 'testnet', fetch: fetchFn as unknown as typeof fetch },
    })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(page).toMatchObject({ source: 'rpc', indexerError: expect.stringMatching(/https/) })
  })
})
