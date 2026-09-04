import type { SealPolicyProvider, PolicyDescriptor } from '../types.js'
import { u64beBytes, randomBytes, concatBytes } from '../bytes.js'

export interface TimeLockParams {
  /** Unlock time in epoch milliseconds. Needed to encrypt; not needed to decrypt. */
  unlockMs?: number
}

/** The shared on-chain Clock object id. */
const CLOCK_ID = '0x6'
/** Random nonce appended after the 8-byte unlock timestamp. */
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
