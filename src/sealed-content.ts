import { bcs } from '@mysten/sui/bcs'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64, normalizeStructTag, normalizeSuiAddress } from '@mysten/sui/utils'
import type { CoreEventEntry, EventCursor, IndexerSource } from '@meddleware/access-gate-client'

/** Fields needed to publish an on-chain pointer binding sealed content to a gate. */
export interface SealedContentInput {
  /** The access gate object id the content is sealed to. */
  gateId: string
  /** Walrus blob id of the ciphertext. */
  blobId: string
  /** Seal identity (hex) the content was encrypted under. */
  sealId: string
  /** Human-readable label shown in unlock UIs. */
  label: string
}

/**
 * Byte limits `sealed_content::publish` enforces on its strings (mirrors the Move constants
 * `MAX_LABEL_BYTES` / `MAX_BLOB_ID_BYTES` / `MAX_SEAL_ID_BYTES`).
 */
export const SEALED_CONTENT_LIMITS = Object.freeze({ label: 256, blobId: 128, sealId: 256 })

/**
 * A transaction that publishes one sealed-content pointer (see {@link buildPublishSealedContentTx}).
 * `packageId` is the call target: the package's latest published-at.
 *
 * @throws {Error} if a string exceeds its {@link SEALED_CONTENT_LIMITS} byte limit.
 */
export function buildPublishSealedContentTransaction(packageId: string, input: SealedContentInput): Transaction {
  const tx = new Transaction()
  buildPublishSealedContentTx(tx, packageId, input)
  return tx
}

/**
 * Append `seal_policies::sealed_content::publish(...)` to `tx`. Sharing a `SealedContent` makes the
 * content discoverable by a gate's pass-holders (via the `SealedContentPublished` event). The
 * pointer grants nothing on its own — confidentiality is enforced by Seal + `nft_gate`.
 *
 * @throws {Error} if a string exceeds its {@link SEALED_CONTENT_LIMITS} byte limit (UTF-8), which
 *   the Move function would reject.
 */
export function buildPublishSealedContentTx(
  tx: Transaction,
  packageId: string,
  input: SealedContentInput,
): void {
  const enc = new TextEncoder()
  for (const [field, max] of Object.entries(SEALED_CONTENT_LIMITS) as [keyof typeof SEALED_CONTENT_LIMITS, number][]) {
    const bytes = enc.encode(input[field]).length
    if (bytes > max) {
      throw new Error(`seal-client: ${field} is ${bytes} bytes; sealed_content::publish accepts at most ${max}`)
    }
  }
  tx.moveCall({
    target: `${packageId}::sealed_content::publish`,
    arguments: [
      tx.pure.id(input.gateId),
      tx.pure.string(input.blobId),
      tx.pure.string(input.sealId),
      tx.pure.string(input.label),
    ],
  })
}

/** A discovered on-chain pointer to gate-unlockable sealed content. */
export interface SealedContentPointer {
  contentId: string
  gateId: string
  blobId: string
  sealId: string
  label: string
  publisher: string
  /** The publishing transaction, to check the pointer against a full node. */
  txDigest: string
  /** `null` where the transport does not report it. */
  checkpoint: string | null
}

/** The `SealedContentPublished` event type, normalised, at the package's **original id**. */
export function sealedContentEventType(originalId: string): string {
  return `${normalizeSuiAddress(originalId)}::sealed_content::SealedContentPublished`
}

// Decoded from BCS (exact on every transport); mirrors the Move event struct field for field.
const SealedContentPublished = bcs.struct('SealedContentPublished', {
  content_id: bcs.Address,
  gate_id: bcs.Address,
  blob_id: bcs.string(),
  seal_id: bcs.string(),
  label: bcs.string(),
  publisher: bcs.Address,
})

/**
 * Decode one `SealedContentPublished` event, or `null` unless its type is exactly that event of
 * `originalId` (normalised comparison; the same name in another package is rejected).
 *
 * @throws {Error} if the BCS bytes do not decode.
 */
export function parseSealedContentEvent(entry: CoreEventEntry, originalId: string): SealedContentPointer | null {
  let type: string
  try {
    type = normalizeStructTag(entry.eventType)
  } catch {
    return null
  }
  if (type !== sealedContentEventType(originalId)) return null
  const e = SealedContentPublished.parse(typeof entry.bcs === 'string' ? fromBase64(entry.bcs) : entry.bcs)
  return {
    contentId: e.content_id,
    gateId: e.gate_id,
    blobId: e.blob_id,
    sealId: e.seal_id,
    label: e.label,
    publisher: e.publisher,
    txDigest: entry.transactionDigest,
    checkpoint: entry.checkpoint,
  }
}

