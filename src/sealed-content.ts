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
 * Append `seal_policies::sealed_content::publish(...)` to `tx`. Sharing a `SealedContent` makes the
 * content discoverable by a gate's pass-holders (via the `SealedContentPublished` event). The
 * pointer grants nothing on its own — confidentiality is enforced by Seal + `nft_gate`.
 */
export function buildPublishSealedContentTx(
  tx: Transaction,
  packageId: string,
  input: SealedContentInput,
): void {
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
