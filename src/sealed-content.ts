import type { Transaction } from '@mysten/sui/transactions'

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
}

/** The Move event type used to index published pointers, e.g. for `queryEvents`. */
export function sealedContentEventType(packageId: string): string {
  return `${packageId}::sealed_content::SealedContentPublished`
}