/** Minimal structural subset of a core Sui client used for event queries (`SuiGrpcClient`). */
export interface SealEventsClient {
  core: {
    listEvents(options: {
      filter?: { eventType: string }
      limit?: number
      before?: string | null
      order?: 'ascending' | 'descending'
    }): Promise<{ events: CoreEventEntry[]; hasNextPage: boolean; endCursor: string | null }>
  }
}

export interface ListSealedContentOptions {
  /** The `seal_policies` package's original id. */
  originalId: string
  gateId: string
  /** Target number of pointers (default 50, at most 200). */
  limit?: number
  /** Continue from a previous page's `cursor`. */
  cursor?: EventCursor | null
  indexer?: IndexerSource
  /** Full-node pages scanned per call (default 20). */
  maxPages?: number
}

export interface SealedContentPage {
  /** Newest first. */
  pointers: SealedContentPointer[]
  /** Pass back as `cursor` for older pointers; `null` when there are none. */
  cursor: EventCursor | null
  source: 'indexer' | 'rpc'
  /** Oldest checkpoint the indexer covers. Indexer pages only. */
  indexedFromCheckpoint?: string
  /** Why the indexer was skipped, when a first page fell back to the full node. */
  indexerError?: string
}

const RPC_PAGE = 50

/**
 * Pointers published for `gateId`, newest first.
 *
 * - With `indexer`, a first page is read from it. If it fails or times out (3 s by default), the
 *   page comes from the full node and `indexerError` says why.
 * - A cursor stays with the source that issued it.
 * - On the full node, events are filtered here by gate. A page can hold up to one full-node page
 *   more than `limit`, or fewer when `maxPages` pages are scanned without filling it.
 *
 * @throws {Error} if the full node (or, for an indexer cursor, the indexer) fails.
 */
export async function listSealedContent(
  client: SealEventsClient,
  options: ListSealedContentOptions,
): Promise<SealedContentPage> {
  const limit = Math.min(Math.max(1, Math.floor(options.limit ?? 50)), 200)
  const { cursor, indexer } = options
  if (indexer && cursor?.source !== 'rpc') {
    try {
      return await listFromIndexer(indexer, options, limit, cursor?.value)
    } catch (e) {
      if (cursor) throw e
      const page = await listFromRpc(client, options, limit, null)
      return { ...page, indexerError: e instanceof Error ? e.message : String(e) }
    }
  }
  if (cursor?.source === 'indexer') throw new Error('seal-client: an indexer cursor needs the indexer option')
  return listFromRpc(client, options, limit, cursor?.value ?? null)
}

async function listFromRpc(
  client: SealEventsClient,
  options: ListSealedContentOptions,
  limit: number,
  before: string | null,
): Promise<SealedContentPage> {
  const gate = normalizeSuiAddress(options.gateId)
  const maxPages = Math.max(1, options.maxPages ?? 20)
  const pointers: SealedContentPointer[] = []
  let cursor = before
  for (let page = 0; page < maxPages; page++) {
    const res = await client.core.listEvents({
      filter: { eventType: sealedContentEventType(options.originalId) },
      limit: RPC_PAGE,
      order: 'descending',
      before: cursor,
    })
    for (const entry of res.events) {
      const pointer = parseSealedContentEvent(entry, options.originalId)
      if (pointer && pointer.gateId === gate) pointers.push(pointer)
    }
    cursor = res.hasNextPage ? res.endCursor : null
    if (!cursor || pointers.length >= limit) break
  }
  return { pointers, cursor: cursor ? { source: 'rpc', value: cursor } : null, source: 'rpc' }
}

async function listFromIndexer(
  indexer: IndexerSource,
  options: ListSealedContentOptions,
  limit: number,
  before: string | undefined,
): Promise<SealedContentPage> {
  const gate = normalizeSuiAddress(options.gateId)
  const url = new URL(
    `v1/${encodeURIComponent(indexer.network)}/sealed-content`,
    indexer.url.endsWith('/') ? indexer.url : `${indexer.url}/`,
  )
  url.searchParams.set('gate', gate)
  if (before) url.searchParams.set('before', before)
  url.searchParams.set('limit', String(limit))

  const res = await (indexer.fetch ?? fetch)(url, { signal: AbortSignal.timeout(indexer.timeoutMs ?? 3000) })
  if (!res.ok) throw new Error(`indexer responded ${res.status}`)
  const body = (await res.json()) as { events?: CoreEventEntry[]; cursor?: string | null; indexedFromCheckpoint?: string }
  if (!Array.isArray(body?.events)) throw new Error('indexer response has no events list')

  // The indexer is display-only: rows still have to be this package's event for this gate.
  const pointers = body.events
    .map((entry) => parseSealedContentEvent(entry, options.originalId))
    .filter((p): p is SealedContentPointer => p !== null && p.gateId === gate)
  return {
    pointers,
    cursor: body.cursor ? { source: 'indexer', value: body.cursor } : null,
    source: 'indexer',
    indexedFromCheckpoint: body.indexedFromCheckpoint,
  }
}
