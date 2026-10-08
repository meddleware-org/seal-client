import { fetchOwnedGates } from '@meddleware/access-gate-client'
import type { SealPolicyProvider, PolicyDescriptor, FieldSuggestion, SuggestContext } from '../types.js'
import { objectIdBytes, randomBytes, concatBytes } from '../bytes.js'

export interface NftGateParams {
  /** Access gate shared object id (0x…). Needed to encrypt AND decrypt. */
  gateId: string
  /** The holder's pass NFT object id. Needed only to decrypt. */
  nftId?: string
  /** Whether the gate mints soulbound passes. Needed only to decrypt. */
  soulbound?: boolean
}

/**
 * Random nonce appended after the 32-byte gate id so each ciphertext gets a unique Seal identity.
 *
 * Width rationale (16 bytes / 128 bits): the 32-byte prefix is the *gate id* — a stable, public
 * value reused for every ciphertext encrypted under that gate. All per-ciphertext uniqueness
 * therefore comes from the nonce alone, so it is sized for a negligible birthday-collision
 * probability across an effectively unbounded ciphertext population per gate. (The identity is not
 * secret — it is stored verbatim in the manifest — so this is a uniqueness/domain-separation
 * budget, not a secrecy budget.) The width is fixed by the on-chain `seal_policies::nft_gate`
 * identity layout `[32-byte gate id][16-byte nonce]`; do not change one side only. See SECURITY.md.
 */
const NONCE_LEN = 16

/**
 * A gate id as 32 bytes. An empty, `0x`-only or all-zero id would namespace the content to gate
 * `0x0`, which nobody can ever unlock, so it is refused.
 */
function requireGateId(gateId: string): Uint8Array {
  if (typeof gateId !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(gateId)) {
    throw new Error('nft-gate encrypt requires `gateId` (0x followed by up to 64 hex digits).')
  }
  const bytes = objectIdBytes(gateId)
  if (bytes.every((b) => b === 0)) throw new Error('nft-gate gateId must not be the zero address.')
  return bytes
}

function descriptor(): PolicyDescriptor {
  return {
    type: 'nft-gate',
    label: 'Access-gate NFT',
    help: 'Only holders of a valid pass for the chosen access gate can decrypt.',
    encryptFields: [
      {
        name: 'gateId',
        label: 'Access gate ID',
        kind: 'objectId',
        required: true,
        help: 'The shared Gate object whose pass-holders may decrypt.',
      },
    ],
    decryptFields: [
      { name: 'gateId', label: 'Access gate ID', kind: 'objectId', required: true },
      { name: 'nftId', label: 'Your pass NFT', kind: 'objectId', required: true },
      { name: 'soulbound', label: 'Soulbound pass', kind: 'boolean', required: false },
    ],
  }
}

/**
 * Create an nft-gate policy provider.
 *
 * @param accessGateOriginalId - The `access_gate` package's **original id** on the target network
 *   (`accessGateDeployment(network).originalId` from `@meddleware/access-gate-client/deployments`).
 *   When non-empty, `suggest()` lists the gates the connected wallet administers.
 */
export function createNftGateProvider(accessGateOriginalId = ''): SealPolicyProvider<NftGateParams> {
  return {
    type: 'nft-gate',

    buildId(params) {
      return concatBytes(requireGateId(params.gateId), randomBytes(NONCE_LEN))
    },

    verifyId(idBytes, params) {
      // Layout `[32-byte gate id][16-byte nonce]` — anything else cannot have come from buildId.
      if (idBytes.length !== 32 + NONCE_LEN) {
        throw new Error(`seal-client: nft-gate id must be ${32 + NONCE_LEN} bytes ([gate id][nonce]); got ${idBytes.length}`)
      }
      const expected = objectIdBytes(params.gateId)
      for (let i = 0; i < 32; i++) {
        if (idBytes[i] !== expected[i]) {
          throw new Error(
            `seal-client: id/params mismatch — stored id does not match params.gateId (byte ${i} differs). ` +
            `The manifest may be corrupted or the wrong params were supplied.`,
          )
        }
      }
    },

    buildApprove(tx, target, idBytes, params) {
      if (!params.nftId) {
        throw new Error('nft-gate decrypt requires `nftId` (the pass you hold for this gate).')
      }
      const fn = params.soulbound ? 'seal_approve_soulbound' : 'seal_approve'
      tx.moveCall({
        target: `${target.publishedAt}::nft_gate::${fn}`,
        arguments: [
          tx.pure.vector('u8', Array.from(idBytes)),
          tx.object(target.policyConfigId),
          tx.object(params.gateId),
          tx.object(params.nftId),
        ],
      })
    },

    describe: descriptor,

    async suggest({ account, client }: SuggestContext): Promise<Partial<Record<string, FieldSuggestion[]>>> {
      if (!accessGateOriginalId || !account) return {}
      const gates = await fetchOwnedGates(client, account, accessGateOriginalId)
      if (!gates.length) return {}
      return {
        gateId: gates.map((g) => ({ value: g.gateId, label: g.nftName || g.gateId.slice(0, 10) + '…' })),
      }
    },
  }
}
