import type { SealPolicyProvider, PolicyDescriptor } from '../types.js'
import { u64beBytes, randomBytes, concatBytes } from '../bytes.js'

export interface TimeLockParams {
  /** Unlock time in epoch milliseconds. Needed to encrypt; not needed to decrypt. */
  unlockMs?: number
}

/** The shared on-chain Clock object id. */
const CLOCK_ID = '0x6'
/**
 * Random nonce appended after the 8-byte unlock timestamp.
 *
 * Width rationale (8 bytes / 64 bits): the prefix is an 8-byte big-endian unlock timestamp, which
 * is low-entropy and frequently shared (many documents unlock at the same instant), so the nonce
 * disambiguates ciphertexts that share an unlock time. 64 bits is comfortably collision-safe for
 * the per-unlock-time population and keeps the identity compact and symmetric with the 8-byte
 * timestamp (total 16 bytes). As with nft-gate this is a uniqueness budget, not a secrecy one — the
 * identity is public in the manifest. The width is fixed by the on-chain
 * `seal_policies::timelock` identity layout `[8-byte BE unlock_ms][8-byte nonce]`; do not change one
 * side only. See SECURITY.md.
 */
const NONCE_LEN = 8

/**
 * Time-lock encryption: decryptable by anyone once the on-chain Clock passes the unlock time.
 * Mirrors `seal_policies::timelock`. Identity layout: `[8-byte BE unlock_ms][8-byte nonce]`.
 * Deliberately shares nothing with `nft-gate` — different fields, different args.
 */
export const timeLockProvider: SealPolicyProvider<TimeLockParams> = {
  type: 'time-lock',

  buildId(params) {
    if (params.unlockMs == null) {
      throw new Error('time-lock encrypt requires `unlockMs` (unlock time in epoch ms).')
    }
    return concatBytes(u64beBytes(params.unlockMs), randomBytes(NONCE_LEN))
  },

  buildApprove(tx, packageId, idBytes) {
    tx.moveCall({
      target: `${packageId}::timelock::seal_approve`,
      arguments: [tx.pure.vector('u8', Array.from(idBytes)), tx.object(CLOCK_ID)],
    })
  },

  describe(): PolicyDescriptor {
    return {
      type: 'time-lock',
      label: 'Time lock',
      help: 'Anyone can decrypt once the unlock time has passed.',
      encryptFields: [
        {
          name: 'unlockMs',
          label: 'Unlock time',
          kind: 'datetime',
          required: true,
          help: 'The ciphertext becomes decryptable at this moment.',
        },
      ],
      decryptFields: [],
    }
  },
}
