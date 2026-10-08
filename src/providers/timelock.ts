import type { SealPolicyProvider, PolicyDescriptor } from '../types.js'
import { u64beBytes, randomBytes, concatBytes } from '../bytes.js'

export interface TimeLockParams {
  /** Unlock time in epoch milliseconds. Needed to encrypt; not needed to decrypt. */
  unlockMs?: number | bigint
  /**
   * Allow an unlock time that has already passed. By default encrypting with a past time throws:
   * content "locked" until a moment that is gone is public as soon as it is stored.
   */
  allowPast?: boolean
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
    // u64beBytes rejects non-integers, negatives and anything that would wrap past 2^64 - 1.
    const unlock = u64beBytes(params.unlockMs)
    if (!params.allowPast && BigInt(params.unlockMs) <= BigInt(Date.now())) {
      throw new Error('time-lock unlockMs is not in the future; pass allowPast: true if that is intended.')
    }
    return concatBytes(unlock, randomBytes(NONCE_LEN))
  },

  verifyId(idBytes) {
    // Layout `[8-byte BE unlock_ms][8-byte nonce]` — anything else cannot have been produced by
    // buildId and would be rejected on-chain.
    if (idBytes.length !== 8 + NONCE_LEN) {
      throw new Error(
        `seal-client: time-lock id must be ${8 + NONCE_LEN} bytes ([unlock_ms][nonce]); got ${idBytes.length}`,
      )
    }
  },

  buildApprove(tx, target, idBytes) {
    tx.moveCall({
      target: `${target.publishedAt}::timelock::seal_approve`,
      arguments: [tx.pure.vector('u8', Array.from(idBytes)), tx.object(target.policyConfigId), tx.object(CLOCK_ID)],
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
