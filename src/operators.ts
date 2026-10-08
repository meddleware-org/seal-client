import { fetchGate } from '@meddleware/access-gate-client'
import type { SuiObjectClient } from '@meddleware/access-gate-client'
import { normalizeSuiAddress } from '@mysten/sui/utils'

/**
 * The addresses to trust as authors of a gate's sealed content: the gate's `payment_recipient` (the
 * address the operator set to receive its income) plus any `extra` addresses the caller vouches for
 * (for example the operator's own publishing wallet, since a pointer's `publisher` is whoever sent
 * the transaction). Pass the result as `listSealedContent({ publishers })`.
 *
 * Seal gives confidentiality, not authenticity: a successful decrypt proves only that the item was
 * sealed to the gate's namespace, not who wrote it. Listing only the operator's pointers is the
 * default a UI should use.
 *
 * @throws {Error} if the gate cannot be read or is not a `Gate` of `accessGateOriginalId`.
 */
export async function gateOperators(
  client: SuiObjectClient,
  gateId: string,
  accessGateOriginalId: string,
  extra: string[] = [],
): Promise<string[]> {
  const gate = await fetchGate(client, gateId, accessGateOriginalId)
  if (!gate) throw new Error(`seal-client: ${gateId} is not a Gate of ${accessGateOriginalId}`)
  return [...new Set([gate.paymentRecipient, ...extra].map((a) => normalizeSuiAddress(a)))]
}
