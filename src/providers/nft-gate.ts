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

/** Random nonce appended after the 32-byte gate id so each ciphertext gets a unique identity. */
const NONCE_LEN = 16

/* eslint-disable @typescript-eslint/no-explicit-any */
function structFields(v: unknown): Record<string, any> | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, any>
  return o.fields && typeof o.fields === 'object' ? (o.fields as Record<string, any>) : o
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
 * @param accessGatePackageId - The deployed `access_gate` package ID for the target network.
 *   When non-empty, `suggest()` will query the chain for `AdminCap` objects owned by the
 *   connected wallet and surface the corresponding gates as selectable options.
 */
export function createNftGateProvider(accessGatePackageId = ''): SealPolicyProvider<NftGateParams> {
  return {
    type: 'nft-gate',

    buildId(params) {
      return concatBytes(objectIdBytes(params.gateId), randomBytes(NONCE_LEN))
    },

    buildApprove(tx, packageId, idBytes, params) {
      if (!params.nftId) {
        throw new Error('nft-gate decrypt requires `nftId` (the pass you hold for this gate).')
      }
      const fn = params.soulbound ? 'seal_approve_soulbound' : 'seal_approve'
      tx.moveCall({
        target: `${packageId}::nft_gate::${fn}`,
        arguments: [
          tx.pure.vector('u8', Array.from(idBytes)),
          tx.object(params.gateId),
          tx.object(params.nftId),
        ],
      })
    },

    describe: descriptor,

    async suggest({ account, client }: SuggestContext): Promise<Partial<Record<string, FieldSuggestion[]>>> {
      if (!accessGatePackageId || !account) return {}
      const { objects } = await client.core.listOwnedObjects({
        owner: account,
        type: `${accessGatePackageId}::access_gate::AdminCap`,
        include: { json: true },
      })
      const caps = objects
        .map((o) => {
          const f = structFields(o.json)
          const gateId = (f?.gate_id ?? f?.gateId) as string | undefined
          return gateId ? { gateId } : null
        })
        .filter((c): c is { gateId: string } => c !== null)
      if (!caps.length) return {}
      const gates = await Promise.all(
        caps.map(async ({ gateId }) => {
          try {
            const { object } = await client.core.getObject({ objectId: gateId, include: { json: true } })
            const f = structFields(object.json)
            const label = (f?.nft_name as string) || gateId.slice(0, 10) + '…'
            return { value: gateId, label }
          } catch {
            return { value: gateId, label: gateId.slice(0, 10) + '…' }
          }
        }),
      )
      return { gateId: gates }
    },
  }
}

/** @deprecated Use `createNftGateProvider(packageId)` — this zero-package-id fallback has no suggest capability. */
export const nftGateProvider: SealPolicyProvider<NftGateParams> = createNftGateProvider()
