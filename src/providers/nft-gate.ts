import type { SealPolicyProvider, PolicyDescriptor } from '../types.js'
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

/**
 * Gate decryption on ownership of a valid access-gate pass. Mirrors `seal_policies::nft_gate`.
 * Identity layout: `[32-byte gate id][16-byte random nonce]`.
 */
export const nftGateProvider: SealPolicyProvider<NftGateParams> = {
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

  describe(): PolicyDescriptor {
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
  },
}
