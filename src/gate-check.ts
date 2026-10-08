import { normalizeStructTag, normalizeSuiAddress } from '@mysten/sui/utils'
import type { SealSuggestClient } from './types.js'

/**
 * Check that `gateId` is a `Gate` of the `access_gate` package whose original id is
 * `accessGateOriginalId` (the one `seal_policies` links). Sealing to anything else (a typo, a
 * non-gate object, a gate of a superseded package) succeeds but can never be unlocked, because
 * `nft_gate::seal_approve` only accepts the linked package's `Gate` type.
 *
 * @throws {Error} if the object cannot be read or is not that package's `Gate`.
 */
export async function assertLinkedGate(client: SealSuggestClient, gateId: string, accessGateOriginalId: string): Promise<void> {
  const { object } = await client.core.getObject({ objectId: normalizeSuiAddress(gateId) })
  const want = normalizeStructTag(`${normalizeSuiAddress(accessGateOriginalId)}::access_gate::Gate`)
  const have = object.type ? normalizeStructTag(object.type) : undefined
  if (have !== want) {
    throw new Error(`seal-client: ${gateId} is not a Gate of the linked access_gate package; content sealed to it could never be decrypted.`)
  }
}
